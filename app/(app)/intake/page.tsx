/**
 * /intake — paste a client source, generate a structured brief, edit + save.
 *
 * HOW TO TEST (locally — requires the Supabase setup from README.md):
 *   1. Sign up / log in (Step 2), then run supabase/seed.sql for the demo data.
 *   2. Open /intake, paste any client email (or the sample in
 *      supabase/seed.sql's brief_sources.raw_content), click Generate.
 *      → Left panel becomes a read-only message thread of the source;
 *        right panel shows the editable draft (title, client, objective,
 *        deliverables checkboxes, budget & timeline, Open Questions).
 *   3. Edit fields / toggle checkboxes → "Save brief" → Unsaved changes
 *      disappears; check Supabase Table Editor: briefs row updated and
 *      matching 'field_edited' rows in brief_edit_history.
 *   4. AI vs heuristic: with OPENAI_API_KEY set in .env.local the OpenAI
 *      extractor is used; without it, a deterministic local parser runs
 *      (UI shows a notice). Both save identical table shapes.
 *   5. Sandbox note: api.openai.com is unreachable from the Arena sandbox,
 *      so the heuristic path is what runs there by design.
 */

import { IntakeClient } from "@/components/intake/IntakeClient";
import { CanEdit } from "@/components/app-shell/CanEdit";

export default function IntakePage() {
  return (
    <CanEdit
      fallback={
        <div className="border border-border bg-card p-8">
          <p className="text-sm text-muted-foreground">
            View only — you can’t make changes. Intake is for owners and
            members.
          </p>
        </div>
      }
    >
      <IntakeClient aiConfigured={Boolean(process.env.OPENAI_API_KEY)} />
    </CanEdit>
  );
}
