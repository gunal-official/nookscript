"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Inbox, Menu as MenuIcon, Search } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { MobileNav } from "./MobileNav";
import { WorkspaceSwitcher, type SwitcherWorkspace } from "./WorkspaceSwitcher";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Menu, MenuItem } from "@/components/ui/menu";
import { MONEY_HREFS, NAV_ITEMS } from "./nav-items";

export function Topbar({
  initials,
  name,
  email,
  workspaces,
  activeWorkspaceId,
  canSeeMoney,
}: {
  initials: string;
  name: string | null;
  email: string;
  workspaces: SwitcherWorkspace[];
  activeWorkspaceId: string;
  canSeeMoney: boolean;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const items = NAV_ITEMS.filter((item) => canSeeMoney || !MONEY_HREFS.has(item.href));

  // Escape closes the mobile drawer (its close button + overlay handle the rest).
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <header className="flex min-h-16 flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={navOpen}
        onClick={() => setNavOpen(true)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-[0.35rem] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-text tab:hidden"
      >
        <MenuIcon aria-hidden="true" className="h-5 w-5" />
      </button>
      <MobileNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        canSeeMoney={canSeeMoney}
      />

      <WorkspaceSwitcher workspaces={workspaces} activeWorkspaceId={activeWorkspaceId} />

      <div className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xs">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="global-search" className="sr-only">Search</label>
        <Input
          id="global-search"
          type="search"
          placeholder="Search..."
          className="h-11 w-full border-border bg-muted pl-8 shadow-none"
        />
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <Link
          href="/intake/inbox"
          aria-label="Inbox"
          title="Inbox"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-[0.35rem] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-text"
        >
          <Inbox aria-hidden="true" className="h-[18px] w-[18px]" />
        </Link>
        <span className="hidden max-w-[160px] truncate text-sm text-muted-foreground md:inline">{name ?? email}</span>
        <Menu label="Account menu" trigger={
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-accent text-xs font-semibold text-white">{initials}</AvatarFallback>
          </Avatar>
        }>
          {(close) => (
            <>
              {items.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  role="menuitem"
                  onClick={close}
                  className="flex min-h-11 w-full items-center rounded-[0.2rem] px-3 text-sm text-text transition-colors duration-150 hover:bg-muted"
                >
                  <Icon aria-hidden="true" className="mr-2 h-4 w-4 text-muted-foreground" />
                  {label}
                </Link>
              ))}
              <div className="mx-2 my-1 h-px bg-border" />
              <LogoutButton />
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
