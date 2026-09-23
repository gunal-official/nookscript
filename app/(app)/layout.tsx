import { redirect } from "next/navigation";

import { Sidebar } from "@/components/app-shell/Sidebar";
import { Topbar } from "@/components/app-shell/Topbar";
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

  return (
    <div className="grid h-dvh grid-cols-[220px_1fr] grid-rows-[56px_1fr] overflow-hidden">
      <Topbar initials={initials} name={fullName} email={user.email} />
      <Sidebar
        workspaces={context.workspaces}
        activeWorkspaceId={context.id}
      />
      <main className="overflow-y-auto bg-bg px-8 pb-12 pt-6">{children}</main>
    </div>
  );
}
