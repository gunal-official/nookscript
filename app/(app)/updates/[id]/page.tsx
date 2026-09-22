import { Placeholder } from "@/components/placeholder";

// Step 9 — /updates/:id: client update composer
export default function UpdateDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <Placeholder title={`Update ${params.id}`} step={9} />;
}
