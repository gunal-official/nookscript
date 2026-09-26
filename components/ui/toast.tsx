"use client";

// In-house toasts (Step 33 — no new dependency): a11y-polite stack, rise-in
// entrance (transform/opacity 200ms) and a fade-out before unmount. Wired to
// invite created / invite copied / invoice saved.
import { createContext, useCallback, useContext, useRef, useState } from "react";

import {
  leaveToast,
  pushToast,
  removeToast,
  type ToastEntry,
} from "@/lib/toast-queue";

type Toast = ToastEntry;

const ToastCtx = createContext<(title: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((title: string) => {
    const id = ++seq.current;
    setToasts((t) => pushToast(t, id, title));
    setTimeout(() => setToasts((t) => leaveToast(t, id)), 2800);
    setTimeout(() => setToasts((t) => removeToast(t, id)), 3100);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-20 right-4 z-[60] flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2 print:hidden"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto rounded-[0.35rem] border border-border bg-card px-4 py-3 text-sm shadow-lg ${t.leaving ? "animate-toast-out" : "animate-rise-in"}`}
          >
            {t.title}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
