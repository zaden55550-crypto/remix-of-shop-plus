// Moving to any plan, up or down: the payment decides, the plan changes, nothing is deleted and the cloud copy is brought up to date.
import { takePayment } from "@/lib/payment";
import { PLANS, store, type PlanId } from "@/lib/shopbook";

/** cloud-backup.ts listens for this and saves straight away if the owner is signed in to Cloud. */
export const PLAN_CHANGED_EVENT = "shopbook-plan";

export type PlanChange =
  { ok: true; firstPlan: boolean; test: boolean } | { ok: false; error: string };

export async function buyPlan(
  planId: PlanId,
  billing: "monthly" | "yearly",
  pay = takePayment,
  opts: { phone?: string | undefined; onStep?: ((step: "sent" | "waiting") => void) | undefined } = {},
): Promise<PlanChange> {
  const account = store.get();
  const plan = PLANS.find((p) => p.id === planId);
  if (!account || !plan) return { ok: false, error: "Sign in to change your plan." };
  if (account.staff) return { ok: false, error: "Only the owner can change the plan." };
  if (account.plan === planId) return { ok: false, error: "This is already your plan." };

  const request = { planId, billing, amountUsd: billing === "yearly" ? Math.round(plan.yearlyUsd) : plan.monthlyUsd, ...(opts.phone ? { phone: opts.phone } : {}) };
  const payment = opts.onStep ? await pay(request, opts.onStep) : await pay(request);
  if (!payment.ok) return payment;

  store.update({ plan: planId, billing, trialChoice: undefined });
  window.dispatchEvent(new Event(PLAN_CHANGED_EVENT));
  return { ok: true, firstPlan: !account.plan, test: payment.test };
}
