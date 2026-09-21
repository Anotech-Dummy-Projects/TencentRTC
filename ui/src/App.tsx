import { useState, useEffect, useCallback, useRef } from "react";
import Login from "./components/Login";
import Register from "./components/Register";
import Admin from "./components/Admin";
import AdminLoginRegister from "./components/adminLoginRegistser";
import ChatInterface from "./components/ChatInterface";
import ReceiveInvite from "./components/ReceiveInvite";
import SenderStartConversationReq from "./components/SenderStartConversationReq";
import IncomingRequests from "./components/IncomingRequests";
import { ToastProvider, useToast } from "./components/Toast";
import { useSession } from "./hooks/useSession";
import { trtcChat } from "./lib/trtcChat";
import { socketClient } from "./lib/socket";
import {
  getMe,
  logout,
  getChatToken,
  sendHeartbeat,
  AUTH_UNAUTHORIZED_EVENT,
} from "./lib/api";
import type { TrtcIncomingMessage } from "./lib/trtcChat";
import type { User, ActiveSessionData, IncomingRequestData } from "./types/api";

type AuthView = "login" | "register" | "start-conversation" | "active-chat" | "admin-login" | "admin";

function MainApp() {
  const { showToast } = useToast();
  const [currentView, setCurrentView] = useState<AuthView>("login");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState<boolean>(true);

  // Active Session & Invite states
  const [activeSession, setActiveSession] = useState<ActiveSessionData | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<IncomingRequestData | null>(null);
  const [pendingSentTarget, setPendingSentTarget] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<import("./components/ActiveChat").MessageItem[]>([]);
  const activeSessionRef = useRef<ActiveSessionData | null>(null);
  activeSessionRef.current = activeSession;

  // 1. Inactivity Timeout & Session Management Hook
  const isSessionEnabled = !!currentUser && currentView !== "login" && currentView !== "register";
  const {
    activeSession: statusActiveSession,
    incomingRequests,
    recordMessageActivity,
    invite: triggerInvite,
    respond: triggerRespond,
    end: triggerEnd,
    refresh: refreshSession,
  } = useSession(isSessionEnabled, {
    currentUserId: currentUser?.id,
    onToast: (msg, type) => showToast(msg, type),
    onInactivityTimeout: () => {
      setActiveSession(null);
      setChatMessages([]);
      setIncomingInvite(null);
      setPendingSentTarget(null);
      setCurrentView("start-conversation");
    },
    // Real-time socket: incoming invite push (no polling needed)
    onIncomingRequest: (req) => {
      // Validation: sender identity vs receiver identity
      if (currentUser?.id) {
        if (req.senderId === currentUser.id) {
          console.warn("[App] Dropping incoming_request because sender is current user:", req);
          return;
        }
        if (req.receiverId && req.receiverId !== currentUser.id) {
          console.warn("[App] Dropping incoming_request because receiver is not current user:", req);
          return;
        }
      }

      setIncomingInvite({
        id: req.id,
        senderId: req.senderId,
        receiverId: req.receiverId,
        status: req.status,
        createdAt: req.createdAt,
        sender: {
          id: req.senderId,
          firstName: req.sender?.firstName ?? undefined,
          lastName: req.sender?.lastName ?? undefined,
          userId: req.sender?.userId ?? undefined,
        },
      });
    },
    // Real-time socket: invite accepted — session is now live
    onSessionUpdated: (payload) => {
      const formattedSession: ActiveSessionData = {
        id: payload.sessionId,
        initiatorId: "",
        receiverId: "",
        startedAt: new Date().toISOString(),
        status: "ACTIVE",
        isReceiver: payload.isReceiver,
        partnerUser: {
          id: payload.sessionId,
          firstName: payload.partner?.firstName || "Support",
          lastName: payload.partner?.lastName || "Agent",
          userId: payload.partner?.userId || "#ID",
        },
      };
      setActiveSession(formattedSession);
      setPendingSentTarget(null);
      setChatMessages([]);
      setCurrentView("active-chat");
      recordMessageActivity(Date.now());
    },
    // Real-time socket: session ended (by receiver manually OR by inactivity cleanup)
    onSessionEnded: async (payload) => {
      if (payload.sessionId && payload.sessionId !== activeSessionRef.current?.id) {
        console.warn("[Session] Ignoring stale end event for session:", payload.sessionId);
        return;
      }
      // CRITICAL: Destroy TRTC conversation FIRST before clearing React state
      if (activeSessionRef.current?.partnerUser?.userId) {
        await trtcChat.destroyConversation(activeSessionRef.current.partnerUser.userId);
      }
      setActiveSession(null);
      setChatMessages([]);
      setIncomingInvite(null);
      setPendingSentTarget(null);
      setCurrentView("start-conversation");
      // Show different toast depending on why the session ended
      if (payload?.reason === "inactivity_timeout") {
        showToast("Session ended automatically after 3 minutes of inactivity.", "warning");
      }
    },
  });

  // Initialize Tencent Cloud Chat SDK when user logs in
  useEffect(() => {
    if (!currentUser?.userId) return;

    // Connect Socket.io for real-time DB state sync (auth via HttpOnly cookie)
    socketClient.connect();

    let isSubscribed = true;
    getChatToken()
      .then((tokenData) => {
        if (!isSubscribed) return;
        trtcChat.init(tokenData.sdkAppId);
        trtcChat.login(tokenData.userId, tokenData.userSig);
      })
      .catch((err) => {
        console.warn("[TRTC] Token fetch warning (falling back safely):", err);
      });

    return () => {
      isSubscribed = false;
    };
  }, [currentUser]);

  const getHashView = (): AuthView | null => {
    const hash = window.location.hash.toLowerCase();
    if (hash === "#admin" || hash === "#/admin") return "admin";
    if (hash === "#admin-login" || hash === "#/admin-login") return "admin-login";
    return null;
  };

  // Check if active HttpOnly cookie session exists on initial load
  const verifySession = useCallback(async () => {
    const hashRoute = getHashView();
    if (hashRoute) {
      setCurrentView(hashRoute);
      setCheckingSession(false);
      return;
    }
    try {
      setCheckingSession(true);
      const user = await getMe();
      if (user) {
        setCurrentUser(user);
        setCurrentView("start-conversation");
      } else {
        setCurrentUser(null);
        setCurrentView("login");
      }
    } catch {
      setCurrentUser(null);
      setCurrentView("login");
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    const handleHash = () => {
      const route = getHashView();
      if (route) {
        setCurrentView(route);
      } else if (window.location.hash === "" || window.location.hash === "#") {
        if (!currentUser) {
          setCurrentView("login");
        } else {
          setCurrentView("start-conversation");
        }
      }
    };
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [currentUser]);

  useEffect(() => {
    verifySession();

    // Listen for 401 Unauthorized events from Axios response interceptor
    const handleUnauthorized = () => {
      socketClient.disconnect(); // Close socket on auth failure
      setCurrentUser(null);
      setActiveSession(null);
      setIncomingInvite(null);
      setCurrentView("login");
    };

    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => {
      window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, handleUnauthorized);
    };
  }, [verifySession]);

  // Synchronize state from useSession hook
  useEffect(() => {
    if (!currentUser || currentView === "login" || currentView === "register") {
      return;
    }

    if (statusActiveSession) {
      const prevSession = activeSessionRef.current;
      const formattedSession: ActiveSessionData = {
        id: statusActiveSession.id,
        initiatorId: "",
        receiverId: "",
        startedAt: new Date().toISOString(),
        status: "ACTIVE",
        isReceiver: statusActiveSession.isReceiver,
        partnerUser: {
          id: statusActiveSession.id,
          firstName: statusActiveSession.partner?.firstName || "Support",
          lastName: statusActiveSession.partner?.lastName || "Agent",
          userId: statusActiveSession.partner?.userId || "#ID",
        },
      };

      setActiveSession(formattedSession);
      setPendingSentTarget(null);

      if (currentView !== "active-chat") {
        setCurrentView("active-chat");
      }

      // If newly activated or changed, start blank — all history comes from TRTC cloud
      if (!prevSession || prevSession.id !== statusActiveSession.id) {
        setChatMessages([]);
        recordMessageActivity(Date.now());
      }
    } else {
      // If was in active-chat and session ended, return to start-conversation
      if (activeSessionRef.current && currentView === "active-chat") {
        setActiveSession(null);
        setChatMessages([]);
        setIncomingInvite(null);
        setPendingSentTarget(null);
        setCurrentView("start-conversation");
      }
    }
  }, [statusActiveSession, currentUser, currentView, recordMessageActivity]);

  // Synchronize incoming requests from useSession
  useEffect(() => {
    if (incomingRequests && incomingRequests.length > 0) {
      // Ensure incomingRequests state only stores requests where receiverId === currentUser?.id
      const validRequests = incomingRequests.filter((r) => {
        if (!currentUser?.id) return true;
        return r.receiverId === currentUser.id && r.senderId !== currentUser.id;
      });

      if (validRequests.length > 0) {
        const first = validRequests[0];
        setIncomingInvite({
          id: first.id,
          senderId: first.senderId,
          receiverId: first.receiverId,
          status: first.status,
          createdAt: first.createdAt,
          sender: {
            id: first.senderId,
            firstName: first.sender?.firstName,
            lastName: first.sender?.lastName,
            userId: first.sender?.userId,
          },
        });
        return;
      }
    }
    setIncomingInvite(null);
  }, [incomingRequests, currentUser?.id]);

  // TRTC SDK real-time message & control signals listener
  const activeSessionRef2 = useRef<ActiveSessionData | null>(null);
  activeSessionRef2.current = activeSession;
  const currentUserRef = useRef<User | null>(null);
  currentUserRef.current = currentUser;

  useEffect(() => {
    // 1. Subscribe to incoming chat messages
    const unsubMsg = trtcChat.onMessage((msg: TrtcIncomingMessage) => {
      const session = activeSessionRef2.current;
      const user = currentUserRef.current;
      if (!session) return;

      // Mark inactivity tracker (local) + reset backend lastActive (prevents zombie cleanup)
      recordMessageActivity(Date.now());
      sendHeartbeat(); // Fire-and-forget: non-fatal if it fails

      const isFromMe = Boolean(
        user?.userId &&
        msg.fromUserId &&
        msg.fromUserId.toLowerCase() === user.userId.toLowerCase()
      );
      const isFromPartner = Boolean(
        session?.partnerUser?.userId &&
        msg.fromUserId &&
        msg.fromUserId.toLowerCase() === session.partnerUser.userId.toLowerCase()
      );

      const senderInitials = isFromMe
        ? "ME"
        : isFromPartner && session?.partnerUser
        ? (
            (session.partnerUser.firstName?.[0] || "") +
            (session.partnerUser.lastName?.[0] || "P")
          ).toUpperCase()
        : msg.fromUserId.slice(0, 2).toUpperCase();

      const senderName = isFromMe
        ? "You"
        : isFromPartner && session?.partnerUser
        ? `${session.partnerUser.firstName || ""} ${session.partnerUser.lastName || ""}`.trim() || session.partnerUser.userId
        : msg.fromUserId;

      const newMsg: import("./components/ActiveChat").MessageItem = {
        id: msg.id,
        sender: isFromMe ? "user" : "agent",
        senderInitials,
        senderName,
        text: msg.text,
        imageUrl: msg.imageUrl,
        videoUrl: msg.videoUrl,
        snapshotUrl: msg.snapshotUrl,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        mimeType: msg.mimeType,
        messageType: msg.messageType,
        time: msg.time,
        read: true,
      };

      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, newMsg];
      });
    });

    // 2. Subscribe to real-time control signals (SESSION_ENDED, INVITE_REJECTED)
    const unsubCustom = trtcChat.onCustomMessage(async (payload) => {
      if (payload?.type === "SESSION_ENDED") {
        const currentSession = activeSessionRef2.current;
        if (payload.sessionId && payload.sessionId !== currentSession?.id) {
          console.warn("[Session] Ignoring stale end event for session:", payload.sessionId);
          return;
        }
        const partnerId = currentSession?.partnerUser?.userId;
        if (partnerId) {
          await trtcChat.destroyConversation(partnerId);
        }
        setActiveSession(null);
        setChatMessages([]);
        setIncomingInvite(null);
        setPendingSentTarget(null);
        setCurrentView("start-conversation");
        showToast("Session ended by your chat partner.", "info");
        await refreshSession();
      }

      if (payload?.type === "INVITE_REJECTED") {
        const rejectorName = payload.rejectedByName || payload.rejectedBy || "The user";
        showToast(`Invitation rejected by ${rejectorName}.`, "error");
        setPendingSentTarget(null);
        setCurrentView("start-conversation");
        await refreshSession();
      }
    });

    return () => {
      unsubMsg();
      unsubCustom();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordMessageActivity, refreshSession, showToast]);

  // Login handler -> direct to start conversation
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setCurrentView("start-conversation");
    showToast(`Welcome back, ${user.firstName || user.email}!`, "success");
  };

  // Register handler -> direct to start conversation
  const handleRegisterSuccess = (user: User) => {
    setCurrentUser(user);
    setCurrentView("start-conversation");
    showToast("Account created successfully! Welcome to ClarityDesk.", "success");
  };

  // Logout handler
  const handleLogout = async () => {
    try {
      // Destroy any open conversation before logging out to prevent message leakage
      if (activeSession?.partnerUser?.userId) {
        await trtcChat.destroyConversation(activeSession.partnerUser.userId);
      }
      await logout();
      await trtcChat.logout();
      socketClient.disconnect(); // Close real-time socket connection
    } catch {
      // Ignore
    }
    setCurrentUser(null);
    setActiveSession(null);
    setChatMessages([]);
    setIncomingInvite(null);
    setCurrentView("login");
    showToast("Signed out successfully.", "info");
  };

  // Send request to target user
  const handleStartConversation = async (uniqueId: string) => {
    try {
      setPendingSentTarget(uniqueId);
      await triggerInvite(uniqueId);
      showToast(`Invitation sent to ${uniqueId}!`, "success");

      await refreshSession();
    } catch (err: any) {
      setPendingSentTarget(null);
      const msg = err.response?.data?.error || err.message || "Failed to send invitation. Please check the unique ID.";
      showToast(msg, "error");
    }
  };

  // ── safelyEndCurrentSession() ─────────────────────────────────────────────
  // Destroys TRTC conversation, ends DB session, then waits
  // 300ms for the SDK to fully process the destroy before allowing new session.
  // Throws on failure so callers can handle the error and keep the UI interactive.
  const safelyEndCurrentSession = async () => {
    const session = activeSessionRef.current;
    if (!session) return; // Nothing to end

    try {
      // LAYER 1: Destroy TRTC conversation FIRST (prevents message leakage)
      if (session.partnerUser?.userId) {
        // Notify partner so they reset immediately
        await trtcChat.sendCustomMessage(session.partnerUser.userId, {
          type: "SESSION_ENDED",
          sessionId: session.id,
        });
        await trtcChat.destroyConversation(session.partnerUser.userId);
      }

      // LAYER 2: Update DB via backend (emits session_ended socket to both)
      await triggerEnd(session.id);

      // LAYER 3: Small buffer — lets SDK fully process the destroy
      await new Promise<void>((resolve) => setTimeout(resolve, 300));

    } catch (err) {
      console.error("[Session] safelyEndCurrentSession failed:", err);
      showToast("Failed to end session cleanly. Please try again.", "error");
      throw err; // Re-throw so caller knows to abort
    }
  };

  // Accept incoming invite
  const handleAcceptInvite = async (requestId: string) => {
    try {
      const res = await triggerRespond(requestId, "ACCEPT");
      setIncomingInvite(null);
      recordMessageActivity(Date.now());

      if (res.sessionId) {
        setActiveSession({
          id: res.sessionId,
          initiatorId: "",
          receiverId: currentUser?.id || "",
          startedAt: new Date().toISOString(),
          status: "ACTIVE",
          isReceiver: true, // Accepter is receiver
          partnerUser: {
            id: res.sessionId,
            firstName: res.partner?.name?.split(" ")[0] || "Partner",
            lastName: res.partner?.name?.split(" ").slice(1).join(" ") || "",
            userId: res.partner?.userId || "#ID",
          },
        });
        setChatMessages([]); // Blank start!
        setCurrentView("active-chat");
      }
      showToast("Chat request accepted! Session is live.", "success");
      await refreshSession();
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || "Failed to accept invite.";
      showToast(msg, "error");
    }
  };

  // Reject incoming invite
  const handleRejectInvite = async (requestId: string) => {
    try {
      // Find the sender's userId for real-time notification
      const req =
        incomingRequests?.find((r) => r.id === requestId) ||
        (incomingInvite?.id === requestId ? incomingInvite : null);
      const senderUserId = req?.sender?.userId;

      await triggerRespond(requestId, "REJECT");

      // Send real-time rejection signal to sender so their modal auto-closes immediately
      if (senderUserId) {
        const myName = currentUser?.firstName
          ? `${currentUser.firstName} ${currentUser.lastName || ""}`.trim()
          : currentUser?.userId || "User";

        await trtcChat.sendCustomMessage(senderUserId, {
          type: "INVITE_REJECTED",
          rejectedBy: currentUser?.userId || "",
          rejectedByName: myName,
          reason: "declined",
        });
      }

      setIncomingInvite(null);
      showToast("Chat invitation declined.", "info");
      await refreshSession();
    } catch {
      setIncomingInvite(null);
    }
  };

  // End active chat (STRICT RULE: Only receiver allowed!)
  const handleEndChat = async () => {
    if (!activeSession) return;
    try {
      // Destroy the local conversation before ending the database session.
      await safelyEndCurrentSession();

      // Reset UI after clean close
      setActiveSession(null);
      setChatMessages([]);
      setIncomingInvite(null);
      setPendingSentTarget(null);
      setCurrentView("start-conversation");
      showToast("Session ended successfully.", "info");
      await refreshSession();
    } catch (err: any) {
      // safelyEndCurrentSession already showed the error toast
      console.error("[Session] handleEndChat failed:", err);
    }
  };

  // Send message via pure Tencent Cloud Chat SDK (no backend call)
  const handleSendMessage = async (text: string) => {
    if (!activeSession || !text.trim()) return;

    const partnerUserId = activeSession.partnerUser?.userId;
    if (!partnerUserId) {
      showToast("Cannot send: partner user ID is unknown.", "error");
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const optimisticId = `optimistic_${Date.now()}`;

    // Optimistic UI: add message immediately before SDK confirms
    const optimisticMsg: import("./components/ActiveChat").MessageItem = {
      id: optimisticId,
      sender: "user",
      senderInitials: (currentUser?.firstName?.[0] || currentUser?.email?.[0] || "U").toUpperCase(),
      senderName: currentUser?.firstName
        ? `${currentUser.firstName} ${currentUser.lastName || ""}`.trim()
        : currentUser?.email || "You",
      text: text.trim(),
      time: timeStr,
      read: true,
    };
    setChatMessages((prev) => [...prev, optimisticMsg]);
    recordMessageActivity(Date.now());
    sendHeartbeat(); // Reset backend inactivity timer on every sent message

    try {
      // Send via Tencent SDK — throws if SDK not ready or invalid UserSig
      const sdkMsgId = await trtcChat.sendMessage(partnerUserId, text.trim());

      // Replace optimistic message with the SDK-confirmed ID
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, id: sdkMsgId } : m
        )
      );
    } catch (err: any) {
      console.error("[TRTC] Failed to send message:", err);
      // Remove optimistic message on failure
      setChatMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      const msg =
        err.message?.includes("not ready") || err.message?.includes("UserSig")
          ? "Chat SDK not ready. Please refresh and try again."
          : "Failed to send message. Please check your connection.";
      showToast(msg, "error");
    }
  };

  // Send media (image, video, file) via unified upload endpoint + Tencent SDK
  const handleSendMedia = async (file: File, type: "image" | "video" | "file") => {
    if (!activeSession || !file) return;

    const partnerUserId = activeSession.partnerUser?.userId;
    if (!partnerUserId) {
      showToast("Cannot send media: partner user ID is unknown.", "error");
      return;
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const optimisticId = `optimistic_media_${Date.now()}`;
    const localPreviewUrl = URL.createObjectURL(file);

    const optimisticMsg: import("./components/ActiveChat").MessageItem = {
      id: optimisticId,
      sender: "user",
      senderInitials: (currentUser?.firstName?.[0] || currentUser?.email?.[0] || "U").toUpperCase(),
      senderName: currentUser?.firstName
        ? `${currentUser.firstName} ${currentUser.lastName || ""}`.trim()
        : currentUser?.email || "You",
      text: "",
      imageUrl: type === "image" ? localPreviewUrl : undefined,
      videoUrl: type === "video" ? localPreviewUrl : undefined,
      snapshotUrl: type === "video" ? localPreviewUrl : undefined,
      fileUrl: type === "file" ? localPreviewUrl : undefined,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      messageType: type,
      time: timeStr,
      read: true,
      isUploading: true,
    };

    setChatMessages((prev) => [...prev, optimisticMsg]);
    recordMessageActivity(Date.now());
    sendHeartbeat();

    try {
      const sdkMsgId = await trtcChat.sendMediaMessage(partnerUserId, file, type);
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId ? { ...m, id: sdkMsgId, isUploading: false } : m
        )
      );
    } catch (err: any) {
      console.error("[TRTC] Failed to send media:", err);
      setChatMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      const msg =
        err.response?.data?.error ||
        err.message ||
        "Failed to send attachment. Please check your connection.";
      showToast(msg, "error");
    }
  };

  if (checkingSession) {
    return (
      <div className="auth-page flex items-center justify-center min-h-screen bg-[#f7f9fb]">
        <div className="loading-container flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary-container border-t-transparent rounded-full animate-spin"></div>
          <div className="text-sm font-medium text-slate-600">Verifying session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f9fb] text-[#191c1e] relative">
      {/* 0. Admin Login View */}
      {currentView === "admin-login" && (
        <AdminLoginRegister
          onLoginSuccess={() => {
            window.location.hash = "#admin";
            setCurrentView("admin");
          }}
          onRegisterSuccess={() => {
            window.location.hash = "#admin";
            setCurrentView("admin");
          }}
          onBackToApp={() => {
            window.location.hash = "";
            setCurrentView("login");
          }}
        />
      )}

      {/* 0. Admin Dashboard View */}
      {currentView === "admin" && (
        <Admin
          onLogout={() => {
            logout().catch(() => undefined);
            window.location.hash = "#admin-login";
            setCurrentView("admin-login");
          }}
          onUnauthorized={() => {
            localStorage.removeItem("token");
            window.location.hash = "#admin-login";
            setCurrentView("admin-login");
          }}
          onNavigateHome={() => {
            window.location.hash = "";
            setCurrentView("login");
          }}
        />
      )}

      {/* 1. Login View */}
      {currentView === "login" && (
        <Login
          onSuccess={handleLoginSuccess}
          onSwitchToRegister={() => setCurrentView("register")}
          onSwitchToAdmin={() => {
            window.location.hash = "#admin-login";
            setCurrentView("admin-login");
          }}
        />
      )}

      {/* 2. Register View */}
      {currentView === "register" && (
        <Register
          onSuccess={handleRegisterSuccess}
          onSwitchToLogin={() => setCurrentView("login")}
        />
      )}

      {/* 3. Start Conversation View (When No Active Session) */}
      {currentView === "start-conversation" && (
        <>
          <SenderStartConversationReq
            currentUser={currentUser || undefined}
            pendingTarget={pendingSentTarget}
            onCancelPending={() => setPendingSentTarget(null)}
            onStartConversation={handleStartConversation}
            onLogout={handleLogout}
          />

          {/* Pending Incoming Requests List Component */}
          {incomingRequests && incomingRequests.length > 0 && (
            <div className="fixed bottom-6 right-6 z-40 max-w-md w-full px-4">
              <IncomingRequests
                requests={incomingRequests}
                onAccept={handleAcceptInvite}
                onReject={handleRejectInvite}
              />
            </div>
          )}

          {/* Incoming Invite Modal dialog */}
          {incomingInvite && (
            <ReceiveInvite
              isOpen={true}
              senderName={
                `${incomingInvite.sender.firstName || ""} ${incomingInvite.sender.lastName || ""}`.trim() ||
                incomingInvite.sender.userId ||
                "Client"
              }
              senderInitials={
                (
                  (incomingInvite.sender.firstName?.[0] || "") +
                  (incomingInvite.sender.lastName?.[0] || "U")
                ).toUpperCase()
              }
              senderId={incomingInvite.sender.userId || incomingInvite.sender.id}
              sessionId={incomingInvite.sender.userId || incomingInvite.sender.id}
              onAccept={() => handleAcceptInvite(incomingInvite.id)}
              onReject={() => handleRejectInvite(incomingInvite.id)}
            />
          )}
        </>
      )}

      {/* 4. Active Chat View: Robust ChatInterface with Network Status & Typing Indicator */}
      {currentView === "active-chat" && activeSession && (
        <div className="flex-1 flex flex-col min-h-screen">
          <ChatInterface
            currentUser={currentUser}
            partnerName={
              `${activeSession.partnerUser.firstName || ""} ${activeSession.partnerUser.lastName || ""}`.trim() ||
              activeSession.partnerUser.userId ||
              "Support Agent"
            }
            partnerRole={activeSession.isReceiver ? "Client / Requester" : "Support Lead"}
            partnerUserId={activeSession.partnerUser.userId}
            partnerInitials={
              (
                (activeSession.partnerUser.firstName?.[0] || "") +
                (activeSession.partnerUser.lastName?.[0] || "S")
              ).toUpperCase()
            }
            ticketId={activeSession.partnerUser.userId || `#SES-${activeSession.id.slice(0, 4)}`}
            isReceiver={activeSession.isReceiver} // Only receiver has End Chat option!
            messages={chatMessages} // Starts blank, messages appear dynamically!
            onEndChat={handleEndChat}
            onSendMessage={handleSendMessage}
            onSendMedia={handleSendMedia}
            onTypingActivity={() => recordMessageActivity(Date.now())}
            onToast={showToast}
          />
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <MainApp />
    </ToastProvider>
  );
}

export default App;
