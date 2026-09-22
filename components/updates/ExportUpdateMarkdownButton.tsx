"use client";

/**
 * Client-side markdown export for /updates/:id — downloads the update's
 * title + body as a .md file via a Blob + temporary <a> click. Mirrors the
 * plans ExportMarkdownButton; exports the last-saved content (server
 * props), not unsaved composer edits.
 */

import { useState } from "react";
import { Check, Download } from "lucide-react";

import { Button } from "@/components/ui/button";

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "update";
}

export function ExportUpdateMarkdownButton({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const [exported, setExported] = useState(false);

  function handleExport() {
    const markdown = `# ${title}\n\n${body.trimEnd()}\n`;
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
