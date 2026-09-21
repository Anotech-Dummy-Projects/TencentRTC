import { Router } from "express";
import { prisma } from "./db.js";
import { authenticateJWT } from "./chat.js";

export const adminRouter = Router();

const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function readPositiveInt(value: unknown, fallback: number, maximum: number): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function readDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function isTimeout(lastActive: Date, endedAt: Date | null): boolean {
  return Boolean(endedAt && endedAt.getTime() - lastActive.getTime() >= INACTIVITY_TIMEOUT_MS);
}

// The current User schema has no role column. Authentication is enforced here;
// add a role claim/check in this middleware once roles exist in the auth model.
adminRouter.use(authenticateJWT);

/**
 * Lists session metadata only. ActiveSession is used as the primary source so
 * sessions are visible before the future cloud archive creates an audit row.
 * Message bodies and S3 object content are deliberately excluded.
 */
adminRouter.get("/sessions", async (req, res) => {
  try {
    const page = readPositiveInt(req.query.page, 1, Number.MAX_SAFE_INTEGER);
    const limit = readPositiveInt(req.query.limit, DEFAULT_LIMIT, MAX_LIMIT);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const participantId = typeof req.query.participantId === "string" ? req.query.participantId.trim() : "";
    const durationMin = readPositiveInt(req.query.durationMin, 0, Number.MAX_SAFE_INTEGER);
    const dateFrom = readDate(req.query.dateFrom);
    const dateTo = readDate(req.query.dateTo);

    if ((typeof req.query.dateFrom === "string" && req.query.dateFrom && !dateFrom) ||
        (typeof req.query.dateTo === "string" && req.query.dateTo && !dateTo)) {
      return res.status(400).json({ error: "dateFrom and dateTo must be valid dates" });
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return res.status(400).json({ error: "dateFrom must be on or before dateTo" });
    }

    const andFilters: any[] = [];
    if (search) {
      andFilters.push({
        OR: [
          { id: { contains: search, mode: "insensitive" } },
          { initiator: { userId: { contains: search, mode: "insensitive" } } },
          { receiver: { userId: { contains: search, mode: "insensitive" } } },
        ],
      });
    }
    if (participantId) {
      andFilters.push({
        OR: [
          { initiator: { userId: { contains: participantId, mode: "insensitive" } } },
          { receiver: { userId: { contains: participantId, mode: "insensitive" } } },
        ],
      });
    }
    if (dateFrom || dateTo) {
      andFilters.push({
        startedAt: {
          ...(dateFrom ? { gte: dateFrom } : {}),
          ...(dateTo ? { lte: endOfDay(dateTo) } : dateFrom ? { lte: endOfDay(dateFrom) } : {}),
        },
      });
    }

    const where = andFilters.length > 0 ? { AND: andFilters } : {};
    const sessions = await prisma.activeSession.findMany({
      where,
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        lastActive: true,
        status: true,
        initiator: { select: { userId: true } },
        receiver: { select: { userId: true } },
      },
    });

    const now = new Date();
    const metadata = sessions
      .map((session) => ({
        ...session,
        durationSecs: Math.max(0, Math.floor(((session.endedAt ?? now).getTime() - session.startedAt.getTime()) / 1000)),
      }))
      .filter((session) => durationMin === 0 || session.durationSecs >= durationMin * 60);
    const total = metadata.length;
    const pageSessions = metadata.slice((page - 1) * limit, page * limit);
    const auditLogs = await prisma.sessionAuditLog.findMany({
      where: { sessionId: { in: pageSessions.map((session) => session.id) } },
      select: { sessionId: true, archivedAt: true },
    });
    const auditBySessionId = new Map(auditLogs.map((auditLog) => [auditLog.sessionId, auditLog]));

    return res.json({
      items: pageSessions.map((session) => {
        const timeout = isTimeout(session.lastActive, session.endedAt);
        const auditLog = auditBySessionId.get(session.id);
        return {
          id: session.id,
          participants: [session.initiator.userId, session.receiver.userId],
          startTime: session.startedAt,
          endTime: session.endedAt,
          durationSecs: session.durationSecs,
          status: session.status === "ACTIVE" ? "Active" : timeout ? "Timeout" : "Ended",
          archivedAt: auditLog?.archivedAt ?? null,
        };
      }),
      page,
      limit,
      total,
    });
  } catch (error: any) {
    console.error("[Admin] Failed to list session metadata:", error);
    return res.status(500).json({ error: "Failed to load session metadata" });
  }
});

/** Derives a read-only lifecycle timeline from existing relational metadata. */
adminRouter.get("/sessions/:id/timeline", async (req, res) => {
  try {
    const sessionId = req.params.id;
    const [session, auditLog] = await Promise.all([
      prisma.activeSession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          initiatorId: true,
          receiverId: true,
          startedAt: true,
          lastActive: true,
          endedAt: true,
          status: true,
        },
      }),
      prisma.sessionAuditLog.findUnique({
        where: { sessionId },
        select: { initiatorId: true, receiverId: true, startedAt: true, endedAt: true },
      }),
    ]);

    if (!session && !auditLog) return res.status(404).json({ error: "Session metadata not found" });

    const initiatorId = session?.initiatorId ?? auditLog!.initiatorId;
    const receiverId = session?.receiverId ?? auditLog!.receiverId;
    const request = await prisma.sessionRequest.findFirst({
      where: {
        OR: [
          { senderId: initiatorId, receiverId },
          { senderId: receiverId, receiverId: initiatorId },
        ],
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });

    const startedAt = session?.startedAt ?? auditLog!.startedAt;
    const lastActive = session?.lastActive ?? startedAt;
    // Legacy sessions ended before endedAt was introduced. Their final
    // heartbeat is the best metadata-only end-time fallback until archived.
    const endedAt = session?.endedAt ?? auditLog?.endedAt ?? lastActive;
    const timeout = isTimeout(lastActive, endedAt);
    const timeline = [
      ...(request ? [{ id: `${request.id}:invite`, title: "Invite sent", time: request.createdAt.toISOString(), color: "emerald" as const }] : []),
      { id: `${sessionId}:accepted`, title: "Invite accepted", time: startedAt.toISOString(), color: "emerald" as const },
      { id: `${sessionId}:active`, title: "Active chat", time: lastActive.toISOString(), color: "blue" as const },
      ...(timeout ? [{ id: `${sessionId}:inactive`, title: "Inactivity detected", time: lastActive.toISOString(), color: "amber" as const }] : []),
      ...(session?.status !== "ACTIVE" ? [{
        id: `${sessionId}:ended`,
        title: timeout ? "Session timeout" : "Session ended",
        time: endedAt.toISOString(),
        color: "rose" as const,
      }] : []),
    ];

    return res.json({ timeline });
  } catch (error: any) {
    console.error("[Admin] Failed to build session timeline:", error);
    return res.status(500).json({ error: "Failed to load session timeline" });
  }
});
