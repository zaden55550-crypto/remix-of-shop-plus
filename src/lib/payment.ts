// The one place a plan payment is decided. Connect the real payment API inside takePayment.
import type { PlanId } from "@/lib/shopbook";

/** TESTING PERIOD ONLY: every payment is accepted and no money is taken, so anyone can get any plan for free.
 *  Replace with the real API, verified on the server, before charging customers. Setting this to false stops plan changes. */
export const PAYMENT_TEST_MODE = true;

export type PaymentRequest = { planId: PlanId; billing: "monthly" | "yearly"; amountUsd: number };
export type PaymentResult =
  { ok: true; reference: string; test: boolean } | { ok: false; error: string };

export async function takePayment(_request: PaymentRequest): Promise<PaymentResult> {
  if (PAYMENT_TEST_MODE) return { ok: true, reference: `TEST-${Date.now()}`, test: true };
  return { ok: false, error: "Online payment isn't available yet. You have not been charged." };
}
