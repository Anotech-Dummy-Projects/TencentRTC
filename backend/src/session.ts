import { Router } from "express";
import { prisma } from "./db.js";
import { authenticateJWT } from "./chat.js";
import { emitToUser } from "./socketServer.js";

export const sessionRouter = Router();

// Constants
const THREE_MINUTES_MS = 3 * 60 * 1000;    // Request expiry (invite timeout)
const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // Session inactivity timeout (3 mins)

/**
 * Format duration between two timestamps into "{X}m {Y}s" (e.g. "4m 12s", "0m 45s")
 */
function formatDuration(
  start?: Date | string | number | null,
  end?: Date | string | number | null
): string {
  if (!start || !end) return "Unknown";
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (isNaN(startMs) || isNaN(endMs) || endMs < startMs) {
    return "Unknown";
  }
  const totalSeconds = Math.floor((endMs - startMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Format a Date to "HH:mm:ss" in 24-hour format
 */
function formatTime(date: Date = new Date()): string {
  return date.toTimeString().split(" ")[0] || "00:00:00";
}

// ------------------------------------------------------------------
// cleanupInactiveSessions()
// ------------------------------------------------------------------
// Finds all ACTIVE sessions where lastActive is older than INACTIVITY_TIMEOUT_MS,
// marks them ENDED, and emits session_ended to both users via Socket.io.
//
// Called:
//   1. Every 60 seconds via setInterval (started in index.ts)
//   2. Inline before accepting a new session (prevents zombie blocks)
//
// @param forUserIds  Optional user IDs to scope the cleanup to any stale
//                    session involving either user (avoids a full-table scan
//                    when checking invite availability).
// ------------------------------------------------------------------
export async function cleanupInactiveSessions(
  forUserIds?: [string, string]
): Promise<void> {
  const cutoff = new Date(Date.now() - INACTIVITY_TIMEOUT_MS);

  const whereClause: any = {
    status: "ACTIVE",
    lastActive: { lt: cutoff },
  };

  // A person is not available while a stale session with anyone is still
  // marked ACTIVE, so scope this to every session involving either user.
  if (forUserIds) {
    const [a, b] = forUserIds;
    whereClause.OR = [
      { initiatorId: { in: [a, b] } },
      { receiverId: { in: [a, b] } },
    ];
  }

  const staleSessions = await prisma.activeSession.findMany({
    where: whereClause,
    include: {
      initiator: { select: { userId: true } },
      receiver: { select: { userId: true } },
    },
  });

  if (staleSessions.length === 0) return;

  const now = new Date();
  // Batch-update all stale sessions to ENDED and retain the timestamp for the
  // metadata-only admin audit timeline.
  await prisma.activeSession.updateMany({
    where: { id: { in: staleSessions.map((s) => s.id) } },
    data: { status: "ENDED", endedAt: now },
  });

  // Notify both sides of each expired session
  for (const session of staleSessions) {
    const payload = { sessionId: session.id, reason: "inactivity_timeout" };
    emitToUser(session.initiatorId, "session_ended", payload);
    emitToUser(session.receiverId, "session_ended", payload);

    const duration = session.startedAt ? formatDuration(session.startedAt, now) : "Unknown";
    console.log(
      `[Session] Ended (Inactivity) | Users: ${session.initiator?.userId || "Unknown"} ↔ ${session.receiver?.userId || "Unknown"} | Active For: ${duration} | Timeout: ${formatTime(now)}`
    );
  }
}

/**
 * An ACTIVE session is the source of truth for a user's busy state. Keeping a
 * separate mutable isBusy flag would risk it getting out of sync on session end.
 */
async function findBusySession(userIds: [string, string]) {
  return prisma.activeSession.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { initiatorId: { in: userIds } },
        { receiverId: { in: userIds } },
      ],
    },
  });
}

function displayName(user: { firstName?: string | null; lastName?: string | null; userId: string }): string {
  const name = `${user.firstName || ""} ${user.lastName || ""}`.trim();
  return name || user.userId;
}

function busyError(
  busySession: { initiatorId: string; receiverId: string },
  currentUserId: string,
  otherUser: { id: string; firstName?: string | null; lastName?: string | null; userId: string }
): string {
  if (busySession.initiatorId === currentUserId || busySession.receiverId === currentUserId) {
    return "You are busy in another conversation.";
  }

  return `${displayName(otherUser)} is busy in another conversation.`;
}


// ------------------------------------------------------------------
// 1. Send Chat Request (Invite) — Optimized for Scale & No Errors
// ------------------------------------------------------------------
sessionRouter.post("/invite", authenticateJWT, async (req, res) => {
  try {
    const senderId = req.user?.id;
    const senderUserId = req.user?.userId || "Unknown";
    if (!senderId) return res.status(401).json({ error: "Unauthorized" });

    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: "Target User ID required" });

    const targetUser = await prisma.user.findUnique({ 
      where: { userId: targetUserId.trim() } 
    });

    if (!targetUser) return res.status(404).json({ error: "User not found" });
    if (targetUser.id === senderId) return res.status(400).json({ error: "Cannot chat with yourself" });

    // A 1:1 session reserves both participants. Do not create or deliver an
    // invite unless the sender and target are both available.
    await cleanupInactiveSessions([senderId, targetUser.id]);
    const busySession = await findBusySession([senderId, targetUser.id]);
    if (busySession) {
      return res.status(409).json({
        error: busyError(busySession, senderId, targetUser),
      });
    }

    // Find the LATEST request between these two users (any status, any direction)
    const latestRequest = await prisma.sessionRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: senderId }
        ]
      },
      orderBy: { updatedAt: 'desc' }
    });

    // CASE A: Existing request found
    if (latestRequest) {
      const ageMs = Date.now() - new Date(latestRequest.updatedAt).getTime();
      const isExpired = ageMs > THREE_MINUTES_MS;

      // If PENDING, NOT expired, and in the same direction → Just refresh timestamp
      if (latestRequest.status === "PENDING" && !isExpired && latestRequest.senderId === senderId) {
        const refreshed = await prisma.sessionRequest.update({
          where: { id: latestRequest.id },
          data: { updatedAt: new Date() },
          include: { sender: { select: { firstName: true, lastName: true, userId: true } } }
        });
        // Re-emit in case the receiver missed the first push
        emitToUser(targetUser.id, "incoming_request", {
          id: refreshed.id,
          senderId,
          receiverId: targetUser.id,
          status: "PENDING",
          createdAt: refreshed.createdAt,
          sender: {
            firstName: refreshed.sender.firstName,
            lastName: refreshed.sender.lastName,
            userId: refreshed.sender.userId,
          },
        });
        console.log(`[Session] Invite Refreshed | From: ${senderUserId} → To: ${targetUser.userId} | Status: PENDING`);
        return res.json({ message: "Invitation refreshed", request: refreshed });
      }

      // If REJECTED/ENDED, Expired, or from reverse direction → UPDATE existing record back to PENDING with current sender and receiver
      const reused = await prisma.sessionRequest.update({
        where: { id: latestRequest.id },
        data: {
          senderId,
          receiverId: targetUser.id,
          status: "PENDING",
          updatedAt: new Date(),
          createdAt: new Date()
        },
        include: { sender: { select: { firstName: true, lastName: true, userId: true } } }
      });

      // Emit to receiver so they see the new invite without polling
      emitToUser(targetUser.id, "incoming_request", {
        id: reused.id,
        senderId,
        receiverId: targetUser.id,
        status: "PENDING",
        createdAt: reused.createdAt,
        sender: {
          firstName: reused.sender.firstName,
          lastName: reused.sender.lastName,
          userId: reused.sender.userId,
        },
      });

      console.log(`[Session] Invite Sent | From: ${senderUserId} → To: ${targetUser.userId} | Status: PENDING`);
      return res.json({ message: "New invitation sent (reused)", request: reused });
    }

    // CASE B: No existing request at all → Create fresh
    const request = await prisma.sessionRequest.create({
      data: {
        senderId,
        receiverId: targetUser.id,
        status: "PENDING"
      },
      include: {
        sender: { select: { firstName: true, lastName: true, userId: true } }
      }
    });

    // Emit real-time event to receiver so they see the invite instantly (no polling)
    emitToUser(targetUser.id, "incoming_request", {
      id: request.id,
      senderId,
      receiverId: targetUser.id,
      status: "PENDING",
      createdAt: request.createdAt,
      sender: {
        firstName: request.sender.firstName,
        lastName: request.sender.lastName,
        userId: request.sender.userId,
      },
    });

    console.log(`[Session] Invite Sent | From: ${senderUserId} → To: ${targetUser.userId} | Status: PENDING`);
    return res.json({ message: "Invitation sent", request });

  } catch (error: any) {
    console.error("Invite Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// 2. Check Status (Active Session + Incoming Requests)
// ------------------------------------------------------------------
sessionRouter.get("/status", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    
    // Active Session
    const activeSession = await prisma.activeSession.findFirst({
      where: {
        OR: [{ initiatorId: userId }, { receiverId: userId }],
        status: "ACTIVE"
      },
      include: {
        initiator: { select: { firstName: true, lastName: true, userId: true } },
        receiver: { select: { firstName: true, lastName: true, userId: true } }
      }
    });

    // Incoming Requests
    const incomingRequests = await prisma.sessionRequest.findMany({
      where: { receiverId: userId, status: "PENDING" },
      include: { sender: { select: { firstName: true, lastName: true, userId: true } } },
      orderBy: { createdAt: 'desc' }
    });

    let partner = null;
    if (activeSession) {
      const isReceiver = activeSession.receiverId === userId;
      partner = isReceiver ? activeSession.initiator : activeSession.receiver;
    }

    return res.json({
      activeSession: activeSession ? {
        id: activeSession.id,
        isReceiver: activeSession.receiverId === userId,
        partner
      } : null,
      incomingRequests
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// 3. Respond to Request (Accept/Reject)
// ------------------------------------------------------------------
sessionRouter.post("/respond", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    const { requestId, action } = req.body;

    const request = await prisma.sessionRequest.findUnique({
      where: { id: requestId },
      include: { sender: true }
    });

    if (!request || request.receiverId !== userId) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (action === "REJECT") {
      await prisma.sessionRequest.update({ 
        where: { id: requestId }, 
        data: { status: "REJECTED" } 
      });

      // Notify sender in real-time that their request was rejected
      emitToUser(request.senderId, "request_rejected", {
        requestId,
        rejectedBy: userId,
      });

      const receiverUserId = req.user?.userId || "Unknown";
      console.log(`[Session] Rejected | From: ${receiverUserId} → To: ${request.sender.userId} | Reason: Declined`);

      return res.json({ 
        message: "Request rejected",
        sender: {
          id: request.sender.id,
          userId: request.sender.userId,
          name: `${request.sender.firstName || ""} ${request.sender.lastName || ""}`.trim()
        }
      });
    }

    if (action === "ACCEPT") {
      // 0. Re-check when accepting: either user may have started another chat
      // after this invitation was originally sent.
      await cleanupInactiveSessions([request.senderId, userId!]);

      const busySession = await findBusySession([request.senderId, userId!]);
      if (busySession) {
        return res.status(409).json({
          error: busyError(busySession, userId!, request.sender),
        });
      }

      // 1. Check if ANY session record exists for this pair (Active or Ended)
      const existingSession = await prisma.activeSession.findFirst({
        where: {
          OR: [
            { initiatorId: request.senderId, receiverId: userId },
            { initiatorId: userId, receiverId: request.senderId }
          ]
        }
      });

      let newSession;

      if (existingSession) {
        // CASE A: Record exists → UPDATE it back to ACTIVE (Reuse existing row)
        // CRITICAL: Always update initiatorId and receiverId to match the current request!
        // This ensures the current accepter is the receiver, and current requester is the initiator.
        newSession = await prisma.activeSession.update({
          where: { id: existingSession.id },
          data: {
            initiatorId: request.senderId,
            receiverId: userId!,
            status: "ACTIVE",
            startedAt: new Date(),
            lastActive: new Date()
          }
        });
      } else {
        // CASE B: No record exists → CREATE fresh
        newSession = await prisma.activeSession.create({
          data: {
            initiatorId: request.senderId,
            receiverId: userId!,
            status: "ACTIVE",
            lastActive: new Date()
          }
        });
      }

      await prisma.sessionRequest.update({
        where: { id: requestId },
        data: { status: "ACCEPTED" }
      });

      // Get partner info to include in socket payload (receiver's partner = the initiator)
      const initiatorInfo = await prisma.user.findUnique({
        where: { id: request.senderId },
        select: { firstName: true, lastName: true, userId: true }
      });
      const receiverInfo = await prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, userId: true }
      });

      const sessionPayload = {
        sessionId: newSession.id,
      };

      // Notify INITIATOR (sender): their session is now live, here's the partner info
      emitToUser(request.senderId, "session_updated", {
        ...sessionPayload,
        isReceiver: false,
        partner: {
          firstName: receiverInfo?.firstName,
          lastName: receiverInfo?.lastName,
          userId: receiverInfo?.userId,
        },
      });

      // Notify RECEIVER (accepter): session confirmed (redundant but keeps state in sync)
      emitToUser(userId!, "session_updated", {
        ...sessionPayload,
        isReceiver: true,
        partner: {
          firstName: initiatorInfo?.firstName,
          lastName: initiatorInfo?.lastName,
          userId: initiatorInfo?.userId,
        },
      });

      const now = new Date();
      const waitDuration = request.createdAt ? formatDuration(request.createdAt, now) : "Unknown";
      const initiatorUserId = initiatorInfo?.userId || request.sender.userId || "Unknown";
      const receiverUserId = receiverInfo?.userId || req.user?.userId || "Unknown";

      console.log(
        `[Session] Accepted | Users: ${initiatorUserId} ↔ ${receiverUserId} | Room: ${newSession.id} | Duration: ${waitDuration} | Started: ${formatTime(now)}`
      );

      return res.json({ 
        message: "Session started", 
        sessionId: newSession.id,
        partner: {
          userId: request.sender.userId,
          name: `${request.sender.firstName} ${request.sender.lastName}`
        }
      });
    }
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// 4. End Session (Only Receiver can end)
// ------------------------------------------------------------------
sessionRouter.post("/end", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    let { sessionId } = req.body || {};

    let session = null;
    if (sessionId) {
      session = await prisma.activeSession.findUnique({
        where: { id: sessionId },
        include: {
          initiator: { select: { userId: true } },
          receiver: { select: { userId: true } },
        },
      });
    } else {
      session = await prisma.activeSession.findFirst({
        where: {
          OR: [{ initiatorId: userId }, { receiverId: userId }],
          status: "ACTIVE",
        },
        include: {
          initiator: { select: { userId: true } },
          receiver: { select: { userId: true } },
        },
      });
      if (session) sessionId = session.id;
    }
    
    if (!session || session.status !== "ACTIVE") {
      return res.status(404).json({ error: "Session not found or already ended" });
    }

    // STRICT CHECK: Only Receiver can end
    if (session.receiverId !== userId) {
      return res.status(403).json({ error: "Only the receiver can end this session" });
    }

    const now = new Date();
    await prisma.activeSession.update({
      where: { id: sessionId },
      data: { status: "ENDED", endedAt: now }
    });

    // Notify BOTH users via socket that the session has ended
    // The frontend will reset state and navigate to start-conversation
    emitToUser(session.initiatorId, "session_ended", { sessionId });
    emitToUser(session.receiverId, "session_ended", { sessionId });

    const duration = session.startedAt ? formatDuration(session.startedAt, now) : "Unknown";
    console.log(
      `[Session] Ended (Manual) | Users: ${session.initiator?.userId || "Unknown"} ↔ ${session.receiver?.userId || "Unknown"} | Active For: ${duration} | Ended: ${formatTime(now)}`
    );

    return res.json({ message: "Session ended successfully" });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// ------------------------------------------------------------------
// 5. Heartbeat — Update lastActive to prevent inactivity timeout
// ------------------------------------------------------------------
// Called by the frontend whenever a message is sent or received.
// Resets the 3-minute inactivity countdown for the session.
// ------------------------------------------------------------------
sessionRouter.post("/heartbeat", authenticateJWT, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Update the active session for this user (either role)
    const updated = await prisma.activeSession.updateMany({
      where: {
        OR: [{ initiatorId: userId }, { receiverId: userId }],
        status: "ACTIVE",
      },
      data: { lastActive: new Date() },
    });

    if (updated.count === 0) {
      // No active session found — not an error, just silently ignore
      return res.json({ ok: true, updated: 0 });
    }

    return res.json({ ok: true, updated: updated.count });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

// ------------------------------------------------------------------
// DEPRECATED: Backend Message Endpoints (Frontend now uses Pure TRTC)
// Keeping these commented out to prevent accidental usage.
// ------------------------------------------------------------------
/*
export interface EphemeralMessage {
  id: string;
  sessionId: string;
  senderId: string;
  senderName: string;
  senderInitials: string;
  text: string;
  time: string;
  createdAt: number;
}

export const sessionMessagesStore = new Map<string, EphemeralMessage[]>();

sessionRouter.post("/messages", authenticateJWT, async (req, res) => { ... });
sessionRouter.get("/messages", authenticateJWT, async (req, res) => { ... });
*/
