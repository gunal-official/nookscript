"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  WorkspaceSwitcher,
  type SwitcherWorkspace,
} from "@/components/app-shell/WorkspaceSwitcher";
import { MONEY_HREFS, NAV_ITEMS } from "@/components/app-shell/nav-items";
import { cn } from "@/lib/utils";

/**
 * Step 31 — the <md app navigation: a horizontally scrollable strip
 * under the Topbar (the 220px Sidebar column is md+ only). Same route
 * registry as the Sidebar, same viewer money-hide rule, plus the
 * workspace switcher so mobile isn't a dead end.
 */
export function MobileNav({
  workspaces,
  activeWorkspaceId,
  canSeeMoney,
}: {
  workspaces: SwitcherWorkspace[];
  activeWorkspaceId: string;
  canSeeMoney: boolean;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter(
    (item) => canSeeMoney || !MONEY_HREFS.has(item.href)
  );

  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted px-3 py-1.5"
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-text",
              active && "bg-card font-semibold text-text"
            )}
          >
            {item.label}
          </Link>
        );
      })}
      <span className="ml-auto shrink-0 pl-2">
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
      </span>
    </nav>
  );
}
