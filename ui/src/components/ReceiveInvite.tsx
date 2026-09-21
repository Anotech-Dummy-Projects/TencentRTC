import React, { useState } from "react";

export interface ReceiveInviteProps {
  isOpen?: boolean;
  senderName?: string;
  senderInitials?: string;
  senderRole?: string;
  senderId?: string;
  sessionId?: string;
  timeAgo?: string;
  onAccept?: () => void;
  onReject?: () => void;
}

export const ReceiveInvite: React.FC<ReceiveInviteProps> = ({
  isOpen = true,
  senderName = "Alex Miller",
  senderInitials = "AM",
  senderRole = "Client ID / User",
  senderId = "#USR-9482",
  sessionId = "#USR-9482",
  timeAgo = "10s ago",
  onAccept,
  onReject,
}) => {
  const [connecting, setConnecting] = useState(false);
  const [visible, setVisible] = useState(isOpen);

  if (!visible) return null;

  const handleAccept = () => {
    setConnecting(true);
    setTimeout(() => {
      if (onAccept) {
        onAccept();
      }
    }, 600);
  };

  const handleReject = () => {
    setVisible(false);
    if (onReject) {
      onReject();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 transition-all duration-300"
      data-purpose="modal-overlay"
    >
      {/* ReceiverInviteCard */}
      <section
        aria-labelledby="modal-headline"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-white/60 shadow-2xl p-6 sm:p-8 relative overflow-hidden transition-all transform bg-white/95 backdrop-blur-xl"
        data-purpose="incoming-invite-modal"
        role="dialog"
      >
        {/* Header with Status Pill and Timestamp */}
        <div className="flex items-center justify-between mb-5">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Incoming Request
          </span>
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <svg
              className="w-3.5 h-3.5 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            {timeAgo}
          </span>
        </div>

        {/* Modal Title & Context */}
        <div className="text-center mb-6">
          <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <svg
              className="w-7 h-7"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              viewBox="0 0 24 24"
            >
              <path
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                strokeLinecap="round"
                strokeLinejoin="round"
              ></path>
            </svg>
          </div>
          <h2
            className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight"
            id="modal-headline"
          >
            Incoming Request
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            A user is requesting to start a conversation with you.
          </p>
        </div>

        {/* BEGIN: SenderIdentityBox */}
        <div
          className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-4 mb-6 transition-all hover:bg-slate-50"
          data-purpose="sender-credential-container"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <div className="w-10 h-10 rounded-full bg-slate-800 text-white font-semibold text-sm flex items-center justify-center ring-2 ring-white shadow-sm">
                  {senderInitials}
                </div>
                <span
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"
                  title="Online now"
                ></span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    {senderName}
                  </h3>
                  <span className="text-[11px] font-medium text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">
                    {senderRole}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">ID: {senderId}</p>
              </div>
            </div>
            <div className="sm:text-right w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                Session ID
              </span>
              <code className="text-xs font-mono font-bold bg-sky-50 text-sky-700 px-2 py-1 rounded border border-sky-200 inline-block mt-0.5">
                {sessionId}
              </code>
            </div>
          </div>
        </div>
        {/* END: SenderIdentityBox */}

        {/* BEGIN: ActionButtonsGroup */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-5" data-purpose="decision-actions">
          {/* Accept Button (High Emphasis) */}
          <button
            className="order-1 sm:order-1 flex items-center justify-center gap-2 w-full py-3.5 px-5 rounded-xl text-base font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 shadow-md shadow-emerald-600/25 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 cursor-pointer disabled:opacity-80"
            id="btn-accept-invite"
            onClick={handleAccept}
            disabled={connecting}
            type="button"
          >
            {connecting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-5 w-5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Connecting...
              </>
            ) : (
              <>
                <svg
                  className="w-5 h-5 stroke-[2.5]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M4.5 12.75l6 6 9-13.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  ></path>
                </svg>
                <span>Accept</span>
              </>
            )}
          </button>

          {/* Reject Button (Subtle/Outlined) */}
          <button
            className="order-2 sm:order-2 flex items-center justify-center gap-2 w-full py-3.5 px-5 rounded-xl text-base font-semibold text-slate-700 bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300 border border-slate-300 active:bg-rose-100 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 cursor-pointer"
            id="btn-reject-invite"
            onClick={handleReject}
            type="button"
          >
            <svg
              className="w-5 h-5 text-slate-400 group-hover:text-rose-600"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
              ></path>
            </svg>
            <span>Reject</span>
          </button>
        </div>
        {/* END: ActionButtonsGroup */}

        {/* Security / Protocol Note Footer */}
        <footer className="text-center pt-1 border-t border-slate-100">
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <svg
              className="w-3.5 h-3.5 text-slate-400"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <rect height="11" rx="2" ry="2" width="18" x="3" y="11"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            Session is TLS 1.3 end-to-end encrypted
          </p>
        </footer>
      </section>
    </div>
  );
};

export default ReceiveInvite;
