"use client";

// In-house list motion (Step 33 — no new dependency): items added to the list
// rise in; removed items collapse where they stood (fade + height — the one
// documented exception to transform/opacity, since height must animate to
// reflow the list) and unmount after `ms`.
//
// The diff effect is keyed on the ID SET (not the items array identity) — a
// props-derived array is a fresh reference every render, and an [items] dep
// would re-run the diff forever, starving the drop timer. The previous
// snapshot also lives in a module-level store (keyed) so leave detection
// survives server-revalidation remounts. Respects prefers-reduced-motion via
// the CSS animation kill-switch (class stays, animation is none).
import { useEffect, useState } from "react";

export interface MotionEntry<T> {
  item: T;
  leaving: boolean;
}

const STORE = new Map<string, MotionEntry<unknown>[]>();

export function useMotionItems<T extends { id: string }>(items: T[], ms = 220, storeKey?: string): MotionEntry<T>[] {
  const idKey = items.map((i) => i.id).join("|");
  const [display, setDisplay] = useState<MotionEntry<T>[]>(() => {
    const prev = storeKey ? (STORE.get(storeKey) as MotionEntry<T>[] | undefined) : undefined;
    return prev ?? items.map((item) => ({ item, leaving: false }));
  });

  useEffect(() => {
    setDisplay((prev) => {
      const byId = new Map(items.map((i) => [i.id, i]));
      const next: MotionEntry<T>[] = [];
      for (const e of prev) {
        if (byId.has(e.item.id)) next.push({ item: byId.get(e.item.id)!, leaving: false });
        else if (!e.leaving) next.push({ item: e.item, leaving: true });
        else next.push(e);
      }
      for (const i of items) if (!next.some((e) => e.item.id === i.id)) next.push({ item: i, leaving: false });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  useEffect(() => {
    if (storeKey) STORE.set(storeKey, display);
    if (!display.some((e) => e.leaving)) return;
    const t = setTimeout(() => {
      setDisplay((prev) => {
        const dropped = prev.filter((e) => !e.leaving);
        if (storeKey) STORE.set(storeKey, dropped);
        return dropped;
      });
    }, ms);
    return () => clearTimeout(t);
  }, [display, ms, storeKey]);

  return display;
}
