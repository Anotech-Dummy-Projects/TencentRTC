/**
 * ============================================================
 * FILE: backend/src/socketServer.ts
 * ============================================================
 * PURPOSE:
 *   Manages the Socket.io server instance as a singleton.
 *   Provides:
 *     - initSocketServer(httpServer) — attach Socket.io to the HTTP server
 *     - emitToUser(userId, event, data) — emit an event to a specific user's room
 *     - getIO() — access the Socket.io instance from any module (e.g., session.ts)
 *
 * ARCHITECTURE:
 *   - Each authenticated user joins a private room named after their DB userId (UUID)
 *   - Auth is done via JWT from HttpOnly cookie or Authorization header on handshake
 *   - All real-time events (incoming_request, session_updated, session_ended) are
 *     emitted via emitToUser() from session.ts endpoints after DB mutations.
 * ============================================================
 */

import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import type { JwtUserPayload } from "./chat.js";

let io: SocketIOServer | null = null;

/**
 * Initialize Socket.io on top of the existing HTTP server.
 * Called once from index.ts after app.listen().
 */
export function initSocketServer(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (
          origin.startsWith("http://localhost:") ||
          origin.startsWith("http://127.0.0.1:")
        ) {
          return callback(null, origin);
        }
        const clientUrl = process.env.CLIENT_URL;
        if (clientUrl && origin === clientUrl) return callback(null, origin);
        return callback(null, origin); // Permissive for dev; tighten in prod
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    // Use cookie transport for auth — falls back to query token
    transports: ["websocket", "polling"],
  });

  // ── Auth Middleware ─────────────────────────────────────────────────
  // Verify JWT from HttpOnly cookie or Authorization header on every connect.
  // Rejects the connection if the token is invalid or missing.
  io.use((socket, next) => {
    try {
      // 1. Try HttpOnly cookie first (primary auth method)
      let token: string | undefined;

      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = Object.fromEntries(
          cookieHeader.split(";").map((c) => {
            const [k, ...v] = c.trim().split("=");
            return [(k ?? "").trim(), v.join("=")] as [string, string];
          })
        );
        token = cookies["CookieToken"];
      }

      // 2. Fallback: Authorization header (Bearer token)
      if (!token) {
        const authHeader = socket.handshake.headers.authorization;
        if (authHeader) {
          const parts = authHeader.split(" ");
          token = parts.length === 2 && parts[0] === "Bearer" ? parts[1] : parts[0];
        }
      }

      // 3. Fallback: query param (useful for SSE/polling transports)
      if (!token && socket.handshake.query?.token) {
        token = socket.handshake.query.token as string;
      }

      if (!token) {
        return next(new Error("Authentication required"));
      }

      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "default_secret"
      ) as JwtUserPayload;

      // Attach verified user to the socket for later use
      (socket as any).user = decoded;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  // ── Connection Handler ──────────────────────────────────────────────
  io.on("connection", (socket) => {
    const user = (socket as any).user as JwtUserPayload;

    if (!user?.id) {
      socket.disconnect(true);
      return;
    }

    // Each user joins a private room named after their DB UUID.
    // emitToUser(userId, ...) targets this room specifically.
    socket.join(user.id);

    console.log(
      `\x1b[36m[Socket.io]\x1b[0m Connected: \x1b[32m${user.userId}\x1b[0m (room: ${user.id.slice(0, 8)}…)`
    );

    socket.on("disconnect", (reason) => {
      console.log(
        `\x1b[36m[Socket.io]\x1b[0m Disconnected: \x1b[33m${user.userId}\x1b[0m — ${reason}`
      );
    });
  });

  console.log("\x1b[36m[Socket.io]\x1b[0m Server initialized ✓");
  return io;
}

/**
 * Get the active Socket.io server instance.
 * Throws if initSocketServer() was never called.
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error("[Socket.io] Server not initialized. Call initSocketServer() first.");
  }
  return io;
}

const SESSION_LIFECYCLE_EVENTS = new Set([
  "incoming_request",
  "request_rejected",
  "session_updated",
  "session_ended",
]);

/**
 * Emit a real-time event to a specific user by their DB UUID.
 * The user must be connected and in their personal room for this to reach them.
 * Safe to call even if the user is offline — the event is simply dropped.
 *
 * @param userId  The user's DB UUID (primary key in User table)
 * @param event   Event name (e.g., "incoming_request", "session_updated")
 * @param data    Any serializable payload
 */
export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!io) return; // Server not initialized yet, skip silently

  if (SESSION_LIFECYCLE_EVENTS.has(event)) {
    const sessionId =
      (data as any)?.sessionId ||
      (data as any)?.id ||
      (data as any)?.requestId ||
      "N/A";
    console.log(`[Socket] Emitting ${event} to ${userId} | Session: ${sessionId}`);
  }

  io.to(userId).emit(event, data);
}


