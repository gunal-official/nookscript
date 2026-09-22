import { Sidebar } from "@/components/app-shell/Sidebar";
import { Topbar } from "@/components/app-shell/Topbar";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="grid h-dvh grid-cols-[220px_1fr] grid-rows-[56px_1fr] overflow-hidden">
      <Topbar />
      <Sidebar />
      <main className="overflow-y-auto bg-bg px-8 pb-12 pt-6">{children}</main>
    </div>
  );
}
