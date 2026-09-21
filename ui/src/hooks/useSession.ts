/**
 * ============================================================
 * FILE: ui/src/hooks/useSession.ts
 * ============================================================
 * ARCHITECTURE (Phase 1 — Zero Polling):
 *
 *   ┌─────────────────────────────────────────────────────────┐
 *   │  Session state is now driven by two sources:            │
 *   │                                                         │
 *   │  1. Socket.io (Real-time DB events):                    │
 *   │     • incoming_request  → new invite received           │
 *   │     • session_updated   → session accepted, now active  │
 *   │     • session_ended     → session closed by receiver    │
 *   │     • request_rejected  → sent invite was declined      │
 *   │                                                         │
 *   │  2. One-shot REST fetch on mount (initial state sync):  │
 *   │     • GET /api/session/status — called once on login    │
 *   │       to hydrate state from DB before socket events     │
 *   │       start flowing.                                     │
 *   │                                                         │
 *   │  The 5-second setInterval polling has been REMOVED.     │
 *   │  Frontend inactivity monitoring has been REMOVED.       │
 *   │  Backend cleanup cron now owns inactivity detection.    │
 *   └─────────────────────────────────────────────────────────┘
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { getSessionStatus, inviteUser, respondToRequest, endSession } from "../lib/api";
import { socketClient } from "../lib/socket";
import type {
  SessionStatusActiveSession,
  SessionStatusIncomingRequest,
  SessionStatusResponse,
} from "../types/api";
import type {
  SocketIncomingRequestPayload,
  SocketSessionUpdatedPayload,
  SocketSessionEndedPayload,
} from "../lib/socket";

export interface UseSessionOptions {
  currentUserId?: string; // DB UUID of current user
  onInactivityTimeout?: () => void; // Kept for API compatibility (fires on session_ended with any reason)
  onToast?: (message: string, type?: "success" | "error" | "info" | "warning") => void;
  /** Called when a real-time incoming_request event arrives */
  onIncomingRequest?: (request: SocketIncomingRequestPayload) => void;
  /** Called when a real-time session_updated event arrives */
  onSessionUpdated?: (payload: SocketSessionUpdatedPayload) => void;
  /** Called when a real-time session_ended event arrives */
  onSessionEnded?: (payload: SocketSessionEndedPayload) => void;
}

export interface UseSessionReturn {
  activeSession: SessionStatusActiveSession | null;
  incomingRequests: SessionStatusIncomingRequest[];
  isLoading: boolean;
  error: string | null;
  lastMessageTime: number | null;
  recordMessageActivity: (timestamp?: number) => void;
  invite: (targetUserId: string) => Promise<{
    message: string;
    request?: any;
  }>;
  respond: (requestId: string, action: "ACCEPT" | "REJECT") => Promise<{ message: string; sessionId?: string; partner?: { userId: string; name: string } }>;
  end: (sessionId?: string) => Promise<{ message: string }>;
  refresh: () => Promise<void>;
}


export const useSession = (
  enabled: boolean = true,
  options?: UseSessionOptions
): UseSessionReturn => {
  const [activeSession, setActiveSession] = useState<SessionStatusActiveSession | null>(null);
  const [incomingRequests, setIncomingRequests] = useState<SessionStatusIncomingRequest[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastMessageTime, setLastMessageTime] = useState<number | null>(null);

  const isMountedRef = useRef<boolean>(true);
  const activeSessionRef = useRef<SessionStatusActiveSession | null>(null);
  activeSessionRef.current = activeSession;

  const lastMessageTimeRef = useRef<number | null>(null);
  lastMessageTimeRef.current = lastMessageTime;

  const isEndingInactivityRef = useRef<boolean>(false);

  const currentUserIdRef = useRef<string | undefined>(options?.currentUserId);
  currentUserIdRef.current = options?.currentUserId;

  // Stable refs for callbacks to avoid re-registering socket listeners on every render
  const onIncomingRequestRef = useRef(options?.onIncomingRequest);
  const onSessionUpdatedRef = useRef(options?.onSessionUpdated);
  const onSessionEndedRef = useRef(options?.onSessionEnded);
  onIncomingRequestRef.current = options?.onIncomingRequest;
  onSessionUpdatedRef.current = options?.onSessionUpdated;
  onSessionEndedRef.current = options?.onSessionEnded;

  // Method to record message activity whenever a message is sent or received
  const recordMessageActivity = useCallback((timestamp?: number) => {
    const time = timestamp || Date.now();
    setLastMessageTime(time);
  }, []);

  // ── One-shot initial fetch (replaces polling) ─────────────────────────────
  // Hydrates state from DB once on mount so we're in sync before socket events flow.
  const fetchStatus = useCallback(async () => {
    try {
      const data: SessionStatusResponse = await getSessionStatus();
      if (!isMountedRef.current) return;

      // Detect if session newly started
      if (data.activeSession && !activeSessionRef.current) {
        setLastMessageTime(Date.now());
        isEndingInactivityRef.current = false;
      } else if (!data.activeSession && activeSessionRef.current) {
        setLastMessageTime(null);
        isEndingInactivityRef.current = false;
      }

      setActiveSession(data.activeSession);
      // Ensure incomingRequests state only stores requests where receiverId === currentUser?.id
      const validRequests = (data.incomingRequests || []).filter((r) => {
        if (!currentUserIdRef.current) return true;
        return r.receiverId === currentUserIdRef.current && r.senderId !== currentUserIdRef.current;
      });
      setIncomingRequests(validRequests);
      setError(null);
    } catch (err: any) {
      if (!isMountedRef.current) return;
      if (err.response?.status !== 401) {
        setError(err.response?.data?.error || err.message || "Failed to fetch session status");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // ── Mount: one-shot fetch + socket event subscriptions ───────────────────
  useEffect(() => {
    isMountedRef.current = true;
    if (!enabled) {
      setIsLoading(false);
      return;
    }

    // 1. Initial hydration from DB
    fetchStatus();

    // 2. Subscribe to real-time socket events (no polling needed after this)

    // incoming_request: A user sent us an invite
    const unsubIncoming = socketClient.on("incoming_request", (data) => {
      if (!isMountedRef.current) return;

      // Validation: sender identity vs intended receiver identity
      if (currentUserIdRef.current) {
        if (data.senderId === currentUserIdRef.current) {
          console.warn("[useSession] Dropping incoming_request because sender is current user:", data);
          return;
        }
        if (data.receiverId && data.receiverId !== currentUserIdRef.current) {
          console.warn("[useSession] Dropping incoming_request because receiver is not current user:", data);
          return;
        }
      }

      setIncomingRequests((prev) => {
        // Ensure incomingRequests state only stores requests where receiverId === currentUser?.id
        if (currentUserIdRef.current) {
          if (data.senderId === currentUserIdRef.current) return prev;
          if (data.receiverId && data.receiverId !== currentUserIdRef.current) return prev;
        }
        // Avoid duplicate entries by request ID
        if (prev.some((r) => r.id === data.id)) return prev;
        return [data as any, ...prev];
      });
      // Propagate to App.tsx if callback provided
      onIncomingRequestRef.current?.(data);
    });

    // session_updated: Our invite was accepted — session is now ACTIVE
    const unsubUpdated = socketClient.on("session_updated", (data) => {
      if (!isMountedRef.current) return;
      const session: SessionStatusActiveSession = {
        id: data.sessionId,
        isReceiver: data.isReceiver,
        partner: {
          firstName: data.partner.firstName || "",
          lastName: data.partner.lastName || "",
          userId: data.partner.userId || "",
        },
      };
      setActiveSession(session);
      setLastMessageTime(Date.now());
      isEndingInactivityRef.current = false;
      // Remove the pending incoming request (now accepted)
      setIncomingRequests([]);
      onSessionUpdatedRef.current?.(data);
    });

    // session_ended: Receiver ended the session
    const unsubEnded = socketClient.on("session_ended", (data) => {
      if (!isMountedRef.current) return;
      if (data.sessionId && data.sessionId !== activeSessionRef.current?.id) {
        console.warn("[Session] Ignoring stale end event for session:", data.sessionId);
        return;
      }
      setActiveSession(null);
      setLastMessageTime(null);
      isEndingInactivityRef.current = false;
      onSessionEndedRef.current?.(data);
    });

    return () => {
      isMountedRef.current = false;
      unsubIncoming();
      unsubUpdated();
      unsubEnded();
    };
  }, [enabled, fetchStatus]);

  // NOTE: Frontend inactivity monitoring has been REMOVED.
  // The backend cleanup cron (every 60s) now owns timeout detection:
  //   → It finds sessions where lastActive < NOW - 3min
  //   → Emits session_ended { reason: 'inactivity_timeout' } via Socket.io
  //   → Both users react via the onSessionEnded callback above
  //
  // The frontend calls sendHeartbeat() from App.tsx on every message
  // to keep lastActive fresh. No local interval needed.

  const invite = useCallback(
    async (targetUserId: string) => {
      setError(null);
      try {
        const res = await inviteUser(targetUserId);
        // No need to call fetchStatus() — the receiver will get a socket push
        return res;
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || "Failed to send invitation";
        setError(msg);
        throw err;
      }
    },
    []
  );

  const respond = useCallback(
    async (requestId: string, action: "ACCEPT" | "REJECT") => {
      setError(null);
      try {
        const res = await respondToRequest(requestId, action);
        if (action === "ACCEPT") {
          setLastMessageTime(Date.now());
          isEndingInactivityRef.current = false;
          // Remove this request from the list immediately (socket will confirm shortly)
          setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
        } else if (action === "REJECT") {
          setIncomingRequests((prev) => prev.filter((r) => r.id !== requestId));
        }
        // No fetchStatus() — socket events will keep state in sync
        return res;
      } catch (err: any) {
        const msg = err.response?.data?.error || err.message || "Failed to respond to request";
        setError(msg);
        throw err;
      }
    },
    []
  );

  const end = useCallback(
    async (sessionId?: string) => {
      setError(null);
      try {
        const targetId = sessionId || activeSession?.id;
        const res = await endSession(targetId);
        // Optimistically clear session — socket event will confirm to partner
        setActiveSession(null);
        setLastMessageTime(null);
        // No fetchStatus() — /end emits session_ended to both users via socket
        return res;
      } catch (err: any) {
        const msg =
          err.response?.data?.error ||
          err.message ||
          "Failed to end session. Only the receiver has permission to end this session.";
        setError(msg);
        throw err;
      }
    },
    [activeSession]
  );

  return {
    activeSession,
    incomingRequests,
    isLoading,
    error,
    lastMessageTime,
    recordMessageActivity,
    invite,
    respond,
    end,
    refresh: fetchStatus,
  };
};

export default useSession;
