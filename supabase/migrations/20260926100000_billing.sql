-- Phase: events/webhooks foundation — NookScript's own subscription state
-- (Stripe Checkout for Free → Pro; NOT client invoicing, which lives in
-- the invoices tables).
--
-- DESIGN DECISIONS (locked):
--   * Row ABSENCE = Free. A row records the Stripe customer/subscription
--     pair and one of two states: 'active' (checkout.session.completed)
--     or 'canceled' (customer.subscription.deleted).
--   * Writes happen ONLY from the Stripe webhook route via the service
--     role (bypasses RLS) — after signature verification. Users get a
--     read-only SELECT policy; there are deliberately NO insert/update/
--     delete policies for users.
--   * stripe_subscription_id is UNIQUE so the deletion webhook can find
--     the row without storing workspace context in Stripe.

create table if not exists public.billing_subscriptions (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  status text not null default 'active'
    check (status in ('active', 'canceled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.billing_subscriptions enable row level security;

create policy "billing: members can select"
  on public.billing_subscriptions for select
  using (public.is_workspace_member(workspace_id));

-- No insert/update/delete policies: Stripe webhook route (service role)
-- is the only writer.

drop trigger if exists billing_subscriptions_touch_updated_at on public.billing_subscriptions;
create trigger billing_subscriptions_touch_updated_at
  before update on public.billing_subscriptions
  for each row
  execute function public.touch_updated_at();
