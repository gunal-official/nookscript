"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  WorkspaceSwitcher,
  type SwitcherWorkspace,
} from "@/components/app-shell/WorkspaceSwitcher";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Intake", href: "/intake" },
  { label: "Inbox", href: "/intake/inbox" },
  { label: "Briefs", href: "/briefs" },
  { label: "Proposals", href: "/proposals" },
  { label: "Plans", href: "/plans" },
  { label: "Updates", href: "/updates" },
  { label: "Invoices", href: "/invoices" },
  { label: "Time", href: "/time" },
  { label: "Contracts", href: "/contracts" },
  { label: "Reports", href: "/reports" },
  { label: "Settings", href: "/settings" },
];

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
        "flex items-center gap-2.5 rounded-md border border-transparent px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-text",
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
}: {
  workspaces: SwitcherWorkspace[];
  activeWorkspaceId: string;
}) {
  const pathname = usePathname();

  // Only ONE item highlights: pick the longest matching prefix, so
  // /intake/inbox lights "Inbox" and not also its parent-prefix "Intake".
  const activeHref = NAV_ITEMS.map((item) => item.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="flex h-full flex-col border-r border-border bg-muted p-3">
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => (
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
