/**
 * AI brief generation for /intake.
 *
 * TESTING
 *   Real AI:  set OPENAI_API_KEY in .env.local, then use /intake (or call
 *             generateBriefContent() from the intake server action).
 *   No key:   falls back to a deterministic, dependency-free heuristic
 *             extractor (used automatically in sandboxes/CI where
 *             api.openai.com is unreachable). The action reports which
 *             engine produced the draft ("openai" | "heuristic").
 *
 *   Standalone heuristic smoke test:
 *     npx tsc lib/ai/brief-generator.ts --outDir /tmp/nstest --module es2020 \
 *       --target es2020 --moduleResolution bundler --skipLibCheck
 *     node -e "import('/tmp/nstest/brief-generator.js').then(m => \
 *       console.log(JSON.stringify(m.generateBriefHeuristic(SRC), null, 2)))"
 */

export interface GeneratedQuestion {
  question_text: string;
  context_note: string | null;
}

export interface GeneratedBriefContent {
  title: string;
  objective: string | null;
  client_name: string | null;
  budget_timeline: string | null;
  deliverables: { id: string; text: string; checked: boolean }[];
  questions: GeneratedQuestion[];
}

export type GeneratorEngine = "openai" | "heuristic";

const SYSTEM_PROMPT = `You extract structured client-work briefs from pasted client communications (emails, chat transcripts, call notes).

Return ONLY valid JSON with this exact shape:
{
  "title": string,                 // "Client — Project" style, <= 80 chars
  "objective": string | null,      // 1-3 sentences: what the client wants and why
  "client_name": string | null,    // client company or person, if identifiable
  "budget_timeline": string | null,// anything about budget, cost, deadlines, dates
  "deliverables": string[],        // concrete deliverables the client asked for
  "questions": [                   // vague/hedged/missing items needing clarification
    {
      "question_text": string,     // a specific question to ask the client
      "context_note": string | null// the hedged quote/reason, e.g. client said "maybe"
    }
  ]
}

Rules:
- Flag hedged language ("maybe", "not sure", "TBD", "around", "roughly", "we think", "depends") as questions.
- Flag mission-critical info that is missing (budget, deadline, scope boundaries, who approves) as questions.
- Do not invent facts. Use null when unknown. No markdown, JSON only.`;

/** Generate brief content from pasted source text. Tries OpenAI when a key
 *  is configured; on any failure (no key, network, parse) falls back to the
 *  deterministic heuristic so the flow never dead-ends. */
export async function generateBriefContent(
  rawText: string
): Promise<{ content: GeneratedBriefContent; engine: GeneratorEngine }> {
  if (process.env.OPENAI_API_KEY) {
    try {
      return { content: await generateWithOpenAI(rawText), engine: "openai" };
    } catch (err) {
      console.error(
        "[brief-generator] OpenAI generation failed, using heuristic fallback:",
        err instanceof Error ? err.message : err
      );
    }
  }
  return { content: generateBriefHeuristic(rawText), engine: "heuristic" };
}

// ───────────────────────── OpenAI path ─────────────────────────

async function generateWithOpenAI(
  rawText: string
): Promise<GeneratedBriefContent> {
  // Dynamic import keeps this module loadable (and the heuristic testable)
  // in environments without the openai package/network.
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_BRIEF_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: rawText.slice(0, 12000) },
    ],
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("empty completion");

  return sanitize(JSON.parse(text));
}

/** Coerce whatever the model returned into our exact shape. */
function sanitize(raw: unknown): GeneratedBriefContent {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const asString = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  const deliverablesRaw = Array.isArray(obj.deliverables)
    ? obj.deliverables
    : [];
  const deliverables = deliverablesRaw
    .map((d, i) =>
      typeof d === "string"
        ? { id: `d${i + 1}`, text: d.trim(), checked: false }
        : d && typeof d === "object" && typeof (d as { text?: unknown }).text === "string"
          ? {
              id: typeof (d as { id?: unknown }).id === "string"
                ? ((d as { id: string }).id as string)
                : `d${i + 1}`,
              text: (d as { text: string }).text.trim(),
              checked: Boolean((d as { checked?: unknown }).checked),
            }
          : null
    )
    .filter((d): d is NonNullable<typeof d> => d !== null && d.text.length > 0)
    .slice(0, 12);

  const questionsRaw = Array.isArray(obj.questions) ? obj.questions : [];
  const questions: GeneratedQuestion[] = questionsRaw
    .map((q) => {
      if (typeof q === "string") return { question_text: q.trim(), context_note: null };
      if (q && typeof q === "object") {
        const o = q as Record<string, unknown>;
        const qt = asString(o.question_text);
        return qt ? { question_text: qt, context_note: asString(o.context_note) } : null;
      }
      return null;
    })
    .filter((q): q is GeneratedQuestion => q !== null && q.question_text.length > 0)
    .slice(0, 10);

  return {
    title: (asString(obj.title) ?? "Untitled brief").slice(0, 120),
    objective: asString(obj.objective),
    client_name: asString(obj.client_name),
    budget_timeline: asString(obj.budget_timeline),
    deliverables,
    questions,
  };
}

// ───────────────────── Heuristic fallback path ─────────────────────

const HEDGE_PATTERN =
  /\b(maybe|might|not sure|unsure|tbd|to be (decided|confirmed|determined)|roughly|around|depends|we think|probably|possibly|or so)\b/i;
const BUDGET_PATTERN =
  /(\$|€|£|₹|budget|cost|price|deadline|timeline|by (eod|friday|monday|end of)|week of|kicks? off|launch|deliver by)/i;
const BULLET_PATTERN = /^\s*(?:[-*•–]|\d+[.)])\s+/;

/**
 * Deterministic extractor: no AI, same output for the same input. Good
 * enough to develop/test the full intake flow without an API key; the UI
 * flags its results as heuristic.
 */
export function generateBriefHeuristic(rawText: string): GeneratedBriefContent {
  const text = rawText.replace(/\r\n/g, "\n").trim();
  const lines = text.split("\n").map((l) => l.trim());
  const nonEmpty = lines.filter(Boolean);
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  // Sentence stream built per line, so bullet runs/paragraphs don't glue
  // into unmatchable mega-sentences.
  const sentences = nonEmpty
    .flatMap((l) => l.split(/(?<=[.!?])\s+/))
    .map((s) => s.replace(BULLET_PATTERN, "").trim())
    .filter((s) => s.length > 3);

  // Title: email Subject line if present, else the first substantive line
  // (skipping email headers and greetings), else fallback.
  const subject = text.match(/^subject:\s*(.+)$/im)?.[1]?.trim();
  const firstSubstantive = nonEmpty.find(
    (l) =>
      l.length > 15 &&
      !/^(from|to|subject|date|cc|bcc):/i.test(l) &&
      !/^(hi|hello|dear|hey)\b/i.test(l)
  );
  const title = (
    subject ||
    firstSubstantive?.replace(/[.!?\s]+$/, "") ||
    "Untitled brief"
  ).slice(0, 80);

  // Client name: "From: Name <email>" header, or a sign-off ("Best,\nName").
  const fromMatch = text.match(/^from:\s*([^<\n]+?)(?:\s*<[^>]+>)?$/im);
  const signMatch = text.match(
    /(?:best|thanks|regards|cheers)\b[\s,]*\n([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  );
  const client_name = fromMatch?.[1]?.trim() || signMatch?.[1]?.trim() || null;

  // Objective: first 1–2 BODY paragraphs — email header blocks and
  // greetings are skipped (the same junk the title logic skips), so a
  // pasted email yields the client's actual words, not "From: … Hi,".
  const isJunkParagraph = (p: string) =>
    /^(from|to|subject|date|cc|bcc):/i.test(p) || /^(hi|hello|dear|hey)\b/i.test(p);
  const objective =
    paragraphs
      .filter((p) => !isJunkParagraph(p))
      .slice(0, 2)
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 500) || null;

  // Deliverables: bulleted / numbered lines.
  const deliverables = nonEmpty
    .filter((l) => BULLET_PATTERN.test(l))
    .map((l) => l.replace(BULLET_PATTERN, "").trim())
    .filter((l) => l.length > 2)
    .slice(0, 10)
    .map((text, i) => ({ id: `d${i + 1}`, text, checked: false }));

  // Budget/timeline: sentences containing numbers/keywords.
  const budgetBits = sentences
    .filter((s) => BUDGET_PATTERN.test(s) && s.length < 260)
    .slice(0, 3);
  const budget_timeline = budgetBits.length ? budgetBits.join(" ") : null;

  // Questions: direct questions in the source, hedged sentences, plus an
  // explicit "budget unknown" gap when no budget signals exist.
  const questions: GeneratedQuestion[] = [];
  for (const s of sentences) {
    if (s.length > 180) continue;
    if (s.includes("?") && s.length > 10) {
      questions.push({
        question_text: s.replace(/^q:\s*/i, ""),
        context_note: "asked directly in the source",
      });
    } else if (HEDGE_PATTERN.test(s)) {
      const hedge = s.match(HEDGE_PATTERN)?.[0] ?? "hedged wording";
      questions.push({
        question_text: `Can you confirm: “${s.replace(/[.!\s]+$/, "")}”?`,
        context_note: `client said "${hedge}"`,
      });
    }
  }
  if (!budget_timeline) {
    questions.push({
      question_text: "What is the budget and target timeline for this work?",
      context_note: "no budget or dates were mentioned in the source",
    });
  }

  const deduped = questions
    .filter(
      (q, i, arr) =>
        arr.findIndex(
          (x) => x.question_text.toLowerCase() === q.question_text.toLowerCase()
        ) === i
    )
    .slice(0, 8);

  return {
    title,
    objective,
    client_name,
    budget_timeline,
    deliverables,
    questions: deduped,
  };
}
