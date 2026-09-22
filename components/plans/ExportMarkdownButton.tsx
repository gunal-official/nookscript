"use client";

/**
 * Client-side markdown export for /plans/:id. Formats the plan (title,
 * client, budget & timeline, task checklist as "- [x]"/"- [ ]") into a
 * markdown string and downloads it via a Blob + temporary <a> click.
 * No server endpoint, no dependencies, nothing persisted.
 */

import { useState } from "react";
import { Check, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PlanTask } from "@/lib/types/plan";

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "plan";
}

function buildMarkdown(input: {
  title: string;
  clientName: string | null;
  budgetTimeline: string | null;
  tasks: PlanTask[];
}): string {
  const lines: string[] = [`# ${input.title}`, ""];
  lines.push(
    `**Client:** ${input.clientName ?? "—"}`,
    "",
    `**Budget & timeline:** ${input.budgetTimeline ?? "—"}`,
    "",
    "## Tasks",
    ""
  );
  for (const task of input.tasks) {
    lines.push(`- [${task.checked ? "x" : " "}] ${task.text}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function ExportMarkdownButton({
  title,
  clientName,
  budgetTimeline,
  tasks,
}: {
  title: string;
  clientName: string | null;
  budgetTimeline: string | null;
  tasks: PlanTask[];
}) {
  const [exported, setExported] = useState(false);

  function handleExport() {
    const markdown = buildMarkdown({ title, clientName, budgetTimeline, tasks });
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(title)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setExported(true);
    setTimeout(() => setExported(false), 2000);
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      onClick={handleExport}
    >
      {exported ? (
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      {exported ? "Exported" : "Export as markdown"}
    </Button>
  );
}
