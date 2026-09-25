/**
 * Shared app-route registry (Step 31 → Step 33 icon system): one source of
 * truth for the Sidebar (tab+), the icon rail (tab–desk) and the mobile
 * drawer (<tab). Icons are semantic (docs/icon-audit.md): nav = 20px,
 * stroke 1.5 (global), decorative = aria-hidden (link text carries meaning).
 */
import {
  BarChart3,
  ClipboardList,
  Clock,
  FileSignature,
  FileText,
  Inbox,
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

export const NAV_ITEMS: readonly NavItem[] = [
  { label: "Intake", href: "/intake", icon: PenLine },
  { label: "Inbox", href: "/intake/inbox", icon: Inbox },
  { label: "Briefs", href: "/briefs", icon: ClipboardList },
  { label: "Proposals", href: "/proposals", icon: FileText },
  { label: "Plans", href: "/plans", icon: ListChecks },
  { label: "Updates", href: "/updates", icon: MessageSquare },
  { label: "Invoices", href: "/invoices", icon: Receipt },
  { label: "Time", href: "/time", icon: Clock },
  { label: "Contracts", href: "/contracts", icon: FileSignature },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

/** Money surfaces — hidden from viewers (Step 29 hide rule). */
export const MONEY_HREFS = new Set(["/invoices", "/time"]);

/** Exact page = active; nested pages light their section (aria-current="page"). */
export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
