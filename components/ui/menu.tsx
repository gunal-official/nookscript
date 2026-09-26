"use client";

// Hand-rolled account menu (no new dependency): aria menu-button semantics,
// Escape closes + returns focus, click-outside closes, 44px items. Serves the
// Topbar "user menu" at every width and holds Settings on mobile (where the
// bottom nav shows the five work destinations instead).
import { useCallback, useEffect, useRef, useState } from "react";

export function Menu({ trigger, children, label }: { trigger: React.ReactNode; children: (close: () => void) => React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    btnRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); btnRef.current?.focus(); }
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-[0.35rem] transition-colors duration-150 hover:bg-muted focus-visible:bg-muted"
      >
        {trigger}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-1 min-w-[176px] rounded-[0.35rem] border border-border bg-background p-1 shadow-lg animate-pop-in"
        >
          {/* close is an event callback (menu-item onClick) — its btnRef
              read happens at invoke time, never during render; the rule
              cannot see through the render-prop boundary. */}
          {/* eslint-disable-next-line react-hooks/refs */}
          {children(close)}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex min-h-11 w-full items-center rounded-[0.2rem] px-3 text-left text-sm text-text transition-colors duration-150 hover:bg-muted"
    >
      {children}
    </button>
  );
}
