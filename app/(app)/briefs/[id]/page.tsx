import { Placeholder } from "@/components/placeholder";

// Step 5 — /briefs/:id: detail view, tabs, resolve questions
export default function BriefDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <Placeholder title={`Brief ${params.id}`} step={5} />;
}
