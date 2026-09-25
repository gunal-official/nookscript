"use client";

// Route transition (Step 33): remounting template fades/slides new routes in —
// 200ms opacity + 6px translate (transform/opacity only, no layout shift).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-route-in">{children}</div>;
}
