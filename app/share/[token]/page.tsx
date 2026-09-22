import { Placeholder } from "@/components/placeholder";
import { Badge } from "@/components/ui/badge";

// Step 10 — /share/:token: public read-only view + revocation.
// Deliberately outside the route groups: no app shell, no auth.
export default function SharePage({
  params,
}: {
  params: { token: string };
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center px-6">
      <Placeholder title="Shared document" step={10}>
        <Badge variant="outline">token: {params.token}</Badge>
      </Placeholder>
    </main>
  );
}
