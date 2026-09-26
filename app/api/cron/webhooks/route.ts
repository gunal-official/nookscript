import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { reprocessDueDeliveries } from "@/lib/webhook-dispatch.ts";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Webhook retry sweep (suggestions pass 4/10) — the serverless recovery
 * path for outbound webhook deliveries.
 *
 * Point any scheduler at this route (cron, GitHub Actions schedule, a
 * Vercel cron job, …) once per minute:
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     https://<your-domain>/api/cron/webhooks
 *
 * GATE: `Authorization: Bearer <CRON_SECRET>` (constant-time compared).
 * CRON_SECRET unset → 503 (the sweep simply never runs — in-process
 * retries still work on long-lived servers). Supabase must be
 * configured; the sweep writes through the SERVICE ROLE (same trust
 * model as the Stripe webhook route).
 */

export const dynamic = "force-dynamic";

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "Cron is not configured (CRON_SECRET missing)." },
      { status: 503 }
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !constantTimeEquals(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const supabase = createServiceClient();
    const reprocessed = await reprocessDueDeliveries(supabase);
    return NextResponse.json({ reprocessed });
  } catch {
    // The sweep is best-effort by design; one failed run is retried by
    // the next scheduled tick. No internals in the response.
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }
}
