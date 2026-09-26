-- Phase: global multi-currency for Stripe billing (2026-09-26 follow-up).
--
-- DESIGN DECISIONS (locked):
--   * currency + amount are DISPLAY data: what the workspace subscribed
--     to (currency from the checkout session — authoritative, uppercased
--     ISO-4217) and the operator's configured amount (STRIPE_PRICES,
--     major units). The CHARGED amount is always Stripe's; these columns
--     exist so Settings and /pricing can show the plan truthfully and the
--     owner can see which currency they pay in.
--   * Both are nullable and survive cancellation (the row is kept as
--     history with status='canceled').
--   * currency CHECK: 3 letters or NULL — nothing else is a currency
--     code; rejects partial/junk writes at the database layer.
--   * The currency LIST is operator config (STRIPE_PRICES env), never a
--     database object — adding a currency is a dashboard + env change,
--     no migration.
--
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
--        or: supabase db push

alter table public.billing_subscriptions
  add column if not exists currency text
  check (currency is null or char_length(currency) = 3);
alter table public.billing_subscriptions
  add column if not exists amount numeric;
