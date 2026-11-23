// Real plan payments by M-Pesa to Zakrio Systems' own Paybill or Till (owner, 2026-11-23). The keys are server secrets set in
// Lovable Cloud (never in the browser): ZAKRIO_MPESA_ENVIRONMENT (sandbox|live), ZAKRIO_MPESA_TYPE (paybill|till),
// ZAKRIO_MPESA_SHORTCODE, ZAKRIO_MPESA_TILL (Buy Goods only), ZAKRIO_MPESA_CONSUMER_KEY, ZAKRIO_MPESA_CONSUMER_SECRET,
// ZAKRIO_MPESA_PASSKEY, and ZAKRIO_KES_PER_USD (the exchange rate used to turn the plan's USD price into shillings).
// The amount is worked out here from PLANS, never taken from the browser, and a payment counts only when Safaricom itself
// confirms it (stkQuery). Rows are kept in plan_payments (proposed migration 0024).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { darajaReady, stkPush, stkQuery, type DarajaConfig } from "@/lib/daraja";
import { PLANS } from "@/lib/shopbook";

const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined) ?? "";
const config = (): DarajaConfig => ({
  environment: env("ZAKRIO_MPESA_ENVIRONMENT") || "sandbox", type: env("ZAKRIO_MPESA_TYPE") || "paybill", shortcode: env("ZAKRIO_MPESA_SHORTCODE"),
  till: env("ZAKRIO_MPESA_TILL"), consumerKey: env("ZAKRIO_MPESA_CONSUMER_KEY"), consumerSecret: env("ZAKRIO_MPESA_CONSUMER_SECRET"), passkey: env("ZAKRIO_MPESA_PASSKEY"),
});
const rate = () => { const r = Number(env("ZAKRIO_KES_PER_USD")); return Number.isFinite(r) && r > 0 ? r : 0; };
type Untyped = { from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const admin = async () => (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Untyped;

/** The plan's price in shillings, from the plan itself and the server's exchange rate. */
export function planKes(planId: string, billing: "monthly" | "yearly", kesPerUsd: number) {
  const p = PLANS.find((x) => x.id === planId);
  if (!p || !(kesPerUsd > 0)) return 0;
  return Math.round((billing === "yearly" ? Math.round(p.yearlyUsd) : p.monthlyUsd) * kesPerUsd);
}

/** Whether real M-Pesa plan payments are set up on the server, and the shilling prices it will charge. */
export const planPaymentInfo = createServerFn({ method: "GET" })
  .handler(async () => {
    const ready = darajaReady(config()) && rate() > 0;
    return { ready, prices: ready ? Object.fromEntries(PLANS.flatMap((p) => [[`${p.id}:monthly`, planKes(p.id, "monthly", rate())], [`${p.id}:yearly`, planKes(p.id, "yearly", rate())]])) as Record<string, number> : {} };
  });

export const startPlanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ planId: z.enum(["basic", "growth", "business"]), billing: z.enum(["monthly", "yearly"]), phone: z.string().min(9).max(20), origin: z.string().url() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = config(), amount = planKes(data.planId, data.billing, rate());
    if (!darajaReady(c) || amount <= 0) throw new Error("Online payment isn't available yet. You have not been charged.");
    const r = await stkPush(c, { amount, phone: data.phone, reference: `ZAKRIO ${data.planId}`.toUpperCase(), callbackUrl: `${data.origin.replace(/\/$/, "")}/api/plan-payment-callback` });
    const ins = await (await admin()).from("plan_payments").insert({ owner_id: context.userId, plan_id: data.planId, billing: data.billing, amount_kes: amount, phone: r.phone, checkout_request_id: r.checkoutRequestId });
    if (ins.error) throw new Error(/does not exist|schema cache/i.test(ins.error.message) ? "Plan payments aren't switched on in the server yet (migration 0024)" : ins.error.message);
    return { checkoutRequestId: r.checkoutRequestId, amount };
  });

/** Asks Safaricom how the payment ended and records it; only "paid" lets the plan change. */
export const planPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ checkoutRequestId: z.string().min(5).max(80) }).parse(v))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const row = await db.from("plan_payments").select("status, receipt, plan_id, billing").eq("checkout_request_id", data.checkoutRequestId).eq("owner_id", context.userId).maybeSingle();
    if (row.error || !row.data) throw new Error("This payment wasn't found");
    if (row.data.status !== "pending") return { status: row.data.status as "paid" | "failed", receipt: row.data.receipt as string | null, planId: row.data.plan_id as string, billing: row.data.billing as string };
    const q = await stkQuery(config(), data.checkoutRequestId);
    if (q.status !== "pending") await db.from("plan_payments").update({ status: q.status, result_desc: q.desc, updated_at: new Date().toISOString() }).eq("checkout_request_id", data.checkoutRequestId).eq("owner_id", context.userId);
    const after = q.status === "paid" ? await db.from("plan_payments").select("receipt").eq("checkout_request_id", data.checkoutRequestId).maybeSingle() : null;
    return { status: q.status, receipt: (after?.data?.receipt as string | null) ?? null, planId: row.data.plan_id as string, billing: row.data.billing as string, desc: q.desc };
  });

/** For /api/plan-payment-callback: keeps Safaricom's receipt number. The status itself is decided by planPaymentStatus. */
export async function recordPlanCallback(body: unknown) {
  const cb = (body as { Body?: { stkCallback?: { CheckoutRequestID?: string; CallbackMetadata?: { Item?: { Name: string; Value?: unknown }[] } } } })?.Body?.stkCallback;
  const receipt = cb?.CallbackMetadata?.Item?.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
  if (!cb?.CheckoutRequestID || !receipt) return;
  await (await admin()).from("plan_payments").update({ receipt: String(receipt), updated_at: new Date().toISOString() }).eq("checkout_request_id", cb.CheckoutRequestID);
}
