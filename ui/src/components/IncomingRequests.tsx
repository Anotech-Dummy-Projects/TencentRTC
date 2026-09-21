import React, { useState } from "react";
import type { SessionStatusIncomingRequest } from "../types/api";

export interface IncomingRequestsProps {
  requests: SessionStatusIncomingRequest[];
  onAccept: (requestId: string) => Promise<void> | void;
  onReject: (requestId: string) => Promise<void> | void;
  loadingId?: string | null;
}

export const IncomingRequests: React.FC<IncomingRequestsProps> = ({
  requests,
  onAccept,
  onReject,
  loadingId,
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (!requests || requests.length === 0) {
    return null;
  }

  const handleAccept = async (id: string) => {
    try {
      setProcessingId(id);
      await onAccept(id);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    try {
      setProcessingId(id);
      await onReject(id);
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto my-4 space-y-3" data-purpose="incoming-requests-list">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Incoming Chat Requests ({requests.length})
          </h3>
        </div>
        <span className="text-[11px] text-slate-400 font-medium">Pending Response</span>
      </div>

      <div className="space-y-2.5">
        {requests.map((req) => {
          const senderName =
            `${req.sender?.firstName || ""} ${req.sender?.lastName || ""}`.trim() ||
            req.sender?.userId ||
            "Anonymous User";

          const senderInitials = (
            (req.sender?.firstName?.[0] || "") + (req.sender?.lastName?.[0] || "U")
          ).toUpperCase() || "U";

          const isBusy = (loadingId === req.id) || (processingId === req.id);

          return (
            <div
              key={req.id}
              className="bg-white/95 backdrop-blur-md border border-indigo-100 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
                  {senderInitials}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-slate-800 leading-none">
                      {senderName}
                    </h4>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100/60 text-[10px] font-semibold text-indigo-600">
                      Incoming
                    </span>
                  </div>
                  <p className="text-xs font-mono text-slate-500 mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px] text-slate-400">
                      fingerprint
                    </span>
                    {req.sender?.userId || "ID Hidden"}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleReject(req.id)}
                  className="py-1.5 px-3.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
                >
                  Reject
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleAccept(req.id)}
                  className="py-1.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isBusy ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Joining...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      <span>Accept</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default IncomingRequests;
