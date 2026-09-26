"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);

    const supabase = createClient();
    // 'local': clear this browser's session + cookie, leave other devices alone.
    await supabase.auth.signOut({ scope: "local" });

    router.replace("/login");
    router.refresh();
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={pending}
      title="Log out"
      className="text-muted-foreground hover:text-text"
    >
      <LogOut className="h-4 w-4"  aria-hidden="true" />
      <span className="hidden sm:inline">
        {pending ? "Logging out…" : "Log out"}
      </span>
    </Button>
  );
}
