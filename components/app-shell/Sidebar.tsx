"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, visibleGroups } from "./nav-items";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./WorkspaceSwitcher";

/* Sidebar (ui.webp shell): white surface, brand tile, uppercase group micro-
   labels, icon-chip rows. Active row = soft orange pill + accent icon + left
   sliver. Bands locked in Step 33: 64px rail (tab–desk), 232px (desk+). */
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
  const groups = visibleGroups(canSeeMoney);

  return (
    <aside
      className="sticky top-0 h-dvh w-[64px] shrink-0 overflow-y-auto border-r border-border bg-card px-2 py-4 desk:w-[232px] desk:px-3"
      aria-label="Primary"
    >
      <Link href="/" className="mb-4 flex h-11 items-center gap-2.5 px-1 desk:px-2">
        <span
          aria-hidden="true"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent font-display text-base font-extrabold text-white shadow-rail"
        >
          N
        </span>
        <span className="font-display text-lg font-bold tracking-tight max-desk:sr-only">
          Nook
        </span>
      </Link>
      <div className="mb-3 px-1 max-desk:hidden">
        <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />
      </div>
      {groups.map((group) => (
        <div key={group.label} className="mb-3">
          <p
            aria-hidden="true"
            className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 max-desk:hidden"
          >
            {group.label}
          </p>
          <nav aria-label={group.label} className="flex flex-col gap-1">
            {group.items.map(({ label, href, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={active ? "page" : undefined}
                  title={label}
                  className={[
                    "relative flex min-h-11 items-center gap-3 rounded-xl px-1.5 text-sm transition-colors duration-150",
                    "max-desk:justify-center max-desk:px-0",
                    "hover:bg-muted/70 focus-visible:bg-muted/70",
                    active
                      ? "bg-accent-soft font-semibold text-accent before:absolute before:left-0 before:h-5 before:w-[3px] before:rounded-full before:bg-accent max-desk:before:hidden"
                      : "text-muted-foreground hover:text-text",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
                      active
                        ? "bg-accent-soft text-accent"
                        : "text-muted-foreground group-hover:text-text",
                    ].join(" ")}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="max-desk:sr-only">{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );
}
