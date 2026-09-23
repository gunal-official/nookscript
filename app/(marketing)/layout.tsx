import { SiteFooter } from "@/components/marketing/SiteFooter";
import { SiteHeader } from "@/components/marketing/SiteHeader";

/**
 * Marketing shell (Step 13): shared header/footer around /, /about,
 * /pricing and /vs/[slug]. Auth-ed state is intentionally not detected here —
 * the marketing surface is identical for everyone; Log in / Sign up remain
 * the funnel into the appside.
 */
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
