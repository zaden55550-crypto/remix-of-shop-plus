-- PROPOSED 0024 (owner approval needed; independent of the others): real plan payments by M-Pesa to Zakrio Systems' own Paybill or
-- Till (src/lib/plan-payment.functions.ts). One row per payment prompt. The amount is set by the server from the plan, and the status
-- changes only after Safaricom itself confirms the payment (STK query), so browsers can read their own rows but never write them.
-- Rollback: drizzle/proposed/rollback/0024_plan_payments.down.sql.

CREATE TABLE public.plan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('basic', 'growth', 'business')),
  billing text NOT NULL CHECK (billing IN ('monthly', 'yearly')),
  amount_kes numeric NOT NULL CHECK (amount_kes > 0),
  phone text NOT NULL,
  checkout_request_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  receipt text,
  result_desc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_payments_owner_idx ON public.plan_payments (owner_id, created_at DESC);
ALTER TABLE public.plan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their plan payments" ON public.plan_payments FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.plan_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plan_payments TO authenticated;
GRANT ALL ON public.plan_payments TO service_role;
