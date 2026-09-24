import { redirect } from "next/navigation";

import { MobileNav } from "@/components/app-shell/MobileNav";
import { Sidebar } from "@/components/app-shell/Sidebar";
import { Topbar } from "@/components/app-shell/Topbar";
import { TimeTimer } from "@/components/time/TimeTimer";
import { getBriefs } from "@/lib/data/briefs";
import { getWorkspaceContext } from "@/lib/data/workspace-context";
import { createClient } from "@/lib/supabase/server";
import { getInitials } from "@/lib/utils";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already bounces anonymous users; this is defense in depth.
  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, context] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_initials")
      .eq("id", user.id)
      .maybeSingle(),
    getWorkspaceContext(),
  ]);

  // Logged in but no workspace yet (e.g. email-confirmation signup flow)
  if (!context) {
    redirect("/onboarding");
  }

  const fullName = profile?.full_name ?? null;
  const initials =
    profile?.avatar_initials || getInitials(fullName ?? user.email);

  // The floating timer's brief picker (Step 18) — id + title only, so
  // the cost per (app) render is one small query.
  const briefs = await getBriefs(context.id);

  return (
    <div className="grid h-dvh grid-cols-1 grid-rows-[56px_auto_1fr] overflow-hidden md:grid-cols-[220px_1fr] md:grid-rows-[56px_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-md print:hidden"
      >
        Skip to content
      </a>
      {/* Topbar + sidebar are print:hidden so browser print of any app
          page (the v1 export story — e.g. the contract document on
          /contracts/:id) yields a clean document, not the app chrome.
          Wrappers carry the grid placement the components used to. */}
      <div className="col-span-2 print:hidden">
        <Topbar initials={initials} name={fullName} email={user.email} />
      </div>
      <div className="print:hidden md:hidden">
        <MobileNav
          workspaces={context.workspaces}
          activeWorkspaceId={context.id}
          canSeeMoney={context.canSeeMoney}
        />
      </div>
      <div className="hidden print:hidden md:block">
        <Sidebar
          workspaces={context.workspaces}
          activeWorkspaceId={context.id}
          canSeeMoney={context.canSeeMoney}
        />
      </div>
      <main id="main" className="overflow-y-auto bg-bg px-4 pb-12 pt-6 sm:px-8">
        {children}
      </main>
      {context.canSeeMoney && (
        <TimeTimer briefs={briefs.map((b) => ({ id: b.id, title: b.title }))} />
      )}
    </div>
  );
}
