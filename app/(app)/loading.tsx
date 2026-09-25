// Skeleton placeholders (Step 33): content-shaped shimmer, not a blank screen.
export default function AppLoading() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-4">
      <div className="skeleton h-8 w-2/5 rounded-[0.35rem]" />
      <div className="skeleton h-4 w-3/5 rounded-[0.35rem]" />
      <div className="space-y-2 rounded-[0.35rem] border border-border p-4">
        <div className="skeleton h-20 w-full rounded-[0.35rem]" />
        <div className="skeleton h-20 w-full rounded-[0.35rem]" />
        <div className="skeleton h-20 w-full rounded-[0.35rem]" />
      </div>
    </div>
  );
}
