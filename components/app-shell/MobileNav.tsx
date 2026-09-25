"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { MONEY_HREFS, NAV_ITEMS, isActive } from "./nav-items";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./WorkspaceSwitcher";

// Mobile (<tab) navigation: hamburger in the Topbar opens this drawer —
// slide-in panel with every destination as icon + label (nothing clips at
// 320px, every item is a 44px row). Tablet+ get the Sidebar rail instead.
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
  const items = NAV_ITEMS.filter((item) => canSeeMoney || !MONEY_HREFS.has(item.href));

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
        className="absolute left-0 top-0 flex h-full w-[min(288px,86vw)] flex-col gap-1 overflow-y-auto border-r border-border bg-background p-3 shadow-xl animate-slide-in"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-[0.35rem] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-text"
          >
            <X aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        </div>
        {items.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onClose}
              className={[
                "flex min-h-11 items-center gap-3 rounded-[0.35rem] px-3 text-sm transition-colors duration-150",
                "hover:bg-muted/70 hover:text-text",
                active ? "bg-muted font-medium text-text" : "text-muted",
              ].join(" ")}
            >
              <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${active ? "text-accent-fg" : ""}`} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
