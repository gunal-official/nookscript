"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  WorkspaceSwitcher,
  type SwitcherWorkspace,
} from "@/components/app-shell/WorkspaceSwitcher";
import { MONEY_HREFS, NAV_ITEMS } from "@/components/app-shell/nav-items";
import { cn } from "@/lib/utils";

function NavItem({
  label,
  href,
  active = false,
}: {
  label: string;
  href: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "min-h-11 min-w-11 items-center flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-text",
        active && "border-border bg-card font-semibold text-text"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          active ? "bg-accent" : "bg-text opacity-40"
        )}
      />
      {label}
    </Link>
  );
}

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  canSeeMoney,
}: {
  workspaces: SwitcherWorkspace[];
  activeWorkspaceId: string;
  /** Step 29: viewers never see Invoices / Time (money is hidden). */
  canSeeMoney: boolean;
}) {
  const pathname = usePathname();

  // Only ONE item highlights: pick the longest matching prefix, so
  // /intake/inbox lights "Inbox" and not also its parent-prefix "Intake".
  const visibleItems = NAV_ITEMS.filter(
    (item) => canSeeMoney || !MONEY_HREFS.has(item.href)
  );
  const activeHref = visibleItems.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="flex h-full flex-col border-r border-border bg-muted p-3">
      <nav className="flex flex-col gap-1">
        {visibleItems.map((item) => (
          <NavItem
            key={item.label}
            label={item.label}
            href={item.href}
            active={item.href === activeHref}
          />
        ))}
      </nav>

      <div className="mt-8">
        <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Workspace
        </p>
        <WorkspaceSwitcher
          workspaces={workspaces}
          activeWorkspaceId={activeWorkspaceId}
        />
      </div>
    </aside>
  );
}
