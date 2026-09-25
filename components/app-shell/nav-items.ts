/**
 * Shared app-route registry (Step 31 → Step 34 ui.webp shell): one source of
 * truth for the Sidebar (tab+), the icon rail (tab–desk) and the mobile
 * drawer (<tab). Grouped like the design language (uppercase micro-labels).
 * Icons are semantic (docs/icon-audit.md): nav = 20px, stroke 1.5 (global),
 * decorative = aria-hidden (link text carries meaning).
 */
import {
  BarChart3,
  ClipboardList,
  Clock,
  FileSignature,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  MessageSquare,
  PenLine,
  Receipt,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Pipeline", href: "/", icon: LayoutDashboard },
      { label: "Intake", href: "/intake", icon: PenLine },
      { label: "Inbox", href: "/intake/inbox", icon: Inbox },
      { label: "Briefs", href: "/briefs", icon: ClipboardList },
      { label: "Proposals", href: "/proposals", icon: FileText },
      { label: "Plans", href: "/plans", icon: ListChecks },
      { label: "Updates", href: "/updates", icon: MessageSquare },
    ],
  },
  {
    label: "Money",
    items: [
      { label: "Invoices", href: "/invoices", icon: Receipt },
      { label: "Time", href: "/time", icon: Clock },
      { label: "Contracts", href: "/contracts", icon: FileSignature },
      { label: "Reports", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Account",
    items: [{ label: "Settings", href: "/settings", icon: Settings }],
  },
];

/** Flat view (menus built from groups use this). */
export const NAV_ITEMS: readonly NavItem[] = NAV_GROUPS.flatMap(
  (group) => group.items
);

/** Money surfaces — hidden from viewers (Step 29 hide rule). */
export const MONEY_HREFS = new Set(["/invoices", "/time"]);

/** Exact page = active; nested pages light their section (aria-current="page"). */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Groups minus money items the viewer may not see. */
export function visibleGroups(canSeeMoney: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => canSeeMoney || !MONEY_HREFS.has(item.href)
    ),
  })).filter((group) => group.items.length > 0);
}
