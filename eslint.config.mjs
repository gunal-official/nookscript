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
      // WARN during the Next 16 migration: this new react-hooks@7 rule flags
      // deliberate, user-specified patterns — window.location.origin read in
      // an effect (Step-8 doctrine, hydration safety), post-refresh re-sync
      // effects (the proven fix for stale flight payloads, Steps 23/33),
      // dialog exit-presence, motion-rows list diffing, timer tick. Each is
      // external-system sync, which is the documented legitimate effect use;
      // refactors belong in their own reviewed step, not the migration.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
