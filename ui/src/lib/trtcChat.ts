/**
 * ============================================================
 * FILE: ui/src/lib/trtcChat.ts
 * ============================================================
 * PURPOSE:
 *   This is the single manager class for all Tencent Cloud Chat (IM) SDK
 *   operations in the frontend. It handles:
 *     - Initializing the SDK (once)
 *     - Logging in / logging out a user
 *     - Sending plain text messages (real-time, peer-to-peer)
 *     - Receiving incoming messages via SDK push events (NO polling here)
 *     - Sending debounced typing signals (custom messages)
 *     - Destroying conversations on session end (prevents message leakage)
 *
 * IMPORTANT — Where is the 5-second polling?
 *   The 5-second polling is NOT in this file. It lives in:
 *     → ui/src/hooks/useSession.ts  (line 97: setInterval(fetchStatus, 5000))
 *   That polling only checks SESSION STATUS (who has an active session,
 *   incoming invitations, etc.) by calling GET /api/session/status on our
 *   Node.js backend. It does NOT poll for chat messages.
 *
 *   Chat messages are pushed in real-time by the Tencent Cloud Chat SDK via
 *   the MESSAGE_RECEIVED event registered inside init() below — zero polling.
 * ============================================================
 */

import TencentCloudChat from "@tencentcloud/chat";
import { uploadFile } from "./api";

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Payload shape for custom (non-text) SDK messages.
 * Currently used for typing signals: { type: "TYPING_START" | "TYPING_STOP" }
 */
export interface CustomMessagePayload {
  type: string;
  [key: string]: any;
}

/**
 * Shape of an incoming message received from the Tencent SDK.
 * Supports text, image, video, and file attachments.
 */
export interface TrtcIncomingMessage {
  id: string;
  fromUserId: string;
  text?: string;
  imageUrl?: string;
  videoUrl?: string;
  snapshotUrl?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  time: string;
  createdAt: number;
  messageType: "text" | "image" | "video" | "file";
}

/** Internal type alias for callbacks that receive incoming messages */
type MessageListener = (msg: TrtcIncomingMessage) => void;


// ─────────────────────────────────────────────────────────────
// MAIN MANAGER CLASS
// ─────────────────────────────────────────────────────────────

class TrtcChatManager {
  // The raw Tencent Cloud Chat SDK instance (created once via init())
  private chatInstance: any = null;

  // The currently logged-in user's anonymous userId (e.g., "AS9j@Chat")
  private currentUserId: string | null = null;

  // Tracks whether the SDK has fired SDK_READY — only send messages when true
  private isReady: boolean = false;

  /** Public getter: true when SDK is logged in and ready to send/receive */
  public get ready(): boolean {
    return this.isReady;
  }

  // ── Typing debounce ──────────────────────────────────────────
  // Stores the last time a TYPING_START signal was sent to each user,
  // so we don't spam the network (max one signal per 2 seconds per user)
  private lastTypingSentMap: Map<string, number> = new Map();

  // ── Listener registries ──────────────────────────────────────
  // Set of callbacks to call when a typing state change is received from the partner
  private typingListeners: Set<(fromUserId: string, state: "start" | "stop") => void> = new Set();

  // Set of callbacks to call when a real TEXT message is received
  private messageListeners: Set<MessageListener> = new Set();

  // Set of callbacks to call when ANY custom message (non-TYPING) is received
  private customMessageListeners: Set<(payload: CustomMessagePayload, fromUserId: string) => void> = new Set();

  // ── BroadcastChannel for multi-tab typing sync ───────────────
  // Allows typing signals to be shared across browser tabs opened by the same user.
  // This is a browser-native API and falls back to null if unsupported.
  private broadcastChannel: BroadcastChannel | null = null;

  constructor() {
    // Only set up BroadcastChannel if running in a browser environment
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        // Create a named channel so all tabs of this app share typing events
        this.broadcastChannel = new BroadcastChannel("tencent_rtc_ephemeral_typing");

        // When another tab sends a typing signal over BroadcastChannel,
        // relay it to local typing listeners (so the "Partner is typing..." UI updates)
        this.broadcastChannel.onmessage = (event) => {
          if (
            (event.data?.type === "TYPING" ||
              event.data?.type === "TYPING_START" ||
              event.data?.type === "TYPING_STOP") &&
            event.data?.fromUserId
          ) {
            // Prevent self-echo across tabs
            if (this.currentUserId && event.data.fromUserId.toLowerCase() === this.currentUserId.toLowerCase()) {
              return;
            }
            this.notifyTypingListeners(
              event.data.fromUserId,
              event.data.type === "TYPING_STOP" ? "stop" : "start"
            );
          }
        };
      } catch {
        // BroadcastChannel creation can fail in some environments (e.g., private mode)
        this.broadcastChannel = null;
      }
    }
  }


  // ─────────────────────────────────────────────────────────────
  // init()
  // ─────────────────────────────────────────────────────────────
  /**
   * Initialize the Tencent Cloud Chat SDK with the given sdkAppId.
   *
   * Called once after login, using the sdkAppId from GET /api/chat/token.
   * Safe to call multiple times — returns the existing instance if already created.
   *
   * After init(), you MUST call login(userId, userSig) before sending messages.
   *
   * Flow:
   *   App.tsx (on login) → getChatToken() → trtcChat.init(sdkAppId) → trtcChat.login(...)
   */
  public init(sdkAppId: number) {
    // Guard: only create once — SDK does not support multiple instances
    if (this.chatInstance) return this.chatInstance;

    try {
      // Create the Tencent Cloud Chat SDK instance with our app's SDK App ID
      this.chatInstance = TencentCloudChat.create({ SDKAppID: sdkAppId });

      // ── SDK Lifecycle Events ──────────────────────────────────

      // SDK_READY fires once login() completes successfully.
      // Only after this event can we send messages.
      this.chatInstance.on(TencentCloudChat.EVENT.SDK_READY, () => {
        this.isReady = true;
        // The `ready` getter now returns true; sendMessage() is now safe to call
      });

      // SDK_NOT_READY fires if the SDK loses its connection or the user logs out.
      // We mark isReady = false so sendMessage() throws a clear error rather than failing silently.
      this.chatInstance.on(TencentCloudChat.EVENT.SDK_NOT_READY, () => {
        this.isReady = false;
      });

      // ── Incoming Message Handler ──────────────────────────────
      // This is the REAL-TIME push listener from Tencent's cloud servers.
      // When the partner sends a message, Tencent pushes it here instantly —
      // NO polling, NO setInterval — this is a WebSocket-based push.
      this.chatInstance.on(TencentCloudChat.EVENT.MESSAGE_RECEIVED, (event: any) => {
        const messageList: any[] = event?.data || [];

        // A single push event can contain multiple messages (batched delivery)
        for (const message of messageList) {

          const now = new Date();
          const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const createdAt = message.time ? message.time * 1000 : Date.now();
          const senderId = message.from || message.sender || "";
          const baseId = message.ID || message.id || `trtc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

          // ── CASE 1: Plain text message ───────────────────────
          if (message.type === TencentCloudChat.TYPES.MSG_TEXT) {
            const incomingMsg: TrtcIncomingMessage = {
              id: baseId,
              fromUserId: senderId,
              text: message.payload?.text || "",
              time: timeStr,
              createdAt,
              messageType: "text",
            };
            this.notifyMessageListeners(incomingMsg);
          }

          // ── CASE 2: Image message ────────────────────────────
          else if (message.type === TencentCloudChat.TYPES.MSG_IMAGE) {
            const imageUrl =
              message.payload?.imageInfoArray?.[0]?.url ||
              message.payload?.imageInfoArray?.[1]?.url ||
              message.payload?.url ||
              message.payload?.fileUrl ||
              "";
            const incomingMsg: TrtcIncomingMessage = {
              id: baseId,
              fromUserId: senderId,
              imageUrl,
              time: timeStr,
              createdAt,
              messageType: "image",
            };
            this.notifyMessageListeners(incomingMsg);
          }

          // ── CASE 3: Video message ────────────────────────────
          else if (message.type === TencentCloudChat.TYPES.MSG_VIDEO) {
            const videoUrl = message.payload?.videoUrl || message.payload?.url || "";
            const snapshotUrl =
              message.payload?.snapshotUrl ||
              message.payload?.videoSnapshotUrl ||
              message.payload?.thumbnailUrl ||
              videoUrl;
            const incomingMsg: TrtcIncomingMessage = {
              id: baseId,
              fromUserId: senderId,
              videoUrl,
              snapshotUrl,
              time: timeStr,
              createdAt,
              messageType: "video",
            };
            this.notifyMessageListeners(incomingMsg);
          }

          // ── CASE 4: File message ─────────────────────────────
          else if (message.type === TencentCloudChat.TYPES.MSG_FILE) {
            const fileUrl = message.payload?.fileUrl || message.payload?.url || "";
            const fileName = message.payload?.fileName || message.payload?.name || "attachment";
            const fileSize = message.payload?.fileSize || message.payload?.size || 0;
            const incomingMsg: TrtcIncomingMessage = {
              id: baseId,
              fromUserId: senderId,
              fileUrl,
              fileName,
              fileSize,
              time: timeStr,
              createdAt,
              messageType: "file",
            };
            this.notifyMessageListeners(incomingMsg);
          }

          // ── CASE 5: Custom message (signals or fallback media) ─
          else if (message.type === TencentCloudChat.TYPES.MSG_CUSTOM) {
            try {
              const rawData = message.payload?.data;
              const parsed = typeof rawData === "string" ? JSON.parse(rawData) : rawData;

              if (parsed?.type === "TYPING" || parsed?.type === "TYPING_START" || parsed?.type === "TYPING_STOP") {
                if (this.currentUserId && senderId.toLowerCase() === this.currentUserId.toLowerCase()) {
                  continue;
                }
                this.notifyTypingListeners(senderId, parsed.type === "TYPING_STOP" ? "stop" : "start");
              } else if (parsed?.type === "MEDIA") {
                // Incoming custom media payload
                const incomingMsg: TrtcIncomingMessage = {
                  id: baseId,
                  fromUserId: senderId,
                  text: parsed.text || "",
                  imageUrl: parsed.imageUrl,
                  videoUrl: parsed.videoUrl,
                  snapshotUrl: parsed.snapshotUrl,
                  fileUrl: parsed.fileUrl,
                  fileName: parsed.fileName,
                  fileSize: parsed.fileSize,
                  mimeType: parsed.mimeType,
                  time: timeStr,
                  createdAt,
                  messageType: parsed.mediaType || "file",
                };
                this.notifyMessageListeners(incomingMsg);
              } else {
                // Other control signals (REQUEST_END_SESSION, SESSION_ENDED, INVITE_REJECTED)
                this.notifyCustomMessageListeners(parsed, senderId);
              }
            } catch {
              // Ignore malformed custom messages
            }
          }
        }
      });

    } catch (err) {
      // SDK init can fail if SDKAppID is invalid or the environment is incompatible.
      // We warn but don't throw — the app gracefully falls back (no messages sent/received).
      console.warn("[TRTC] Chat init fallback:", err);
    }

    return this.chatInstance;
  }


  // ─────────────────────────────────────────────────────────────
  // login()
  // ─────────────────────────────────────────────────────────────
  /**
   * Authenticate the current user with the Tencent Cloud Chat SDK.
   *
   * Called after init(), using the userId + userSig from GET /api/chat/token.
   * The userSig is a JWT-like token generated by our backend using the TRTC Secret Key.
   *
   * Returns true if login succeeded, false if it failed (errors are non-fatal).
   *
   * Flow:
   *   getChatToken() → { sdkAppId, userId, userSig }
   *   → trtcChat.init(sdkAppId)
   *   → trtcChat.login(userId, userSig)   ← HERE
   *   → SDK fires SDK_READY → isReady = true
   */
  public async login(userId: string, userSig: string): Promise<boolean> {
    // Track who is logged in so we can attribute outgoing messages
    this.currentUserId = userId;

    // Can't login if SDK was never initialized
    if (!this.chatInstance) return false;

    try {
      await this.chatInstance.login({
        userID: userId,
        userSig: userSig,
      });
      return true;
    } catch (err) {
      // Login can fail if userSig is expired, malformed, or SDKAppID doesn't match.
      // We warn but don't throw — the app still works for session management.
      console.warn("[TRTC] Chat login warning:", err);
      return false;
    }
  }


  // ─────────────────────────────────────────────────────────────
  // logout()
  // ─────────────────────────────────────────────────────────────
  /**
   * Log out the current user from the Tencent Cloud Chat SDK.
   *
   * Called in two places from App.tsx:
   *   1. handleLogout() — user clicks Sign Out
   *   2. (implicitly) when a session ends, to clear the SDK state
   *
   * After logout(), isReady = false and sendMessage() will throw.
   */
  public async logout(): Promise<void> {
    if (!this.chatInstance) return;
    try {
      await this.chatInstance.logout();
      this.isReady = false;
      this.currentUserId = null;
    } catch (err) {
      console.warn("[TRTC] Chat logout error:", err);
    }
  }


  // ─────────────────────────────────────────────────────────────
  // sendMessage()
  // ─────────────────────────────────────────────────────────────
  /**
   * Send a plain text message to a partner user via the Tencent Cloud Chat SDK.
   *
   * This is the PRIMARY messaging method. It uses a C2C (Client-to-Client)
   * conversation type, meaning messages go directly between two users.
   *
   * Returns the Tencent-assigned message ID on success.
   * Throws an Error if the SDK is not initialized, not ready, or sends fail.
   *
   * Called from: App.tsx → handleSendMessage() → trtcChat.sendMessage(partnerUserId, text)
   *
   * Optimistic UI flow:
   *   1. App.tsx immediately adds an optimistic message to chatMessages state
   *   2. This method is called to confirm delivery via SDK
   *   3. On success: optimistic ID is replaced with real SDK message ID
   *   4. On failure: optimistic message is removed and an error toast is shown
   */
  public async sendMessage(toUserId: string, text: string): Promise<string> {
    // Guard: SDK must be initialized via init() before sending
    if (!this.chatInstance) {
      throw new Error("[TRTC] SDK not initialized. Call init() and login() first.");
    }

    // Guard: SDK must have received SDK_READY event (i.e., login completed)
    if (!this.isReady) {
      throw new Error("[TRTC] SDK not ready. Please ensure login completed successfully.");
    }

    // Guard: basic input validation
    if (!toUserId || !text.trim()) {
      throw new Error("[TRTC] toUserId and text are required.");
    }

    // The typing indicator must disappear before the partner receives the message.
    await this.stopTypingSignal(toUserId);

    // Build a Tencent text message object (C2C = peer-to-peer, not group)
    const message = this.chatInstance.createTextMessage({
      to: toUserId,
      conversationType: TencentCloudChat.TYPES.CONV_C2C,
      payload: { text: text.trim() },
    });

    // Actually send the message through Tencent's network
    const result = await this.chatInstance.sendMessage(message);

    // Extract the SDK-assigned message ID for deduplication in React state
    const msgId =
      result?.data?.message?.ID ||
      result?.data?.message?.id ||
      `trtc_sent_${Date.now()}`; // Fallback if SDK doesn't return an ID

    return msgId;
  }


  // ─────────────────────────────────────────────────────────────
  // sendMediaMessage()
  // ─────────────────────────────────────────────────────────────
  /**
   * Send a media message (image, video, or document file) to the partner.
   *
   * Flow:
   *   1. Uploads file to backend via POST /api/upload (returns { url, thumbnailUrl, mimeType, size, fileName })
   *   2. Creates type-specific SDK message (createImageMessage / createVideoMessage / createFileMessage)
   *   3. Sends via SDK and returns the message ID
   *   4. Falls back seamlessly to custom media message if direct SDK upload bucket is unconfigured
   */
  public async sendMediaMessage(
    toUserId: string,
    file: File,
    type: "image" | "video" | "file"
  ): Promise<string> {
    if (!this.chatInstance) {
      throw new Error("[TRTC] SDK not initialized. Call init() and login() first.");
    }
    if (!this.isReady) {
      throw new Error("[TRTC] SDK not ready. Please ensure login completed successfully.");
    }
    if (!toUserId || !file) {
      throw new Error("[TRTC] toUserId and file are required.");
    }

    // Attachments also end any active typing state before delivery.
    await this.stopTypingSignal(toUserId);

    // Step 1: Upload via unified upload endpoint
    const uploadRes = await uploadFile(file);

    // Step 2: Create type-specific message
    let message: any;
    try {
      if (type === "image") {
        message = this.chatInstance.createImageMessage({
          to: toUserId,
          conversationType: TencentCloudChat.TYPES.CONV_C2C,
          payload: { file, url: uploadRes.url },
        });
      } else if (type === "video") {
        message = this.chatInstance.createVideoMessage({
          to: toUserId,
          conversationType: TencentCloudChat.TYPES.CONV_C2C,
          payload: {
            file,
            videoUrl: uploadRes.url,
            snapshotUrl: uploadRes.thumbnailUrl || uploadRes.url,
          },
        });
      } else {
        message = this.chatInstance.createFileMessage({
          to: toUserId,
          conversationType: TencentCloudChat.TYPES.CONV_C2C,
          payload: {
            file,
            url: uploadRes.url,
            fileName: file.name,
            fileSize: file.size,
          },
        });
      }

      // Step 3: Send
      const result = await this.chatInstance.sendMessage(message);
      const sdkId =
        result?.data?.message?.ID ||
        result?.data?.message?.id ||
        `trtc_${type}_${Date.now()}`;
      return sdkId;
    } catch (sdkErr) {
      console.warn("[TRTC] Direct SDK media send failed, dispatching via media payload fallback:", sdkErr);

      // Fallback: Send custom media message carrying uploaded URL
      const customPayload: CustomMessagePayload = {
        type: "MEDIA",
        mediaType: type,
        url: uploadRes.url,
        imageUrl: type === "image" ? uploadRes.url : undefined,
        videoUrl: type === "video" ? uploadRes.url : undefined,
        snapshotUrl: type === "video" ? (uploadRes.thumbnailUrl || uploadRes.url) : undefined,
        fileUrl: type === "file" ? uploadRes.url : undefined,
        fileName: file.name,
        fileSize: file.size,
        mimeType: uploadRes.mimeType || file.type,
      };

      const fallbackMsg = this.chatInstance.createCustomMessage({
        to: toUserId,
        conversationType: TencentCloudChat.TYPES.CONV_C2C,
        payload: {
          data: JSON.stringify(customPayload),
          description: `[${type.toUpperCase()}] ${file.name}`,
          extension: "",
        },
      });

      const fallbackRes = await this.chatInstance.sendMessage(fallbackMsg);
      return fallbackRes?.data?.message?.ID || `trtc_custom_${Date.now()}`;
    }
  }


  // ─────────────────────────────────────────────────────────────
  // destroyConversation()
  // ─────────────────────────────────────────────────────────────
  /**
   * Delete the C2C conversation with a given user from the SDK's local store.
   *
   * This is critical for our "ephemeral" design — when a session ends,
   * all message history must be wiped so the next session starts completely blank.
   *
   * Called from App.tsx in two places:
   *   1. handleEndChat()  — receiver clicks "End Conversation"
   *   2. handleLogout()   — user clicks "Sign Out"
   *
   * If this is NOT called, Tencent would keep showing old messages when a
   * new session starts with the same partner — violating the ephemeral design.
   */
  public async destroyConversation(withUserId: string): Promise<void> {
    if (!this.chatInstance || !withUserId) return;
    try {
      // Tencent's conversation ID format for C2C (peer-to-peer) is "C2C" + userId
      const conversationID = `C2C${withUserId}`;
      await this.chatInstance.deleteConversation({ conversationID });
    } catch (err) {
      // Non-fatal: if conversation doesn't exist or delete fails, we still continue
      console.warn("[TRTC] destroyConversation warning:", err);
    }
  }


  // ─────────────────────────────────────────────────────────────
  // onMessage()
  // ─────────────────────────────────────────────────────────────
  /**
   * Register a callback to receive incoming text messages pushed by the SDK.
   *
   * This is the subscription mechanism used by App.tsx to update React state
   * when the partner sends a message. There is NO polling involved —
   * messages arrive in real-time via the SDK's WebSocket connection.
   *
   * Returns an unsubscribe function — call it in useEffect's cleanup to avoid
   * memory leaks when the component unmounts.
   *
   * Used in: App.tsx → useEffect → trtcChat.onMessage(callback)
   */
  public onMessage(callback: MessageListener): () => void {
    this.messageListeners.add(callback);
    // Return cleanup function (used in React useEffect return)
    return () => {
      this.messageListeners.delete(callback);
    };
  }


  // ─────────────────────────────────────────────────────────────
  // sendCustomMessage()
  // ─────────────────────────────────────────────────────────────
  /**
   * Send a lightweight custom (non-text) message to a user via the SDK.
   *
   * Used for typing signals and other lightweight conversation controls.
   * Custom messages are NOT shown in the chat UI — they're control signals only.
   *
   * Also posts to BroadcastChannel so typing signals work across multiple
   * browser tabs opened by the same user.
   *
   * Errors are non-fatal because custom messages are supplementary controls.
   */
  public async sendCustomMessage(toUserId: string, payload: CustomMessagePayload): Promise<any> {
    if (!toUserId) return null;

    // ── Step 1: Broadcast to other tabs via BroadcastChannel ────
    // This syncs typing signals across multiple tabs of the same user.
    // For example, if a user has two tabs open, both will show "Partner is typing..."
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          ...payload,
          fromUserId: this.currentUserId,
          toUserId,
        });
      } catch {}
    }

    // ── Step 2: Send via Tencent SDK to the actual partner ──────
    // If SDK is not initialized, skip the supplementary control message.
    if (!this.chatInstance) {
      return null;
    }

    try {
      // Build a custom message (Tencent's format for non-text payloads)
      const message = this.chatInstance.createCustomMessage({
        to: toUserId,
        conversationType: TencentCloudChat.TYPES.CONV_C2C,
        payload: {
          data: JSON.stringify(payload),        // Must be a string
          description: payload.type || "custom_signal",
          extension: "",
        },
      });

      const res = await this.chatInstance.sendMessage(message);
      return res;
    } catch (err) {
      console.warn("[TRTC] sendCustomMessage error (handled gracefully):", err);
      return null;
    }
  }


  // ─────────────────────────────────────────────────────────────
  // sendTypingSignal()
  // ─────────────────────────────────────────────────────────────
  /**
   * Send a debounced typing signal to the partner.
   *
   * Called from ChatInterface.tsx → handleInputChange() whenever the user types.
   * Debounced to fire at most once every 2 seconds to avoid spamming the network.
   *
   * The partner's client receives this as a CUSTOM message and shows
   * "Partner is typing..." until an explicit stop signal is received.
   */
  public async sendTypingSignal(toUserId: string): Promise<void> {
    if (!toUserId) return;

    const now = Date.now();
    const lastSent = this.lastTypingSentMap.get(toUserId) || 0;

    // Debounce: skip if we sent a typing signal less than 2 seconds ago
    if (now - lastSent < 2000) {
      return;
    }

    // Record the send time, then dispatch the signal
    this.lastTypingSentMap.set(toUserId, now);
    await this.sendCustomMessage(toUserId, { type: "TYPING_START" });
  }

  /** End the partner's typing indicator immediately. Safe to call repeatedly. */
  public async stopTypingSignal(toUserId: string): Promise<void> {
    if (!toUserId) return;

    // A subsequent keystroke should be allowed to create a fresh start signal.
    this.lastTypingSentMap.delete(toUserId);
    await this.sendCustomMessage(toUserId, { type: "TYPING_STOP" });
  }


  // ─────────────────────────────────────────────────────────────
  // onTyping()
  // ─────────────────────────────────────────────────────────────
  /**
   * Register a callback to receive typing signals from the partner.
   *
   * Used in: ChatInterface.tsx → useEffect → trtcChat.onTyping(callback)
   * The callback receives either a start or stop state for the partner's
   * typing indicator; the UI retains a short timeout only as a disconnect fallback.
   *
   * Returns an unsubscribe function for useEffect cleanup.
   */
  public onTyping(callback: (fromUserId: string, state: "start" | "stop") => void): () => void {
    this.typingListeners.add(callback);
    return () => {
      this.typingListeners.delete(callback);
    };
  }


  // ─────────────────────────────────────────────────────────────
  // onCustomMessage()
  // ─────────────────────────────────────────────────────────────
  /**
   * Register a callback to receive custom (non-TYPING) messages from the partner.
   *
   * Used in: App.tsx → useEffect → trtcChat.onCustomMessage(callback)
   * Current consumers handle session lifecycle and invitation control signals.
   *
   * Returns an unsubscribe function for useEffect cleanup.
   */
  public onCustomMessage(callback: (payload: CustomMessagePayload, fromUserId: string) => void): () => void {
    this.customMessageListeners.add(callback);
    return () => {
      this.customMessageListeners.delete(callback);
    };
  }


  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Dispatch a received text message to all registered onMessage() callbacks.
   * Each listener runs in a try/catch so one failing listener can't break others.
   */
  private notifyMessageListeners(msg: TrtcIncomingMessage) {
    this.messageListeners.forEach((listener) => {
      try {
        listener(msg);
      } catch (err) {
        console.error("[TRTC] Error in message listener:", err);
      }
    });
  }

  /**
   * Dispatch a typing signal to all registered onTyping() callbacks.
   * Each listener runs in a try/catch so one failing listener can't break others.
   */
  private notifyTypingListeners(fromUserId: string, state: "start" | "stop") {
    this.typingListeners.forEach((listener) => {
      try {
        listener(fromUserId, state);
      } catch (err) {
        console.error("[TRTC] Error in typing listener:", err);
      }
    });
  }

  /**
   * Dispatch a custom (non-TYPING) message to all registered onCustomMessage() callbacks.
   * Each listener runs in a try/catch so one failing listener can't break others.
   */
  private notifyCustomMessageListeners(payload: CustomMessagePayload, fromUserId: string) {
    this.customMessageListeners.forEach((listener) => {
      try {
        listener(payload, fromUserId);
      } catch (err) {
        console.error("[TRTC] Error in custom message listener:", err);
      }
    });
  }
}


// ─────────────────────────────────────────────────────────────
// SINGLETON EXPORT
// ─────────────────────────────────────────────────────────────
/**
 * A single shared instance of TrtcChatManager for the entire app.
 * Imported and used by:
 *   - App.tsx            → init, login, logout, sendMessage, onMessage, destroyConversation
 *   - ChatInterface.tsx  → onTyping, sendTypingSignal
 */
export const trtcChat = new TrtcChatManager();
export default trtcChat;
