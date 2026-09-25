# Step 34 — Closeout

Final summary of the Step 33–34 program (design system → `ui.webp` visual
redesign → per-page rebuild). Written at `984e089` + the pure-logic test
wrap. Companion docs: `docs/icon-audit.md` (icon system + Step-34 delta),
`docs/roles-spec.md` (role behavior), `README.md` ("Step 34" section,
user-flow commands, gotchas).

## 1. What shipped

| Slice | Commits | Contents |
|---|---|---|
| 33 — design system | `3baf7ec` | tokens, `components/ui/*` (Button/Card/Badge/Avatar/Input/Dialog/Sheet/Toast/StatusBadge/TimeTimer/…), grouped sidebar shell, motion system, icon system |
| 34(a) — foundations | `4b15efe`…`da5ba93` | fonts, radii/shadows/colors to the `ui.webp` recipe (vivid orange `#ff6a2b` accent, white cards r16–20, soft shadows, pill buttons), responsive nav bands |
| 34(b) — page interiors | `9f2a018`…`814f8a1` | all 15 pages rebuilt on shared `components/ui/doc-detail.tsx` vocabulary: Pipeline `/dashboard`, lists (briefs/proposals/plans/updates/contracts/invoices with ListStats+StackedBar), detail pages, settings + PlanCard, intake + inbox, share-token + public invoice, time log |
| — SCROLL_PROOF | `6e37eee` | below-fold `[data-proof]` capture path (`proof/<w>/<slug>-<name>.png`) |
| — 3.3 wrap | `07a87de` | icon-audit §2b delta (44-instance size sweep, 2 documented glyph exceptions), README truths |
| — dark-mode proof | `d2ec76e` | `DARK=1` runs + quantified flip (means 0.116–0.128 vs 0.957 light), FRESH_SHOTS lesson |
| — marketing + `/vs/bonsai` | `9b7bb46` | pricing/about vocabulary chips, 15th page (`/vs/bonsai`) — the 15-PDF "bonsai" gap |
| — tests | `984e089` + wrap | behavioral coverage for all pure logic (59 tests, 0 fail) |

## 2. The design language (as built)

- **Tokens** (`app/globals.css`): accent `#ff6a2b` (dark `#ff7a45`), surfaces
  `#fff` / `#f5f5f7` (dark `#1b1b22` / `#121216`), `--radius 0.625rem`.
- **Components**: white cards r16–20 + soft shadows; lucide icons 16/18/20/24
  stroke 1.5 `currentColor` in tinted chips (`icon-chip{,-accent,-success,…}`);
  pill buttons (orange primary / white secondary / near-black CTA); grouped
  sidebar with uppercase labels; search-pill topbar + user chip; StatTile,
  PaperCard, ActivityTimeline, ListStats, StackedBar shared vocabulary.
- **Motion**: `fade-in`/`slide-in`/`pop-in`/`rise-in`/`route-in` +
  dialog `EXIT_MS=220` + list-exit toasts. **Guardrail audited clean**:
  every keyframe animates opacity/transform only, 150–200ms, and
  `prefers-reduced-motion: reduce` disables all of them.
- **Responsiveness**: bands 320/375/414 (drawer), 600/768 (rail), 1024+
  (232px sidebar); wrap-safe flex rows inside cards; `[justify-content:safe_center]`
  on the public documents; zero horizontal scroll anywhere.
- **Roles** (`docs/roles-spec.md`): owner / member / viewer — money hidden
  from viewers (`visibleGroups` drops exactly `MONEY_HREFS`), zero viewer writes.

## 3. Evidence (what was proven, not claimed)

- **Rendered eyeballs + width sweeps**: `scripts/verify-responsive.mjs` over
  25 page configs × 7 widths (320/375/414/600/768/1024/1440) — viewport
  escapes + clipped-text detector = 0 findings at every checkpoint; real
  Playwright Chromium renders eyeballed per slice (evidence dirs
  `/home/user/responsive-evidence/step34-*`).
- **Below-fold**: SCROLL_PROOF captures (`settings-plan.png`, intake
  SourceBubbles, invoice PaperCard+totals).
- **Dark mode**: `DARK=1` runs, quantified mean-luminance flip.
- **Empty states**: `EMPTY_FIXTURES=1` runs.
- **Motion/dialog**: `RUN_MOTION`/`RUN_DIALOG`/`RUN_INTERACT` gates green.
- **Tests**: 59/59 via `npm test` (`node --test tests/lib/*.test.ts
  tests/components/*.test.ts` — native type stripping, zero test deps)
  covers every pure module: `invoice-totals` (money math), `reports`
  (`computeReport` buckets/top-5/expiry), `dashboard` (clock + week strip),
  `utils` (formatting/guards), `rate-limit` (prefix surface + `clientKey`),
  nav behavior (`visibleGroups`/`isActive`), toast queue, motion items,
  and the Step-33 component contracts. CI (`.github/workflows/verify.yml`)
  runs all five offline gates: typecheck, lint, test, build, `verify:db`.
- **Database**: `npm run verify:db` green (144 checks / 19 groups).
- **Gates**: `npx tsc --noEmit` 0 errors; `npm run lint` (`eslint .`) exit 0.

## 4. Open items (NOT dropped — parked with triggers)

1. **Pixel-parity vs the 15 reference PDFs.** The PDF page renders were
   never delivered to the workspace, so a true screenshot-vs-reference pass
   could not run. The build matches `ui.webp` + the agreed text spec.
   **Trigger:** reference screenshots pasted inline (index, settings,
   breif-id first) → reconciliation runs page-by-page and **the reference
   wins** over this build wherever they disagree. Bonsai `/vs/bonsai` copy
   is additionally flagged for review against its reference PDF.
2. **eslint 9 → 10 bump.** Attempted `eslint@10.11.0` (2026-09-26): lint
   crashes with `TypeError: Error while loading rule 'react/display-name':
   contextOrFilename.getFilename is not a function` inside
   `eslint-config-next@16.3.6`'s nested `eslint-plugin-react` (the
   `eslint '>=9.0.0'` peer range is aspirational; the plugin uses the
   `context.getFilename` API removed in eslint 10). Reverted to the
   certified `eslint@^9.39.5` with zero repo footprint. **Verdict
   (2026-09-26): no workaround exists today** — `eslint-plugin-react@latest`
   (7.37.5) itself only peers `eslint ^3–^9.7`, and `eslint-config-next`'s
   latest stable is 16.3.6 (16.4.0-canary.* only beyond). An override
   cannot help while the plugin's own peer range excludes 10.
   **Trigger:** `eslint-plugin-react` releases eslint-10 support AND
   `eslint-config-next` ships it → bump + full battery.

## 5. Commands (the standing user flow)

```bash
git pull && npm install && npm run verify:responsive:setup   # first run
npm run verify:responsive                                    # 25 pages, 7 widths
npx tsc --noEmit && npm run lint
npm test                                                     # 59 tests, bare node
npm run verify:db
# capture variants (each run needs its OWN SHOTS_DIR — FRESH_SHOTS wipes it):
SHOTS_DIR=…/step34-dark WIDTHS=320,768,1024 DARK=1 SCROLL_PROOF=settings FRESH_SHOTS=1 node scripts/verify-responsive.mjs
```
