import { redirect } from "next/navigation";

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
    <div className="grid h-dvh grid-cols-[220px_1fr] grid-rows-[56px_1fr] overflow-hidden">
      {/* Topbar + sidebar are print:hidden so browser print of any app
          page (the v1 export story — e.g. the contract document on
          /contracts/:id) yields a clean document, not the app chrome.
          Wrappers carry the grid placement the components used to. */}
      <div className="col-span-2 print:hidden">
        <Topbar initials={initials} name={fullName} email={user.email} />
      </div>
      <div className="print:hidden">
        <Sidebar
          workspaces={context.workspaces}
          activeWorkspaceId={context.id}
          canSeeMoney={context.canSeeMoney}
        />
      </div>
      <main className="overflow-y-auto bg-bg px-8 pb-12 pt-6">{children}</main>
      {context.canSeeMoney && (
        <TimeTimer briefs={briefs.map((b) => ({ id: b.id, title: b.title }))} />
      )}
    </div>
  );
}
