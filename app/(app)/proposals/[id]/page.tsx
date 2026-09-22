import { Placeholder } from "@/components/placeholder";

// Step 7 — /proposals/:id: generation from brief
export default function ProposalDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <Placeholder title={`Proposal ${params.id}`} step={7} />;
}
