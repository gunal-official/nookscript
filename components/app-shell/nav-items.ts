/**
 * Shared app-route registry (Step 31): one source of truth for the
 * Sidebar (md+) and MobileNav (<md) so the two stay in lockstep.
 */
export const NAV_ITEMS = [
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
] as const;

/** Money surfaces — hidden from viewers (Step 29 hide rule). */
export const MONEY_HREFS = new Set(["/invoices", "/time"]);
