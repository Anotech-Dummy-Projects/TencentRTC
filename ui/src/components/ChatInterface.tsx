import React, { useState, useEffect, useRef } from "react";
import EmojiPicker, { Theme, type EmojiClickData } from "emoji-picker-react";
import type { MessageItem } from "./ActiveChat";
import { trtcChat } from "../lib/trtcChat";
import type { User } from "../types/api";

export interface ChatInterfaceProps {
  currentUser?: User | null;
  partnerName?: string;
  partnerRole?: string;
  partnerUserId?: string;
  partnerInitials?: string;
  ticketId?: string;
  isReceiver?: boolean; // STRICT RULE: Only receiver person has option to end chat!
  messages?: MessageItem[];
  onSendMessage?: (text: string) => Promise<void> | void;
  onSendMedia?: (file: File, type: "image" | "video" | "file") => Promise<void> | void;
  onEndChat?: () => Promise<void> | void;
  onTypingActivity?: () => void;
  onToast?: (message: string, type?: "success" | "error" | "info" | "warning") => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  currentUser,
  partnerName = "Support Agent",
  partnerRole = "Active Session",
  partnerInitials = "SA",
  partnerUserId,
  ticketId = "#SES-9482",
  isReceiver = true,
  messages: externalMessages,
  onSendMessage,
  onSendMedia,
  onEndChat,
  onTypingActivity,
  onToast,
}) => {
  // Messages state
  const [internalMessages, setInternalMessages] = useState<MessageItem[]>([]);
  const messages = externalMessages !== undefined ? externalMessages : internalMessages;

  const [inputMessage, setInputMessage] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isEnding, setIsEnding] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Attachment Menu & Zoom Modal State
  const [isMediaMenuOpen, setIsMediaMenuOpen] = useState<boolean>(false);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState<boolean>(false);
  const [selectedImageForZoom, setSelectedImageForZoom] = useState<string | null>(null);

  const mediaMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Network Status listener: online / offline
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  // 2. Typing indicator state
  const [isPartnerTyping, setIsPartnerTyping] = useState<boolean>(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Online / Offline event listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (onToast) onToast("Internet connection restored.", "success");
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (onToast) onToast("Internet connection lost. You are offline.", "error");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [onToast]);

  // Close attachment dropdown when clicking outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (mediaMenuRef.current && !mediaMenuRef.current.contains(e.target as Node)) {
        setIsMediaMenuOpen(false);
      }
    };
    if (isMediaMenuOpen) {
      document.addEventListener("mousedown", handleMouseDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
    };
  }, [isMediaMenuOpen]);

  // Close the emoji picker when clicking elsewhere or pressing Escape.
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setIsEmojiPickerOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsEmojiPickerOpen(false);
    };

    if (isEmojiPickerOpen) {
      document.addEventListener("mousedown", handleMouseDown);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEmojiPickerOpen]);

  // Subscribe to typing signal from Tencent SDK / trtcChat
  useEffect(() => {
    const stopShowingPartnerTyping = () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      setIsPartnerTyping(false);
    };

    const unsubscribe = trtcChat.onTyping((fromUserId, state) => {
      // Ignore typing from ourselves!
      if (
        currentUser?.userId &&
        fromUserId &&
        fromUserId.toLowerCase() === currentUser.userId.toLowerCase()
      ) {
        return;
      }

      if (partnerUserId && fromUserId && fromUserId.toLowerCase() === partnerUserId.toLowerCase()) {
        if (state === "stop") {
          stopShowingPartnerTyping();
          return;
        }

        setIsPartnerTyping(true);

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          stopShowingPartnerTyping();
        }, 2000);
      }
    });

    return () => {
      unsubscribe();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (typingIdleTimeoutRef.current) {
        clearTimeout(typingIdleTimeoutRef.current);
      }
    };
  }, [partnerUserId, currentUser?.userId]);

  // A real incoming partner message is also a reliable fallback for a missed stop signal.
  useEffect(() => {
    const latestMessage = messages[messages.length - 1];
    if (latestMessage?.sender === "agent") {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setIsPartnerTyping(false);
    }
  }, [messages]);

  // Active session timer counting up from 00:00
  useEffect(() => {
    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (seconds: number) => {
    const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
    const secs = String(seconds % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes || bytes <= 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isPartnerTyping]);

  // Handle typing in the input field with debounced typing signal
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputMessage(text);

    if (text.trim() && partnerUserId) {
      trtcChat.sendTypingSignal(partnerUserId);
      if (typingIdleTimeoutRef.current) clearTimeout(typingIdleTimeoutRef.current);
      typingIdleTimeoutRef.current = setTimeout(() => {
        trtcChat.stopTypingSignal(partnerUserId);
      }, 1000);
    } else if (partnerUserId) {
      if (typingIdleTimeoutRef.current) clearTimeout(typingIdleTimeoutRef.current);
      trtcChat.stopTypingSignal(partnerUserId);
    }

    if (onTypingActivity) {
      onTypingActivity();
    }
  };

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setInputMessage((prev) => prev + emojiData.emoji);
    setIsEmojiPickerOpen(false);
  };

  // Safe message sending
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputMessage.trim();
    if (!trimmed || isSending) return;

    if (typingIdleTimeoutRef.current) clearTimeout(typingIdleTimeoutRef.current);

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const newMsg: MessageItem = {
      id: `msg-${Date.now()}`,
      sender: "user",
      text: trimmed,
      time: timeStr,
      read: true,
      messageType: "text",
    };

    setInputMessage("");

    try {
      setIsSending(true);
      if (externalMessages === undefined) {
        setInternalMessages((prev) => [...prev, newMsg]);
      }

      if (onSendMessage) {
        await onSendMessage(trimmed);
      }
    } catch (err: any) {
      console.warn("Message send failed safely:", err);
      if (onToast) {
        onToast("Failed to deliver message. Please check your network.", "error");
      }
    } finally {
      setIsSending(false);
    }
  };

  // Handle file input selections
  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "image" | "video" | "file"
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so the same file can be picked again if needed
    e.target.value = "";
    setIsMediaMenuOpen(false);

    if (onSendMedia) {
      onSendMedia(file, type);
    }
  };

  const handleEndChatClick = async () => {
    if (!isReceiver) {
      alert("Only the receiver person has the option to end the chat session.");
      return;
    }

    if (confirm("Are you sure you want to end this conversation session?")) {
      try {
        setIsEnding(true);
        if (onEndChat) {
          await onEndChat();
        }
      } catch (err: any) {
        console.warn("End chat error:", err);
      } finally {
        setIsEnding(false);
      }
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-2 sm:p-4 md:p-8 bg-slate-100 min-h-[calc(100vh-1rem)] text-slate-800 antialiased">
      {/* Lightbox Image Zoom Modal */}
      {selectedImageForZoom && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedImageForZoom(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setSelectedImageForZoom(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-1 text-2xl font-bold cursor-pointer"
              title="Close preview (Esc)"
            >
              ✕
            </button>
            <img
              src={selectedImageForZoom}
              alt="Enlarged preview"
              className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Main chat application container */}
      <main
        className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-xl flex flex-col h-[750px] max-h-[92vh] overflow-hidden relative"
        data-purpose="chat-interface-window"
      >
        {/* Network Status Banner */}
        {!isOnline && (
          <div
            className="w-full bg-red-600 text-white text-xs font-semibold py-2 px-4 text-center flex items-center justify-center gap-2 shadow-sm transition-all duration-200 sticky top-0 z-40"
            role="alert"
            data-purpose="offline-indicator-banner"
          >
            <span className="material-symbols-outlined text-[16px] animate-pulse">wifi_off</span>
            <span>No internet. Trying to reconnect...</span>
          </div>
        )}

        {/* Top Header */}
        <header
          className="px-4 sm:px-6 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0"
          data-purpose="chat-header"
        >
          {/* Left side: Partner info & status */}
          <div className="flex items-center gap-3.5">
            <div className="relative">
              <div className="w-11 h-11 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-base shadow-xs">
                {partnerInitials}
              </div>
              {/* Online indicator dot */}
              <span
                className={`absolute bottom-0 right-0 w-3.5 h-3.5 border-2 border-white rounded-full ${
                  isOnline ? "bg-emerald-500" : "bg-slate-400"
                }`}
                title={isOnline ? "Online" : "Offline"}
              ></span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-slate-900 leading-none">
                  {partnerName}
                </h1>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                  {partnerRole}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                {partnerUserId ? (
                  <span className="font-mono font-medium text-slate-600">{partnerUserId}</span>
                ) : ticketId ? (
                  <span className="font-mono font-medium text-slate-600">{ticketId}</span>
                ) : null}
                <span>•</span>
                <span className="inline-flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-slate-400">schedule</span>
                  <span className="font-mono" id="session-timer">
                    {formatTimer(timerSeconds)}
                  </span>
                </span>
                {/* Typing status indicator in header */}
                {isPartnerTyping && (
                  <>
                    <span>•</span>
                    <span className="inline-flex items-center gap-1 text-indigo-600 font-medium animate-pulse">
                      <span className="material-symbols-outlined text-[14px]">edit_note</span>
                      <span>{partnerName} is typing...</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Right side: Current User badge & ONLY RECEIVER CAN END SESSION */}
          <div className="flex items-center gap-3">
            {currentUser && (
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="font-medium text-slate-700">
                  You: {currentUser.firstName ? `${currentUser.firstName} ${currentUser.lastName || ""}`.trim() : currentUser.email}
                </span>
                <span className="font-mono text-[11px] text-slate-400">({currentUser.userId})</span>
              </div>
            )}
            {isReceiver ? (
              <button
                aria-label="End conversation session"
                className="inline-flex items-center gap-1.5 px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-xl transition-all duration-150 shadow-xs focus:outline-none focus:ring-2 focus:ring-red-400 cursor-pointer disabled:opacity-60"
                data-purpose="terminate-chat-button"
                id="btn-end-chat"
                onClick={handleEndChatClick}
                disabled={isEnding}
                type="button"
                title="Receiver termination control"
              >
                <span className="material-symbols-outlined text-[18px]">call_end</span>
                <span>{isEnding ? "Ending..." : "End Conversation"}</span>
              </button>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-500 font-medium">
                <span className="material-symbols-outlined text-[15px] text-slate-400">lock</span>
                <span>Receiver controls session end</span>
              </div>
            )}
          </div>
        </header>

        {/* Message Feed Area */}
        <section
          aria-label="Conversation history"
          className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4 bg-slate-50/50"
          data-purpose="message-feed"
        >
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <div className="w-16 h-16 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center mb-3 text-indigo-500">
                <span className="material-symbols-outlined text-[32px]">chat</span>
              </div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">
                Direct Encrypted Session Started
              </h3>
              <p className="text-xs text-slate-500 max-w-sm">
                This ephemeral chat room starts blank. Send text messages, images, videos, or documents in real time.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.sender === "user";
              const isImage = msg.messageType === "image" || !!msg.imageUrl;
              const isVideo = msg.messageType === "video" || !!msg.videoUrl;
              const isFile = msg.messageType === "file" || (!isImage && !isVideo && !!msg.fileUrl);

              return (
                <article
                  key={msg.id}
                  className={`flex items-end gap-2.5 max-w-[85%] sm:max-w-[75%] ${
                    isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 shadow-xs ${
                      isUser
                        ? "bg-blue-600 text-white"
                        : "bg-indigo-100 text-indigo-700 border border-indigo-200"
                    }`}
                  >
                    {isUser ? "ME" : (msg.senderInitials || partnerInitials)}
                  </div>

                  <div
                    className={`rounded-2xl shadow-xs text-sm leading-relaxed overflow-hidden ${
                      isImage || isVideo
                        ? isUser
                          ? "bg-blue-600 text-white rounded-br-none p-1.5 sm:p-2"
                          : "bg-white border border-slate-200 text-slate-800 rounded-bl-none p-1.5 sm:p-2"
                        : isUser
                        ? "bg-blue-600 text-white rounded-br-none p-3.5"
                        : "bg-white border border-slate-200 text-slate-800 rounded-bl-none p-3.5"
                    }`}
                  >
                    {/* CASE 1: Image Message */}
                    {isImage && (
                      <div className="relative group">
                        <img
                          src={msg.imageUrl}
                          alt={msg.fileName || "Shared image"}
                          className="max-w-[240px] sm:max-w-[320px] max-h-[320px] w-auto h-auto rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity"
                          onClick={() => msg.imageUrl && setSelectedImageForZoom(msg.imageUrl)}
                          loading="lazy"
                        />
                        {msg.isUploading && (
                          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-xl flex items-center justify-center text-white gap-2">
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-medium">Uploading...</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CASE 2: Video Message */}
                    {isVideo && (
                      <div className="relative max-w-[260px] sm:max-w-[340px]">
                        <video
                          controls
                          playsInline
                          preload="metadata"
                          src={msg.videoUrl}
                          poster={msg.snapshotUrl}
                          className="w-full max-h-[280px] rounded-xl bg-black/90 object-contain"
                        />
                        {msg.isUploading && (
                          <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px] rounded-xl flex items-center justify-center text-white gap-2">
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-medium">Uploading video...</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CASE 3: File Attachment Message */}
                    {isFile && (
                      <div className="min-w-[210px] sm:min-w-[260px] max-w-[320px]">
                        <div
                          className={`flex items-center gap-3 p-2.5 rounded-xl border ${
                            isUser
                              ? "bg-blue-700/60 border-blue-500/40 text-white"
                              : "bg-slate-50 border-slate-200 text-slate-800"
                          }`}
                        >
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                              isUser
                                ? "bg-blue-800/80 text-blue-200"
                                : "bg-indigo-50 text-indigo-600 border border-indigo-100"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[24px]">description</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate" title={msg.fileName || "Attachment"}>
                              {msg.fileName || "Attachment"}
                            </p>
                            <p className={`text-[11px] mt-0.5 ${isUser ? "text-blue-200" : "text-slate-400"}`}>
                              {formatFileSize(msg.fileSize)}
                            </p>
                          </div>
                          {msg.fileUrl && !msg.isUploading && (
                            <a
                              href={msg.fileUrl}
                              download={msg.fileName || "attachment"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`p-2 rounded-lg transition-colors shrink-0 ${
                                isUser ? "hover:bg-blue-600 text-white" : "hover:bg-slate-200 text-slate-600"
                              }`}
                              title="Download attachment"
                            >
                              <span className="material-symbols-outlined text-[20px]">download</span>
                            </a>
                          )}
                          {msg.isUploading && (
                            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin shrink-0"></div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Optional text caption or plain text message */}
                    {msg.text && (
                      <p className={`whitespace-pre-wrap break-words ${isImage || isVideo ? "px-1 pt-1.5 pb-0.5" : ""}`}>
                        {msg.text}
                      </p>
                    )}

                    {/* Timestamp and status */}
                    <div
                      className={`text-[10px] mt-1 flex items-center gap-1 ${
                        isImage || isVideo ? "px-1 pb-0.5" : ""
                      } ${isUser ? "text-blue-100 justify-end" : "text-slate-400 justify-start"}`}
                    >
                      <span>{msg.time}</span>
                      {isUser && !msg.isUploading && (
                        <span className="material-symbols-outlined text-[13px]">done_all</span>
                      )}
                      {isUser && msg.isUploading && (
                        <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}

          {/* Floating typing signal in feed */}
          {isPartnerTyping && (
            <div className="flex items-center gap-2 max-w-[75%] mr-auto">
              <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center text-[10px] font-bold shadow-xs">
                {partnerInitials}
              </div>
              <div className="bg-white border border-slate-200 px-3 py-2 rounded-2xl rounded-bl-none text-xs text-slate-500 shadow-xs flex items-center gap-1.5">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                </span>
                <span className="ml-1 italic font-medium">{partnerName} is typing...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </section>

        {/* Input Bar with Attachment Dropdown & Media Triggers */}
        <footer className="p-3 sm:p-4 bg-white border-t border-slate-200 shrink-0">
          <form onSubmit={handleSend} className="flex items-center gap-2 relative">
            {/* Attachment Dropdown Menu Container */}
            <div className="relative" ref={mediaMenuRef}>
              {/* Floating Dropdown Menu (matching user design) */}
              {isMediaMenuOpen && (
                <div
                  className="absolute bottom-full left-0 mb-3 w-48 bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-300/40 p-1.5 z-30 transition-all"
                  role="menu"
                  aria-orientation="vertical"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors cursor-pointer text-left"
                  >
                    <span className="text-blue-500 material-symbols-outlined text-[20px]">description</span>
                    <span>File</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors cursor-pointer text-left"
                  >
                    <span className="text-blue-500 material-symbols-outlined text-[20px]">image</span>
                    <span>Image</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-blue-600 transition-colors cursor-pointer text-left"
                  >
                    <span className="text-blue-500 material-symbols-outlined text-[20px]">smart_display</span>
                    <span>Video</span>
                  </button>
                </div>
              )}

              {/* Action buttons on left of input */}
              <div className="flex items-center gap-1">
                <div ref={emojiPickerRef} className="relative">
                  <button
                    type="button"
                    disabled={!isOnline}
                    aria-label="Choose an emoji"
                    aria-expanded={isEmojiPickerOpen}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-blue-500 hover:bg-blue-50 transition-colors cursor-pointer disabled:opacity-50"
                    title="Emoji"
                    onClick={() => setIsEmojiPickerOpen((prev) => !prev)}
                  >
                    <span className="material-symbols-outlined text-[20px]">sentiment_satisfied</span>
                  </button>

                  {isEmojiPickerOpen && (
                    <div className="absolute bottom-11 left-0 z-30 shadow-xl rounded-xl overflow-hidden">
                      <EmojiPicker
                        onEmojiClick={handleEmojiClick}
                        autoFocusSearch={false}
                        theme={Theme.LIGHT}
                        width={320}
                        height={400}
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!isOnline}
                  onClick={() => setIsMediaMenuOpen((prev) => !prev)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-blue-500 hover:bg-blue-50 transition-all cursor-pointer disabled:opacity-50 ${
                    isMediaMenuOpen ? "bg-blue-100 text-blue-700 rotate-45" : ""
                  }`}
                  title="Add attachments (Image, Video, File)"
                  aria-label="Add attachments"
                >
                  <span className="material-symbols-outlined text-[22px]">add_circle</span>
                </button>
              </div>
            </div>

            {/* Hidden file inputs for each media type */}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, "image")}
            />
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, "video")}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z"
              className="hidden"
              onChange={(e) => handleFileChange(e, "file")}
            />

            {/* Text message pill input */}
            <input
              type="text"
              value={inputMessage}
              onChange={handleInputChange}
              placeholder={isOnline ? "Enter a message" : "Offline. Reconnect to send messages..."}
              disabled={!isOnline || isSending}
              className="flex-1 py-2.5 px-4 bg-[#f0f4f9] border-none rounded-full text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-60"
            />

            {/* Send Paper Airplane Button */}
            <button
              type="submit"
              disabled={!isOnline || !inputMessage.trim() || isSending}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                !isOnline || !inputMessage.trim() || isSending
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-blue-600 hover:bg-blue-50 active:scale-95"
              }`}
              title="Send message"
            >
              <span className="material-symbols-outlined text-[22px]">send</span>
            </button>
          </form>
        </footer>
      </main>
    </div>
  );
};

export default ChatInterface;
