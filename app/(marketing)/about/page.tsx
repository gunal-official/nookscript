import Link from "next/link";

import { Placeholder } from "@/components/placeholder";
import { Button } from "@/components/ui/button";

// Step 13 — marketing site
export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-start justify-center px-6">
      <Placeholder title="About" step={13}>
        <Button asChild variant="secondary">
          <Link href="/">Back home</Link>
        </Button>
      </Placeholder>
    </main>
  );
}
