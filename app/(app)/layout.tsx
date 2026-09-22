import { redirect } from "next/navigation";

import { Sidebar } from "@/components/app-shell/Sidebar";
import { Topbar } from "@/components/app-shell/Topbar";
import { createClient } from "@/lib/supabase/server";
import { getInitials } from "@/lib/utils";

type MembershipRow = {
  role: string;
  workspace: { id: string; name: string } | { id: string; name: string }[] | null;
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already bounces anonymous users; this is defense in depth.
  if (!user) {
    redirect("/login");
  }

  const [{ data: profile }, { data: membershipData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_initials")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("workspace_members")
      .select("role, workspace:workspaces(id, name)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const membership = (membershipData ?? null) as MembershipRow | null;
  const rawWorkspace = membership?.workspace;
  const workspace = Array.isArray(rawWorkspace)
    ? rawWorkspace[0]
    : rawWorkspace;

  // Logged in but no workspace yet (e.g. email-confirmation signup flow)
  if (!workspace) {
    redirect("/onboarding");
  }

  const fullName = profile?.full_name ?? null;
  const initials =
    profile?.avatar_initials || getInitials(fullName ?? user.email);

  return (
    <div className="grid h-dvh grid-cols-[220px_1fr] grid-rows-[56px_1fr] overflow-hidden">
      <Topbar initials={initials} name={fullName} email={user.email} />
      <Sidebar workspaceName={workspace.name} />
      <main className="overflow-y-auto bg-bg px-8 pb-12 pt-6">{children}</main>
    </div>
  );
}
