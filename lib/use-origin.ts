"use client";

import { useSyncExternalStore } from "react";

const EMPTY = "";
const subscribe = () => () => {};

/**
 * window.location.origin, client-only (Step-8 doctrine: the origin is read in
 * an effect/hydration-safe path, never baked into SSR HTML). useSyncExternalStore
 * is the canonical "read external mutable value" primitive — SSR renders "" and
 * the real origin replaces it post-hydration with no setState-in-effect.
 */
export function useOrigin(): string {
  return useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => EMPTY
  );
}
