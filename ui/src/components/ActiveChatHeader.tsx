import React, { useState } from "react";

export interface ActiveChatHeaderProps {
  partnerName: string;
  partnerUserId?: string;
  partnerInitials?: string;
  isReceiver: boolean;
  onEndSession: () => Promise<void> | void;
  statusText?: string;
}

export const ActiveChatHeader: React.FC<ActiveChatHeaderProps> = ({
  partnerName,
  partnerUserId,
  partnerInitials,
  isReceiver,
  onEndSession,
  statusText = "Active Session",
}) => {
  const [ending, setEnding] = useState(false);

  const initials =
    partnerInitials ||
    partnerName
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() ||
    "P";

  const handleEnd = async () => {
    if (!isReceiver) return;
    try {
      setEnding(true);
      await onEndSession();
    } finally {
      setEnding(false);
    }
  };

  return (
    <header
      className="w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between shadow-xs sticky top-0 z-30"
      data-purpose="active-chat-top-header"
    >
      {/* Partner Identity Info */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-500 text-white flex items-center justify-center font-bold text-sm shadow-sm">
            {initials}
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 leading-tight">
              {partnerName}
            </h2>
            {partnerUserId && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200/60 font-mono text-[11px] text-slate-600 font-medium">
                {partnerUserId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span className="text-[11px] font-medium text-emerald-700">
              {statusText}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px] text-indigo-500">
                lock
              </span>
              Encrypted
            </span>
          </div>
        </div>
      </div>

      {/* Right Controls: End Conversation (Visible ONLY to Receiver) */}
      <div className="flex items-center gap-3">
        {isReceiver ? (
          <button
            type="button"
            disabled={ending}
            onClick={handleEnd}
            className="py-2 px-3.5 sm:px-4 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-600 text-xs font-semibold shadow-xs hover:shadow-sm transition-all flex items-center gap-1.5 active:scale-[0.98] cursor-pointer disabled:opacity-60"
            title="End this conversation session"
          >
            {ending ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-red-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Ending...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">call_end</span>
                <span>End Conversation</span>
              </>
            )}
          </button>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-500 font-medium">
            <span className="material-symbols-outlined text-[15px] text-slate-400">info</span>
            <span>Receiver has session control</span>
          </div>
        )}
      </div>
    </header>
  );
};

export default ActiveChatHeader;
