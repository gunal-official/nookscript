"use client";

// In-house list motion (Step 33 — no new dependency): items added to the list
// rise in; removed items collapse where they stood (fade + height — the one
// documented exception to transform/opacity, since height must animate to
// reflow the list) and unmount after `ms`. Respects prefers-reduced-motion via
// the CSS animation kill-switch (class stays, animation is none).
import { useEffect, useState } from "react";

export interface MotionEntry<T> {
  item: T;
  leaving: boolean;
}

export function useMotionItems<T extends { id: string }>(items: T[], ms = 220): MotionEntry<T>[] {
  const [display, setDisplay] = useState<MotionEntry<T>[]>(() =>
    items.map((item) => ({ item, leaving: false }))
  );

  useEffect(() => {
    setDisplay((prev) => {
      const byId = new Map(items.map((i) => [i.id, i]));
      const next: MotionEntry<T>[] = [];
      for (const e of prev) {
        if (byId.has(e.item.id)) next.push({ item: byId.get(e.item.id)!, leaving: false });
        else next.push({ ...e, leaving: true });
      }
      for (const i of items) if (!next.some((e) => e.item.id === i.id)) next.push({ item: i, leaving: false });
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (!display.some((e) => e.leaving)) return;
    const t = setTimeout(() => setDisplay((prev) => prev.filter((e) => !e.leaving)), ms);
    return () => clearTimeout(t);
  }, [display, ms]);

  return display;
}
