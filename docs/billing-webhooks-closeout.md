# Events, Webhooks + Stripe Billing — Closeout

Final summary of the 2026-09-26 phase: event recording, outbound webhooks,
and Stripe Checkout billing for Nookscript's own Free → Pro subscription
(this is platform billing — client invoicing already existed). Written at
`9d99507`, updated for global multi-currency Stripe billing (the product
is global, not India-only — Stripe is the only provider; a Razorpay
pivot that started the same day was reversed before commit). Foundation: `d3433ab` ("events/webhooks foundation + Stripe
Checkout"). Follow-ups: the eight "suggestions pass N/10" commits
`b0f48a1`…`9d99507`. Companions: `README.md` ("Events, webhooks + Stripe
billing" section), `.env.local.example` (all vars commented out).

## 1. What shipped

| Slice | Where | Contents |
|---|---|---|
| Events | `20260926080000_events.sql`, `lib/events.ts` | `events(workspace_id, event_type, payload jsonb, created_at)`; 10 CHECK-constrained types (below); `recordEvent()` never throws (void-fires into the void of dispatch); recorded at the owning server actions |
| Outbound webhooks | `20260926090000_webhooks.sql`, `lib/webhooks.ts`, `lib/webhook-dispatch.ts` | per-workspace HTTPS endpoints (owner-only register/delete), `whsec_`-prefixed HMAC secrets, signed POSTs, in-process retries 0/15s/60s, SSRF guard (private/loopback/link-local rejected) |
| Delivery log | Webhooks card, Settings | per-attempt rows in `webhook_deliveries` (`pending`/`delivered`/`failed`, `response_code`, `last_error`, attempt #) |
| Test ping | `testWebhookEndpoint` action | owner fires one signed ping at an endpoint, result shown in the card |
| Secret rotation | `rotateWebhookEndpoint` action | new secret in place (no endpoint re-registration); old signature stops verifying |
| Retry cron sweep | `20260926110000_webhook_retry_schedule.sql`, `app/api/cron/webhooks/route.ts` | `next_retry_at` column + atomic claim (1h lease); `POST /api/cron/webhooks` gated by `CRON_SECRET` (Bearer, constant-time); recovers rows frozen by serverless process death |
| Stripe billing (global) | `20260926100000_billing.sql` + `20260926130000_billing_currency.sql`, `lib/stripe.ts`, `app/api/stripe/webhook/route.ts`, PlanCard | hosted Checkout (no card forms anywhere; raw `fetch` + `node:crypto` — zero new dependencies), **multi-currency: `STRIPE_PRICES` JSON config (one recurring price per currency, currency picker in Settings, prices shown on /pricing + Settings)**, exactly two Stripe webhooks, per-workspace `billing_subscriptions` (currency/amount recorded), Customer Portal for Pro |
| Activity feed | EventsCard on Settings (pass 8) | the events table's read surface — latest workspace events with type + time |
| Four more event types | `20260926120000_event_types_team_templates.sql` (pass 9) | CHECK constraint grows 6 → 10 (replaced in place, house rule: new types land by migration) |

### Event types (the CHECK constraint, verbatim)

`brief.created` · `proposal.accepted` · `proposal.declined` ·
`plan.task_completed` (task toggled ON only) · `invoice.paid` ·
`contract.signed` · `team.member.joined` · `team.member.left` ·
`team.member.removed` · `template.created`

### Webhook delivery contract (what receivers verify)

- **Signature header** `X-NookScript-Signature: t=<unix-sec>,v1=<hex>`
  where `v1 = HMAC_SHA256(signing_secret, "${t}.${raw_body}")`. Multiple
  `v1=` entries are accepted (any match wins, `timingSafeEqual`);
  `t` must be within ±300s of now.
- **Headers** `X-NookScript-Event: <event_type>`,
  `X-NookScript-Delivery: <delivery id>`.
- **Envelope** `{ "id", "event_type", "payload", "created_at" }` — `id`
  is the stable event id (receivers dedupe on it; a rare accepted
  double-attempt shares it).
- **Retries**: attempts at 0s / 15s / 60s, then terminal `failed`
  (row keeps `last_error`, stays visible in the card). On long-lived
  servers the in-process timers fire; on serverless the
  `next_retry_at` + cron sweep is the recovery path (documented
  trade-off: a claim that dies mid-flight re-delivers after the 1h
  lease lapses).

### Billing flow (locked)

- **Upgrade**: Settings → Plan card → pick a currency →
  `startCheckout(currency)` (owner-only; requires `STRIPE_SECRET_KEY` +
  a parseable `STRIPE_PRICES` listing that currency, else an actionable
  error naming the configured currencies) → `POST /v1/checkout/sessions`
  for that currency's price (`Stripe-Version: 2024-06-20`, urlencoded,
  15s timeout) → redirect to Stripe-hosted Checkout.
  Success/cancel land back on `/settings?checkout=success|canceled`
  (one-time toast, pass 6).
- **Webhooks** (register exactly two): `checkout.session.completed` →
  upsert `billing_subscriptions` `status='active'` + the session's
  `currency` (uppercased ISO-4217) + the amount resolved from
  `STRIPE_PRICES` via the line item's price id (onConflict
  `workspace_id`); `customer.subscription.deleted` → `status='canceled'`
  (currency/amount kept as history).
  All other event types: 200 + ignored. Bad/missing signature: 400.
  Writes go through the service-role client only; RLS gives members
  SELECT.
- **Plan state**: `plan = billing.status === 'active' ? 'pro' : 'free'`
  — the webhooks own the transitions; the app never trusts the client.
- **Portal** (pass 5): Pro workspaces get a hosted Stripe Customer
  Portal link (ManageBillingButton) — card management/cancellation on
  Stripe's side.
- **Prices are the operator's config**: one recurring (monthly) price
  per currency in `STRIPE_PRICES`; the amounts the app shows (Settings +
  /pricing) are that config's display values (major units) and must
  match the Stripe prices. The CHARGED amount is always Stripe's — the
  DB columns are display data. Config absent → no price renders
  anywhere (no invented numbers).

## 2. Env (all optional, all commented in `.env.local.example`)

| Var | Needed for |
|---|---|
| `STRIPE_SECRET_KEY` (test mode in dev) + `STRIPE_PRICES` (JSON, one recurring price per currency) | the in-app upgrade button (currency picker appears with 2+) |
| `STRIPE_WEBHOOK_SECRET` | `/api/stripe/webhook` signature verification |
| `SUPABASE_SERVICE_ROLE_KEY` | Stripe-webhook + cron-sweep writes (service role, bypasses RLS) |
| `CRON_SECRET` | the retry sweep (`POST /api/cron/webhooks`, Bearer) |

Nothing configured = the app behaves exactly as before the phase
(early-access mailto on the Plan card, events still recorded).

## 3. User-side setup checklist (live deployment)

1. Apply the five phase migrations (in order, as with all others):
   `20260926080000_events` · `20260926090000_webhooks` ·
   `20260926100000_billing` · `20260926110000_webhook_retry_schedule` ·
   `20260926120000_event_types_team_templates`.
2. Stripe (TEST mode for dev): create a product with ONE recurring
   (monthly) price PER CURRENCY you offer — Stripe Checkout accepts
   cards in 135+ currencies worldwide — and list them in
   `STRIPE_PRICES` (JSON: currency, priceId, amount in major units).
3. Register a webhook endpoint at `https://<your-domain>/api/stripe/webhook`
   subscribed to exactly `checkout.session.completed` and
   `customer.subscription.deleted` → its signing secret is
   `STRIPE_WEBHOOK_SECRET`. Local dev:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
4. Set the remaining env (service-role key from Supabase → Project
   Settings → API).
5. Optional: point any scheduler once per minute at
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET"
   https://<your-domain>/api/cron/webhooks` (cron, GitHub Actions
   schedule, Vercel cron…).
6. Smoke: test card `4242 4242 4242 4242` → Plan card flips to Pro
   (Active); cancelling in the portal flips it back.

## 4. Honest limitations

- In-process retry timers don't survive serverless process freezes —
  that is exactly what the cron sweep + `next_retry_at` exists for;
  without a scheduler, a frozen mid-retry delivery row waits for the
  in-process timer to be impossible (the row stays `pending` until a
  sweep claims it).
- The sweep needs an EXTERNAL scheduler; the app ships no timer of its
  own (serverless has none).
- A claim that dies mid-flight re-delivers after the 1h lease (accepted;
  receivers dedupe on the envelope `id`).
- The delivery log has no retention policy (rows stay; small volume by
  construction — 10 event types, 3 attempts max).
- Secret rotation invalidates signatures immediately — receivers holding
  the old secret see verification failures until updated.
- The app is Stripe-only by design (global product — one provider with
  worldwide card coverage); the currency list is whatever the operator
  configures in `STRIPE_PRICES`, never a hardcoded list.
- Display amounts come from the operator's config; if a Stripe price is
  changed in the dashboard without updating `STRIPE_PRICES`, the shown
  amount can drift from the charged one (the charge is authoritative).
- Dev keys are TEST mode only; production credentials are never
  referenced or required by the repo.

## 5. Verification (all green at this phase's HEAD — CI `verify` on the branch)

`npx tsc --noEmit` · `npm run lint` · `npm test` (116/116) ·
`npm run build` (24 routes incl. `ƒ /api/stripe/webhook`,
`ƒ /api/cron/webhooks`) · `npm run verify:db` (all migrations +
delivery/claim/RLS groups) · `npm run verify:responsive` full sweep
(29 pages × 320/375/414/600/768/1024/1440, zero overflow/cut/tap
findings — evidence `~/responsive-evidence/step7-pricing-copy/`, which
covers the Settings card states this phase changed).
