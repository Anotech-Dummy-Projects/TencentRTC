/**
 * ============================================================
 * FILE: ui/src/lib/socket.ts
 * ============================================================
 * PURPOSE:
 *   Manages the Socket.io client connection as a singleton.
 *   Provides a clean connect/disconnect API and typed event listeners.
 *
 * DESIGN:
 *   - Auth uses HttpOnly cookies automatically (withCredentials: true)
 *   - Each user connects once on login, disconnects on logout
 *   - Events: incoming_request, session_updated, session_ended, request_rejected
 *
 * USAGE:
 *   import { socketClient } from "./socket";
 *   socketClient.connect();
 *   const unsub = socketClient.on("incoming_request", (data) => { ... });
 *   // In cleanup:
 *   unsub();
 *   socketClient.disconnect();
 * ============================================================
 */

import { io, type Socket } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

// ─── Event Payload Types ─────────────────────────────────────────────────────

export interface SocketIncomingRequestPayload {
  id: string;
  senderId: string;
  receiverId: string;
  status: string;
  createdAt: string;
  sender: {
    firstName?: string | null;
    lastName?: string | null;
    userId?: string | null;
  };
}

export interface SocketSessionUpdatedPayload {
  sessionId: string;
  isReceiver: boolean;
  partner: {
    firstName?: string | null;
    lastName?: string | null;
    userId?: string | null;
  };
}

export interface SocketSessionEndedPayload {
  sessionId: string;
  reason?: string; // e.g. 'inactivity_timeout' | undefined (manual end)
}

export interface SocketRequestRejectedPayload {
  requestId: string;
  rejectedBy: string;
}

// ─── Event Map (for type-safe listeners) ─────────────────────────────────────

export interface SocketEventMap {
  incoming_request: SocketIncomingRequestPayload;
  session_updated: SocketSessionUpdatedPayload;
  session_ended: SocketSessionEndedPayload;
  request_rejected: SocketRequestRejectedPayload;
}

type Listener<T> = (data: T) => void;
type AnyListener = Listener<any>;

// ─── SocketClient Class ───────────────────────────────────────────────────────

class SocketClient {
  private socket: Socket | null = null;
  // Buffered listeners registered before connect() was called
  private listenerBuffer: Array<{ event: string; fn: AnyListener }> = [];

  /**
   * Connect to the Socket.io server.
   * Auth is handled automatically via the HttpOnly cookie (withCredentials).
   * Safe to call multiple times — returns existing socket if already connected.
   */
  connect(): Socket {
    if (this.socket?.connected) return this.socket;

    // Disconnect stale socket if it exists but isn't connected
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(BACKEND_URL, {
      withCredentials: true,         // Send HttpOnly cookies for auth
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    this.socket.on("connect", () => {
      console.log("[Socket.io] Connected ✓", this.socket?.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("[Socket.io] Disconnected:", reason);
    });

    this.socket.on("connect_error", (err) => {
      console.warn("[Socket.io] Connection error:", err.message);
    });

    // Replay any buffered listeners registered before connect() was called
    for (const { event, fn } of this.listenerBuffer) {
      this.socket.on(event, fn);
    }
    this.listenerBuffer = [];

    return this.socket;
  }

  /**
   * Disconnect the socket (call on logout).
   */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.listenerBuffer = [];
  }

  /**
   * Register a typed event listener.
   * Returns an unsubscribe function — call it in useEffect cleanup.
   *
   * @example
   * const unsub = socketClient.on("incoming_request", (data) => {
   *   setIncomingInvite(data);
   * });
   * return () => unsub();
   */
  on<K extends keyof SocketEventMap>(
    event: K,
    listener: Listener<SocketEventMap[K]>
  ): () => void {
    if (this.socket) {
      this.socket.on(event as string, listener as AnyListener);
    } else {
      // Buffer for replay when connect() is called later
      this.listenerBuffer.push({ event: event as string, fn: listener as AnyListener });
    }

    return () => {
      this.socket?.off(event as string, listener as AnyListener);
      // Also remove from buffer in case connect() hasn't been called yet
      this.listenerBuffer = this.listenerBuffer.filter((b) => b.fn !== listener);
    };
  }

  /** True if currently connected */
  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const socketClient = new SocketClient();
export default socketClient;
