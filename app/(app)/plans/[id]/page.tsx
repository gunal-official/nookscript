import { Placeholder } from "@/components/placeholder";

// Step 8 — /plans/:id: task plan generation + markdown export
export default function PlanDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <Placeholder title={`Plan ${params.id}`} step={8} />;
}
