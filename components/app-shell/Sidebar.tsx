"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MONEY_HREFS, NAV_ITEMS, isActive } from "./nav-items";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./WorkspaceSwitcher";

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  canSeeMoney,
}: {
  workspaces: SwitcherWorkspace[];
  activeWorkspaceId: string;
  canSeeMoney: boolean;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => canSeeMoney || !MONEY_HREFS.has(item.href));

  // Tablet (tab–desk): 64px icon rail — 20px icons, title tooltip + aria-label.
  // Desktop (desk+): full 232px nav — icon + label, accent icon on the active pill.
  return (
    <aside
      className="sticky top-0 h-dvh w-[64px] shrink-0 overflow-y-auto border-r border-border bg-background px-2 py-4 desk:w-[232px] desk:px-3"
      aria-label="Primary"
    >
      <Link href="/" className="mb-4 flex h-11 items-center gap-2 px-2 desk:px-3">
        <span aria-hidden="true" className="text-lg font-semibold text-accent-fg">N</span>
        <span className="text-base font-semibold tracking-tight max-desk:sr-only">Nook</span>
      </Link>
      <div className="mb-2 px-1 max-desk:hidden">
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
      </div>
      <nav aria-label="Primary" className="flex flex-col gap-1">
        {items.map(({ label, href, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              title={label}
              className={[
                "flex min-h-11 items-center gap-3 rounded-[0.35rem] px-3 text-sm transition-colors duration-150",
                "max-desk:justify-center max-desk:px-0",
                "hover:bg-muted/70 hover:text-text focus-visible:bg-muted/70",
                active ? "bg-muted font-medium text-text" : "text-muted",
              ].join(" ")}
            >
              <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${active ? "text-accent-fg" : ""}`} />
              <span className="max-desk:sr-only">{label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
