// Safaricom sends the result of a plan payment prompt here. Only the M-Pesa receipt number is kept from it; whether the plan was paid
// is always asked of Safaricom directly (planPaymentStatus), so a forged callback can't unlock a plan. Always answers "Accepted".
import { createFileRoute } from "@tanstack/react-router";
import { recordPlanCallback } from "@/lib/plan-payment.functions";

export const Route = createFileRoute("/api/plan-payment-callback")({ server: { handlers: { POST: async ({ request }) => {
  try { await recordPlanCallback(await request.json()); } catch { /* answer anyway */ }
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
} } } });
