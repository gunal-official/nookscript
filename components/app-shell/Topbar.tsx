import Link from "next/link";
import { Search } from "lucide-react";

import { LogoutButton } from "@/components/auth/logout-button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";

export function Topbar({
  initials,
  name,
  email,
}: {
  initials: string;
  name?: string | null;
  email?: string | null;
}) {
  return (
    <header className="col-span-2 flex h-14 items-center justify-between border-b border-border bg-card px-5">
      <Link
        href="/intake"
        className="inline-flex min-h-11 items-center font-display text-xl font-bold tracking-tight text-text"
      >
        nook<span className="text-accent">script</span>
      </Link>

      <div className="flex items-center gap-3">
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="h-11 w-52 border-border bg-muted pl-8 shadow-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden max-w-[160px] truncate text-sm text-muted-foreground md:inline">
            {name ?? email}
          </span>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-accent text-xs font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </div>

        <div className="h-4 w-px bg-border" />

        <LogoutButton />
      </div>
    </header>
  );
}
