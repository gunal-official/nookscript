/**
 * /vs/[slug] content map (Step 13). Data-driven so adding a competitor is
 * one more entry here — new rows ship as plain copy, never fetched, never
 * rendered from a DB. Only "notion" has real content this step; unknown
 * slugs are 404s (handled in page.tsx).
 */
export interface VsComparisonRow {
  feature: string;
  nookscript: string;
  competitor: string;
}

export interface VsPageEntry {
  slug: string;
  competitor: string;
  heading: string;
  intro: string;
  rows: VsComparisonRow[];
  takeaway: string;
}

export const VS_PAGES: Record<string, VsPageEntry> = {
  notion: {
    slug: "notion",
    competitor: "Notion",
    heading: "nookscript vs Notion",
    intro:
      "Notion is a great general-purpose workspace — wikis, docs, databases, whatever you build in it. nookscript is smaller on purpose: it does one job, the writing trail of client work, with the structure already assembled instead of architected by you.",
    rows: [
      {
        feature: "Client intake",
        nookscript:
          "Paste raw emails, call notes, chat logs — every message stays verbatim, threaded onto its brief.",
        competitor:
          "Store anything in pages; the intake structure is up to you.",
      },
      {
        feature: "Structured briefs",
        nookscript:
          "Gap-flagged brief drafts with tracked open questions and full edit history.",
        competitor: "A blank page plus whatever template you build.",
      },
      {
        feature: "Proposals & plans",
        nookscript:
          "Generated stage by stage — scope, deliverables, and budget carry through automatically.",
        competitor: "Written by hand; no built-in link back to intake.",
      },
      {
        feature: "Client updates",
        nookscript:
          "Composed from plan progress — weekly updates without re-typing.",
        competitor: "Manual status docs, updated by hand.",
      },
      {
        feature: "Public share links",
        nookscript:
          "Token-gated, revocable read-only links scoped to a single update.",
        competitor: "Share whole pages; revoking means unpublishing the page.",
      },
      {
        feature: "Setup cost",
        nookscript:
          "Nothing to design — the pipeline already exists; you just run client work through it.",
        competitor: "You architect databases, views, and relations yourself.",
      },
    ],
    takeaway:
      "If your work is client work — especially solo — nookscript trades Notion's infinite flexibility for a pipeline that's already assembled. Notion covers the rest.",
  },
};
