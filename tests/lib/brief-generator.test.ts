/**
 * Unit tests for lib/ai/brief-generator.ts — the deterministic heuristic
 * engine (the no-API-key fallback: same input → same output). The OpenAI
 * path (`generateBriefContent` with a key) is integration territory and
 * intentionally not exercised here (no third-party services in tests).
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { generateBriefHeuristic } from "../../lib/ai/brief-generator.ts";

const EMAIL = [
  "From: Jordan Reyes <jordan@client.example>",
  "Subject: Website refresh — Northwind",
  "",
  "Hi team,",
  "",
  "We want to refresh the Northwind marketing site before the June launch.",
  "The budget is $4,000 and the deadline is Friday.",
  "",
  "Deliverables we need:",
  "- Redesign the homepage",
  "• A new logo",
  "3. Print ads",
  "",
  "Best,",
  "Jordan",
].join("\n");

describe("generateBriefHeuristic — extraction", () => {
  test("title from Subject, client from From header, objective from first paragraphs", () => {
    const b = generateBriefHeuristic(EMAIL);
    assert.equal(b.title, "Website refresh — Northwind");
    assert.equal(b.client_name, "Jordan Reyes");
    assert.ok(b.objective?.includes("Northwind marketing site"));
  });

  test("deliverables: all bullet styles, stripped, dN ids, unchecked", () => {
    const b = generateBriefHeuristic(EMAIL);
    assert.deepEqual(b.deliverables, [
      { id: "d1", text: "Redesign the homepage", checked: false },
      { id: "d2", text: "A new logo", checked: false },
      { id: "d3", text: "Print ads", checked: false },
    ]);
  });

  test("budget_timeline collects money/date sentences; no gap question then", () => {
    const b = generateBriefHeuristic(EMAIL);
    assert.ok(b.budget_timeline?.includes("$4,000"));
    assert.ok(b.budget_timeline?.includes("Friday"));
    assert.ok(
      !b.questions.some((q) => q.question_text.includes("budget and target timeline")),
      "gap question must NOT appear when budget signals exist"
    );
  });

  test("client name falls back to a sign-off", () => {
    const b = generateBriefHeuristic(
      "We would love a one-page site for the bakery opening soon.\n\nBest,\nSam Patel"
    );
    assert.equal(b.client_name, "Sam Patel");
  });

  test("greetings and headers never become the title; fallback is 'Untitled brief'", () => {
    assert.equal(generateBriefHeuristic("Hi there,\n\nok?").title, "Untitled brief");
  });
});

describe("generateBriefHeuristic — questions", () => {
  test("hedged sentences become 'Can you confirm' questions quoting the hedge", () => {
    const b = generateBriefHeuristic("We think the site could launch in June.");
    const hedge = b.questions.find((q) => q.question_text.startsWith("Can you confirm"));
    assert.ok(hedge, "hedge question exists");
    assert.ok(hedge.question_text.includes("We think the site could launch in June"));
        assert.equal(hedge.context_note, 'client said "We think"');
    assert.ok(b.budget_timeline, "'launch' is a budget/timeline signal");
  });

  test("direct source questions are lifted verbatim (Q: prefix stripped)", () => {
    const b = generateBriefHeuristic("Q: Should we include print ads in phase one?");
    const direct = b.questions.find((q) => q.context_note === "asked directly in the source");
    assert.equal(direct?.question_text, "Should we include print ads in phase one?");
  });

  test("no budget signals → the canonical gap question", () => {
    const b = generateBriefHeuristic("Please make the logo bigger.");
    assert.equal(b.budget_timeline, null);
    assert.deepEqual(b.questions, [
      {
        question_text: "What is the budget and target timeline for this work?",
        context_note: "no budget or dates were mentioned in the source",
      },
    ]);
  });

  test("questions dedupe case-insensitively and cap at 8", () => {
    const dup = "Is the copy final? is the copy final?\nMaybe later. Might work. Unsure. TBD. Roughly. Around then. Depends. Probably fine. Possibly. Or so we heard.";
    const b = generateBriefHeuristic(dup);
    const texts = b.questions.map((q) => q.question_text.toLowerCase());
    assert.equal(new Set(texts).size, texts.length, "no duplicate questions");
    assert.ok(b.questions.length <= 8);
  });
});

describe("generateBriefHeuristic — determinism", () => {
  test("same input → identical output (the doc's contract)", () => {
    assert.deepEqual(generateBriefHeuristic(EMAIL), generateBriefHeuristic(EMAIL));
  });
});
