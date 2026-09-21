import React, { createContext, useContext, useState, useCallback } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) {
    // Return a fallback so useToast doesn't crash even if used outside provider
    return {
      toasts: [],
      showToast: (msg) => console.log(`[Toast]: ${msg}`),
      removeToast: () => {},
    };
  }
  return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto dismiss after 3.5 seconds
    setTimeout(() => {
      removeToast(id);
    }, 3500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

export const ToastContainer: React.FC<{
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}> = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
      aria-live="polite"
      data-purpose="toast-notifications-container"
    >
      {toasts.map((t) => {
        const icons = {
          success: "check_circle",
          error: "error",
          warning: "warning",
          info: "info",
        };

        const colorStyles = {
          success: "bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20",
          error: "bg-red-600 text-white border-red-500 shadow-red-500/20",
          warning: "bg-amber-600 text-white border-amber-500 shadow-amber-500/20",
          info: "bg-slate-900 text-white border-slate-700 shadow-slate-900/20",
        };

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border shadow-lg transition-all transform translate-y-0 duration-200 animate-slide-in ${colorStyles[t.type]}`}
            role="alert"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="material-symbols-outlined text-[20px] flex-shrink-0">
                {icons[t.type]}
              </span>
              <p className="text-xs sm:text-sm font-medium leading-snug break-words">
                {t.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onRemove(t.id)}
              className="text-white/70 hover:text-white transition-colors p-1 rounded cursor-pointer flex-shrink-0"
              title="Dismiss"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastProvider;
