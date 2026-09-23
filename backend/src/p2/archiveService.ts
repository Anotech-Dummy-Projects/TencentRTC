import { prisma } from "../db.js";
import type { ArchiveResult, ConversationGroup } from "./types.js";
import { tencentApi, type TencentMessage } from "./tencentApi.js";
import { uploadSessionArchive } from "./s3Uploader.js";

// Only these Tencent element types are archiveable chat content for the Part 5 JSON payload.
const ARCHIVEABLE_MESSAGE_TYPES = [
  "TIMTextElem",
  "TIMImageElem",
  "TIMFileElem",
  "TIMSoundElem",
];

/** Checks the unmodified Tencent MsgBody array; custom/control elements are deliberately excluded. */
function hasArchiveableMessageBody(msg: TencentMessage): boolean {
  return msg.MsgBody.some((elem) => {
    if (typeof elem !== "object" || elem === null) return false;
    const msgType = (elem as { MsgType?: unknown }).MsgType;
    return typeof msgType === "string" && ARCHIVEABLE_MESSAGE_TYPES.includes(msgType);
  });
}

/** Produces a safe type label for every raw MsgBody element in the diagnostic preview. */
function getMessageElementType(elem: unknown): string {
  if (typeof elem !== "object" || elem === null) return "<non-object>";
  const msgType = (elem as { MsgType?: unknown }).MsgType;
  return typeof msgType === "string" ? msgType : "<missing MsgType>";
}

export class ArchiveService {
  /**
   * Finished session ko pending archive queue mein add karta hai.
   * Session row reuse hone par existing archive row ko dobara PENDING banata hai.
   * Testing ke liye 3 pending sessions par background batch trigger hoga;
   * production mein threshold ko 35 karna hai.
   */
  async enqueueSession(sessionId: string): Promise<void> {
    try {
      // 1. ActiveSession se archive ke liye required session details verify/fetch karo.
      const session = await prisma.activeSession.findUnique({
        where: { id: sessionId },
        select: {
          initiatorId: true,
          receiverId: true,
          startedAt: true,
          endedAt: true,
        },
      });

      if (!session) {
        console.warn(`[Archive] Session ${sessionId} not found in ActiveSession.`);
        return;
      }

      // 2. Queue row create karo, ya reused ActiveSession ke existing ARCHIVED/FAILED row ko re-queue karo.
      await prisma.pendingArchive.upsert({
        where: { sessionId },
        update: {
          status: "PENDING",
          retryCount: 0,
          lastError: null,
        },
        create: {
          sessionId,
          status: "PENDING",
          retryCount: 0,
        },
      });

      console.log(`[Archive] Session ${sessionId} enqueued successfully.`);

      // 3. Testing threshold 3 hai; production mein ise 35 par switch karna hai.
      const ARCHIVE_THRESHOLD = 3;
      const pendingCount = await prisma.pendingArchive.count({
        where: { status: "PENDING" },
      });

      if (pendingCount >= ARCHIVE_THRESHOLD) {
        console.log(
          `[Archive] ⚡ Threshold reached (${pendingCount}/${ARCHIVE_THRESHOLD})! Starting batch processing...`
        );
        // Background process response ko block nahi karega; future parts real archive work add karenge.
        this.processArchiveBatch().catch((err) =>
          console.error("[Archive] Batch processing failed:", err)
        );
      } else {
        console.log(`[Archive] Queue size: ${pendingCount}/${ARCHIVE_THRESHOLD}. Waiting...`);
      }
    } catch (error) {
      console.error(`[Archive] Failed to enqueue session ${sessionId}:`, error);
    }
  }

  /**
   * Pending queue ke oldest sessions ko deterministic conversation pair ke hisaab se group karta hai.
   * Har group ka widest session time range Tencent history request ke liye calculate hota hai.
   */
  async getUniqueConversationGroups(limit: number = 35): Promise<ConversationGroup[]> {
    // 1. Oldest PENDING rows plus related users ke Tencent-compatible userIds fetch karo.
    const pendingSessions = await prisma.pendingArchive.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: {
        session: {
          include: {
            initiator: { select: { userId: true } },
            receiver: { select: { userId: true } },
          },
        },
      },
    });

    if (pendingSessions.length === 0) return [];

    // 2. Sorted Tencent userIds use karke A-B aur B-A ko ek hi C2C conversation group mein rakho.
    const groupMap = new Map<string, ConversationGroup>();

    for (const pendingArchive of pendingSessions) {
      const session = pendingArchive.session;
      if (!session) continue;

      const initiatorUserId = session.initiator.userId.trim();
      const receiverUserId = session.receiver.userId.trim();
      if (!initiatorUserId || !receiverUserId) {
        console.warn(
          `[Archive] Skipping session ${session.id}: Tencent userId missing for one or both participants.`
        );
        continue;
      }

      // Critical: key mein sirf sorted Tencent userIds hain, never DB UUID/session/room ID.
      // Isse userA→userB aur userB→userA same Tencent C2C conversation mein group honge.
      const ids = [initiatorUserId, receiverUserId].sort();
      const conversationKey = `C2C_${ids[0]}_${ids[1]}`;
      const minTime = Math.floor(session.startedAt.getTime() / 1000);
      const endedAt = session.endedAt ?? new Date();
      const maxTime = Math.floor(endedAt.getTime() / 1000);

      if (!groupMap.has(conversationKey)) {
        groupMap.set(conversationKey, {
          conversationKey,
          sessions: [],
          minTime,
          maxTime,
        });
      }

      const group = groupMap.get(conversationKey)!;
      group.sessions.push({
        id: pendingArchive.id,
        sessionId: session.id,
        initiatorUserId,
        receiverUserId,
        initiatorDbId: session.initiatorId,
        receiverDbId: session.receiverId,
        startedAt: session.startedAt,
        endedAt,
      });
      group.minTime = Math.min(group.minTime, minTime);
      group.maxTime = Math.max(group.maxTime, maxTime);
    }

    for (const group of groupMap.values()) {
      console.log(
        `[Archive] Conversation ${group.conversationKey} uses Tencent userIds: ${group.sessions[0]?.initiatorUserId} ↔ ${group.sessions[0]?.receiverUserId}`
      );
    }

    console.log(
      `[Archive] Grouped ${pendingSessions.length} sessions into ${groupMap.size} unique conversations.`
    );
    return Array.from(groupMap.values());
  }

  /**
   * Group ki Tencent C2C history fetch karke har finished session ka message count log karta hai.
   * TODO (Part 5): Session-wise sliced messages ko S3 par upload karna aur queue status update karna.
   */
  async processConversationGroup(group: ConversationGroup): Promise<void> {
    console.log(
      `[Archive] Fetching history for ${group.conversationKey} (${group.sessions.length} sessions)`
    );

    try {
      // Session mein stored Tencent userIds use karo; key parse nahi karte because IDs may contain underscores.
      const firstSession = group.sessions[0];
      if (!firstSession) {
        console.warn(`[Archive] Skipping empty conversation group: ${group.conversationKey}`);
        return;
      }
      // fetch history!
      const messages = await tencentApi.fetchFullHistory({
        Operator_Account: firstSession.initiatorUserId,
        Peer_Account: firstSession.receiverUserId,
        MinTime: group.minTime,
        MaxTime: group.maxTime,
      });

      console.log(`[Archive] Received ${messages.length} messages for ${group.conversationKey}`);

      // Raw response diagnostic: inspect Tencent's exact MsgBody shape BEFORE any filtering happens.
      console.log("\n[Archive] ══════════ RAW TENCENT MsgBody DEBUG (FIRST 5) ══════════");
      messages.slice(0, 5).forEach((message, index) => {
        console.log(
          `[Archive] Raw message ${index + 1} MsgTypes: ${JSON.stringify(message.MsgBody.map(getMessageElementType))}`
        );
        console.log(`[Archive] Raw message ${index + 1} MsgBody:`);
        console.log(JSON.stringify(message.MsgBody, null, 2));
      });
      console.log("[Archive] ══════════ END RAW TENCENT MsgBody DEBUG ══════════\n");

      // This runs directly on the raw fetched `messages` array, before time/session filtering.
      const archiveableRawMessages = messages.filter((msg) => hasArchiveableMessageBody(msg));
      console.log(
        `[Archive] Supported content check (TIMTextElem/TIMImageElem/TIMFileElem/TIMSoundElem): ${archiveableRawMessages.length}/${messages.length} raw messages pass.`
      );

      // Part 5: every session gets its own clean JSON S3 object and audit metadata after upload succeeds.
      for (const session of group.sessions) {
        const sessionStart = Math.floor(session.startedAt.getTime() / 1000);
        const sessionEnd = Math.floor(session.endedAt.getTime() / 1000);
        // Timestamp + supported content check both apply to the original raw Tencent array.
        const sessionMessages = messages.filter(
          (msg) =>
            msg.MsgTimeStamp >= sessionStart &&
            msg.MsgTimeStamp <= sessionEnd &&
            hasArchiveableMessageBody(msg)
        );

        console.log(`  ↳ Session ${session.sessionId}: ${sessionMessages.length} messages`);

        try {
          // Upload only the clean, pre-filtered JSON: no typing/control elements are included.
          const s3Key = await uploadSessionArchive(session.sessionId, sessionMessages);
          const archivedAt = new Date();
          const durationSecs = Math.max(
            0,
            Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)
          );

          // Existing schema stores S3 key and archival timestamp in SessionAuditLog.
          // PendingArchive keeps only queue state, retries, and error details.
          await prisma.$transaction([
            prisma.sessionAuditLog.upsert({
              where: { sessionId: session.sessionId },
              update: {
                s3Key,
                messageCount: sessionMessages.length,
                startedAt: session.startedAt,
                endedAt: session.endedAt,
                durationSecs,
                initiatorId: session.initiatorDbId,
                receiverId: session.receiverDbId,
                archivedAt,
              },
              create: {
                sessionId: session.sessionId,
                s3Key,
                messageCount: sessionMessages.length,
                startedAt: session.startedAt,
                endedAt: session.endedAt,
                durationSecs,
                initiatorId: session.initiatorDbId,
                receiverId: session.receiverDbId,
                archivedAt,
              },
            }),
            prisma.pendingArchive.updateMany({
              where: { sessionId: session.sessionId },
              data: {
                status: "ARCHIVED",
                retryCount: 0,
                lastError: null,
              },
            }),
          ]);

          console.log(`[Archive] Session ${session.sessionId} archived successfully.`);
        } catch (error: any) {
          // Failed upload or DB persistence is retryable; retain a bounded diagnostic message.
          await prisma.pendingArchive.updateMany({
            where: { sessionId: session.sessionId },
            data: {
              status: "FAILED",
              retryCount: { increment: 1 },
              lastError: (error.message || "Unknown error").substring(0, 500),
            },
          });
          console.error(`[Archive] Failed to archive session ${session.sessionId}:`, error.message);
          throw error; // Promise.allSettled handles a failed conversation without stopping sibling groups.
        }
      }
    } catch (error) {
      console.error(`[Archive] Failed to process group ${group.conversationKey}:`, error);
      throw error;
    }
  }

  /**
   * Pending archive queue ko bounded parallel batches mein process karta hai.
   * Har batch ke andar exactly 3 independent Tencent conversations saath run hoti hain;
   * batches khud sequential rehte hain, so concurrency controlled aur predictable hai.
   */
  async processArchiveBatch(): Promise<ArchiveResult> {
    const pendingCount = await prisma.pendingArchive.count({
      where: { status: "PENDING" },
    });
    const batchSize = Math.min(pendingCount, 35);

    if (batchSize === 0) {
      return { success: true, processedCount: 0, errors: [] };
    }

    console.log(`[Archive] Processing batch of ${batchSize} sessions...`);
    const groups = await this.getUniqueConversationGroups(batchSize);

    // Exactly three conversations ek saath: external Tencent requests bounded rehte hain.
    const BATCH_SIZE = 3;
    const results: ArchiveResult = { success: true, processedCount: 0, errors: [] };

    // Each chunk waits before the next one begins; this preserves controlled sequential fallback behavior.
    for (let i = 0; i < groups.length; i += BATCH_SIZE) {
      const batch = groups.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      console.log(
        `[Archive] ⚡ Processing parallel batch ${batchNumber} (${batch.length} conversations)`
      );

      // allSettled ensures one failed C2C fetch does not cancel other conversations in this batch.
      const batchResults = await Promise.allSettled(
        batch.map((group) => this.processConversationGroup(group))
        
      );

      batchResults.forEach((result, index) => {
        const group = batch[index];
        if (!group) return;

        if (result.status === "fulfilled") {
          results.processedCount++;
          console.log(`[Archive] ✅ Batch ${batchNumber}, Conv ${index + 1}: Success`);
          return;
        }

        results.success = false;
        const errorMsg = result.reason instanceof Error
          ? result.reason.message
          : "Unknown error";
        results.errors.push({ sessionId: group.conversationKey, error: errorMsg });
        console.error(`[Archive] ❌ Batch ${batchNumber}, Conv ${index + 1}: ${errorMsg}`);
      });
    }

    console.log(
      `[Archive] Batch complete. Processed: ${results.processedCount}, Errors: ${results.errors.length}`
    );
    return results;
  }
}

// Singleton export, taaki session handler, cron aur future workers same service use karein.
export const archiveService = new ArchiveService();

// Session module ke liye concise future-facing enqueue entry point.
export async function enqueueSession(sessionId: string): Promise<void> {
  await archiveService.enqueueSession(sessionId);
}
