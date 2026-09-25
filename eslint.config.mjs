// ESLint 9 flat config (Step 34(a-fix2) Next 16 migration). The legacy
// .eslintrc.json `{"extends": "next/core-web-vitals"}` becomes this: the
// eslint-config-next@16 package exports ready-made flat config arrays.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    ignores: [
      ".next/**",
      // resp-next is verify tooling's NEXT_DIST_DIR build output (and out/ is
      // the default export dir) — never lint build artifacts.
      "resp-next/**",
      "out/**",
      "coverage/**",
      "next-env.d.ts",
      "**/*.mjs",
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // Promoted back to the plugin default (error) after the Step 34(a-fix5)
      // refactors: origin reads -> useSyncExternalStore (lib/use-origin.ts),
      // hydration flag -> useSyncExternalStore, re-sync effects ->
      // adjust-state-during-render, timer restore -> deferred callback,
      // dialog keep -> render-time adjust. The one deliberate exception is
      // motion-rows.tsx's list-diff choreography (file-level disable there,
      // justified and probe-tested).
    },
  },
];
