"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { isActive, visibleGroups } from "./nav-items";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./WorkspaceSwitcher";

// Mobile (<tab) navigation: hamburger in the Topbar opens this drawer —
// slide-in panel with grouped icon-chip rows (ui.webp language). Nothing
// clips at 320px, every item is a 44px row.
export function MobileNav({
  open,
  onClose,
  workspaces,
  activeWorkspaceId,
  canSeeMoney,
}: {
  open: boolean;
  onClose: () => void;
  workspaces: SwitcherWorkspace[];
  activeWorkspaceId: string;
  canSeeMoney: boolean;
}) {
  const pathname = usePathname();
  if (!open) return null;
  const groups = visibleGroups(canSeeMoney);

  return (
    <div className="fixed inset-0 z-50 tab:hidden" role="presentation">
      <button
        type="button"
        aria-label="Close menu"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in"
      />
      <nav
        aria-label="Primary"
        className="absolute left-0 top-0 flex h-full w-[min(288px,86vw)] flex-col gap-1 overflow-y-auto border-r border-border bg-card p-3 shadow-pop animate-slide-in"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-text"
          >
            <X aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        </div>
        {groups.map((group) => (
          <div key={group.label} className="mb-2">
            <p
              aria-hidden="true"
              className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70"
            >
              {group.label}
            </p>
            <div className="flex flex-col gap-1">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={onClose}
                    className={[
                      "flex min-h-11 items-center gap-3 rounded-xl px-1.5 text-sm transition-colors duration-150",
                      "hover:bg-muted/70",
                      active
                        ? "bg-accent-soft font-semibold text-accent"
                        : "text-muted-foreground hover:text-text",
                    ].join(" ")}
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        active ? "bg-accent-soft text-accent" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
