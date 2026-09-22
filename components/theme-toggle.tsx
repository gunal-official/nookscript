"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

const THEMES = ["light", "dark", "system"] as const;

/** Temporary verification control — lets you flip light / dark / system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {THEMES.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTheme(t)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm capitalize text-muted-foreground transition-colors hover:text-text",
            mounted && theme === t && "bg-muted font-medium text-text"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
