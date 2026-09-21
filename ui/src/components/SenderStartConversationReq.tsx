import React, { useState } from "react";
import type { User } from "../types/api";

export interface SenderStartConversationReqProps {
  defaultUniqueId?: string;
  currentUser?: User;
  pendingTarget?: string | null;
  onCancelPending?: () => void;
  onStartConversation?: (uniqueId: string) => void;
  onLogout?: () => void;
}

export const getEffectiveUserId = (user?: User): string => {
  if (!user) return "";
  const rawId = (user.userId || "").trim();
  const isRawUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
  if (rawId && !isRawUuid) {
    return rawId;
  }
  const emailPrefix = user.email ? user.email.split("@")[0] : "User";
  const first = (user.firstName || emailPrefix).charAt(0).toUpperCase() || "G";
  const second = (user.lastName || emailPrefix.slice(1) || "Chat").charAt(0).toUpperCase() || "O";
  const suffix = (user.id ? user.id.replace(/-/g, "") : "49c").slice(0, 3);
  return `${first}${second}${suffix}@Chat`;
};

export const SenderStartConversationReq: React.FC<SenderStartConversationReqProps> = ({
  defaultUniqueId = "",
  currentUser,
  pendingTarget = null,
  onCancelPending,
  onStartConversation,
  onLogout,
}) => {
  const [sessionKey, setSessionKey] = useState(defaultUniqueId);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedHeader, setCopiedHeader] = useState(false);
  const [copiedCard, setCopiedCard] = useState(false);

  const effectiveUserId = getEffectiveUserId(currentUser);

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      return true;
    } catch {
      return false;
    }
  };

  // Clicking Avatar: copies ID and automatically puts it in "Enter Unique ID" input
  const handleAvatarClick = async () => {
    if (!effectiveUserId) return;
    await copyToClipboard(effectiveUserId);
    setSessionKey(effectiveUserId);
    setCopiedHeader(true);
    setTimeout(() => setCopiedHeader(false), 2000);

    const input = document.getElementById("sessionKeyInput") as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
    }
  };

  const handleCopyHeader = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!effectiveUserId) return;
    await copyToClipboard(effectiveUserId);
    setCopiedHeader(true);
    setTimeout(() => setCopiedHeader(false), 2000);
  };

  const handleCopyCard = async () => {
    if (!effectiveUserId) return;
    await copyToClipboard(effectiveUserId);
    setCopiedCard(true);
    setTimeout(() => setCopiedCard(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmed = sessionKey.trim();
    if (!trimmed) {
      setErrorMessage("Please enter a valid unique ID or user ID.");
      return;
    }

    if (effectiveUserId && trimmed.toLowerCase() === effectiveUserId.toLowerCase()) {
      setErrorMessage("You cannot start a conversation with your own ID.");
      return;
    }

    setLoading(true);
    if (onStartConversation) {
      onStartConversation(trimmed);
    }
    setLoading(false);
  };

  return (
    <main
      className="flex-1 bg-white min-h-screen flex flex-col relative overflow-y-auto"
      data-purpose="chat-stage-area"
    >
      {/* Subtle background pattern accent */}
      <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none"></div>

      {/* Top bar for authenticated user with logout */}
      {currentUser && (
        <header className="relative z-20 px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            {/* Clickable Avatar: click to copy & fill into input field */}
            <button
              type="button"
              onClick={handleAvatarClick}
              className="w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center text-sm shadow-xs transition-transform active:scale-95 cursor-pointer"
              title="Click to copy & fill your Unique ID into input"
            >
              {(currentUser.firstName?.[0] || currentUser.email?.[0] || "U").toUpperCase()}
            </button>
            <div>
              <span className="text-xs font-semibold text-slate-800 block leading-tight">
                {currentUser.firstName ? `${currentUser.firstName} ${currentUser.lastName || ""}` : currentUser.email}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[11px] text-slate-500 font-medium">Unique ID:</span>
                <code
                  onClick={handleAvatarClick}
                  className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200/70 hover:bg-blue-100/70 transition-colors cursor-pointer select-all"
                  title="Click to copy & fill into input"
                >
                  {effectiveUserId}
                </code>
                <button
                  type="button"
                  onClick={handleCopyHeader}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 px-2 py-0.5 rounded-md transition-all cursor-pointer shadow-2xs"
                  title="Copy Unique ID to clipboard"
                >
                  <span className="material-symbols-outlined text-[13px]">
                    {copiedHeader ? "check" : "content_copy"}
                  </span>
                  <span>{copiedHeader ? "Copied!" : "Copy"}</span>
                </button>
              </div>
            </div>
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-xs font-medium text-slate-500 hover:text-red-600 transition-colors px-2.5 py-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              Sign out
            </button>
          )}
        </header>
      )}

      {/* Center Content: Initiation & Connection Screen */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-10 relative z-10">
        {/* Initiation Form Card */}
        <section
          className="w-full max-w-xl bg-white border border-slate-200/90 rounded-2xl shadow-xl shadow-slate-200/40 p-8 sm:p-10 text-center relative transition-all"
          data-purpose="session-connect-card"
        >
          {/* Conversation Icon Indicator */}
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-inner">
            <svg
              className="w-9 h-9"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.6"
              ></path>
            </svg>
          </div>

          {/* Headings */}
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-2">
            Start a New Conversation
          </h1>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto leading-relaxed">
            Enter a unique ID to connect directly and start a conversation.
          </p>

          {/* Error Message if any */}
          {errorMessage && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium text-left">
              {errorMessage}
            </div>
          )}

          {/* Pending Sent Request Status Banner */}
          {pendingTarget && (
            <div className="mb-6 p-4 rounded-xl bg-sky-50 border border-sky-200/80 text-sky-900 text-left flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-2.5 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                <span>
                  Invitation sent to <strong className="font-bold">{pendingTarget}</strong>. Waiting for partner to accept...
                </span>
              </div>
              {onCancelPending && (
                <button
                  type="button"
                  onClick={onCancelPending}
                  className="text-xs text-slate-500 hover:text-slate-800 font-medium underline shrink-0 cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>
          )}

          {/* Current User Quick Badge with Copy Button */}
          {effectiveUserId && (
            <div className="mb-6 py-2.5 px-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 flex items-center justify-between gap-3 text-left shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="font-medium text-slate-600">Your Unique ID:</span>
                <code
                  onClick={handleCopyCard}
                  className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 select-all cursor-pointer"
                  title="Click to copy"
                >
                  {effectiveUserId}
                </code>
              </div>
              <button
                type="button"
                onClick={handleCopyCard}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-slate-700 hover:text-blue-600 font-medium rounded-lg text-xs transition-all cursor-pointer"
                title="Copy Unique ID"
              >
                <span className="material-symbols-outlined text-[13px]">
                  {copiedCard ? "check" : "content_copy"}
                </span>
                <span>{copiedCard ? "Copied!" : "Copy ID"}</span>
              </button>
            </div>
          )}

          {/* Input & Action Flow Container */}
          <form
            className="space-y-4"
            data-purpose="session-connection-form"
            onSubmit={handleSubmit}
          >
            <div className="text-left">
              <label
                className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5"
                htmlFor="sessionKeyInput"
              >
                Enter Unique ID
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    ></path>
                  </svg>
                </div>
                <input
                  className="block w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 placeholder-slate-400 transition"
                  id="sessionKeyInput"
                  name="sessionKey"
                  placeholder="e.g. AMyk3@Chat or user ID"
                  type="text"
                  value={sessionKey}
                  onChange={(e) => setSessionKey(e.target.value)}
                />
              </div>
            </div>

            {/* Primary Call to Action Button */}
            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <button
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 border border-transparent text-base font-semibold rounded-xl text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 shadow-lg shadow-blue-500/25 transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer disabled:opacity-85"
                type="submit"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Sending Invite...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                      ></path>
                    </svg>
                    <span>Start Conversation</span>
                  </>
                )}
              </button>

            </div>
          </form>

          {/* Secondary Info / Quick Status */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-xs text-slate-400">
            <svg
              className="w-4 h-4 text-emerald-500 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                clipRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                fillRule="evenodd"
              ></path>
            </svg>
            <span>Direct encrypted peer-to-peer session</span>
          </div>
        </section>
      </div>
    </main>
  );
};

export default SenderStartConversationReq;
