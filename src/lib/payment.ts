// The one place a plan payment is decided.
// Real payments (owner, 2026-11-23): when Zakrio Systems' own M-Pesa keys are set as server secrets (plan-payment.functions.ts), a
// plan is paid by an M-Pesa prompt to the owner's phone and counts only once Safaricom confirms it. Until those secrets exist,
// PAYMENT_TEST_MODE (the owner's instruction for the testing period) accepts every payment and takes no money.
import type { PlanId } from "@/lib/shopbook";

/** TESTING PERIOD ONLY: while the server has no M-Pesa keys, every payment is accepted and no money is taken.
 *  Once the keys are set, real M-Pesa is used whatever this says. Setting this to false (with no keys) stops plan changes. */
export const PAYMENT_TEST_MODE = true;

export type PaymentRequest = { planId: PlanId; billing: "monthly" | "yearly"; amountUsd: number; phone?: string | undefined };
export type PaymentResult =
  { ok: true; reference: string; test: boolean } | { ok: false; error: string };

/** Whether real M-Pesa plan payments are set up, and the shilling price per plan:billing (asked of the server). */
export async function realPayment(): Promise<{ ready: boolean; prices: Record<string, number> }> {
  try { const { planPaymentInfo } = await import("@/lib/plan-payment.functions"); return await planPaymentInfo(); }
  catch { return { ready: false, prices: {} }; }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function takePayment(request: PaymentRequest, onStep?: (step: "sent" | "waiting") => void): Promise<PaymentResult> {
  const real = await realPayment();
  if (real.ready) {
    if (!request.phone) return { ok: false, error: "Enter the M-Pesa number that will pay." };
    try {
      const { startPlanPayment, planPaymentStatus } = await import("@/lib/plan-payment.functions");
      const s = await startPlanPayment({ data: { planId: request.planId, billing: request.billing, phone: request.phone, origin: window.location.origin } });
      onStep?.("sent");
      // The customer has about a minute to enter their PIN; Safaricom is asked every 5 seconds for up to 2 minutes.
      for (let i = 0; i < 24; i++) {
        await wait(5000); onStep?.("waiting");
        const r = await planPaymentStatus({ data: { checkoutRequestId: s.checkoutRequestId } });
        if (r.status === "paid") return { ok: true, reference: r.receipt || s.checkoutRequestId, test: false };
        if (r.status === "failed") return { ok: false, error: "The M-Pesa payment was not completed. You have not been charged." };
      }
      return { ok: false, error: "No answer from M-Pesa yet. If money left your phone, contact support with the M-Pesa message." };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Payment failed. You have not been charged." }; }
  }
  if (PAYMENT_TEST_MODE) return { ok: true, reference: `TEST-${Date.now()}`, test: true };
  return { ok: false, error: "Online payment isn't available yet. You have not been charged." };
}
