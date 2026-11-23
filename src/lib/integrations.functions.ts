// Each business connects its OWN accounts (owner, 2026-11-23): M-Pesa Daraja, WhatsApp Business (Cloud API), SMS (Africa's Talking)
// and KRA eTIMS. Details are saved to the server (proposed migration 0023) and never come back to the browser; these functions read
// them with the service role only to call the provider. eTIMS details are stored now; sending to KRA is added once KRA approves
// Zakrio Systems as an integrator and gives its technical specification.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";

type Untyped = { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>; from: (t: string) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const untyped = (c: unknown) => c as Untyped;
const admin = async () => untyped((await import("@/integrations/supabase/client.server")).supabaseAdmin);
const notReady = (m: string) => (/does not exist|schema cache|business_integration/i.test(m) ? "Connections aren't switched on in the server yet (migration 0023)" : m);

export const KINDS = ["mpesa", "whatsapp", "sms", "etims"] as const;
export type IntegrationKind = (typeof KINDS)[number];

export const saveIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ kind: z.enum(KINDS), config: z.record(z.string().max(500)), enabled: z.boolean(), accept: z.boolean() }).parse(v))
  .handler(async ({ data, context }) => {
    const r = await untyped(context.supabase).rpc("save_business_integration", { p_kind: data.kind, p_config: data.config as Json, p_enabled: data.enabled, p_accept: data.accept });
    if (r.error) throw new Error(notReady(r.error.message));
    return { ok: true };
  });

export const integrationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const r = await untyped(context.supabase).rpc("business_integration_status");
    if (r.error) return { ready: false, error: notReady(r.error.message), items: [] as { kind: string; enabled: boolean; fields: string[] }[] };
    return { ready: true, error: null, items: (r.data as { kind: string; enabled: boolean; fields: string[] }[]) ?? [] };
  });

async function configOf(owner: string, kind: IntegrationKind) {
  const r = await (await admin()).from("business_integrations").select("config, enabled").eq("owner_id", owner).eq("kind", kind).maybeSingle();
  if (r.error) throw new Error(notReady(r.error.message));
  if (!r.data || !r.data.enabled) throw new Error(`Connect ${kind === "mpesa" ? "M-Pesa" : kind === "whatsapp" ? "WhatsApp" : kind === "sms" ? "SMS" : "eTIMS"} first in Settings › Finance › Connections`);
  return r.data.config as Record<string, string>;
}
const intlPhone = (p: string) => { const d = p.replace(/\D/g, ""); return d.startsWith("0") ? `254${d.slice(1)}` : d.startsWith("254") ? d : d.length === 9 ? `254${d}` : d; };

/* ---------- M-Pesa Daraja: STK push ("Lipa na M-Pesa" prompt on the customer's phone) ---------- */
export const mpesaStkPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ amount: z.number().positive().max(250000), phone: z.string().min(9).max(20), reference: z.string().min(1).max(12), origin: z.string().url() }).parse(v))
  .handler(async ({ data, context }) => {
    const owner = context.userId, cfg = await configOf(owner, "mpesa");
    if (!cfg["consumerKey"] || !cfg["consumerSecret"] || !cfg["shortcode"] || !cfg["passkey"]) throw new Error("Fill in every M-Pesa field first");
    const host = cfg["environment"] === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke";
    const tok = await fetch(`${host}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${btoa(`${cfg["consumerKey"]}:${cfg["consumerSecret"]}`)}` } });
    if (!tok.ok) throw new Error("M-Pesa refused the Consumer Key or Secret");
    const token = ((await tok.json()) as { access_token?: string }).access_token;
    const d = new Date(), pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    const till = cfg["type"] === "till", phone = intlPhone(data.phone);
    const res = await fetch(`${host}/mpesa/stkpush/v1/processrequest`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({
      BusinessShortCode: cfg["shortcode"], Password: btoa(`${cfg["shortcode"]}${cfg["passkey"]}${timestamp}`), Timestamp: timestamp,
      TransactionType: till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline", Amount: Math.round(data.amount), PartyA: phone,
      PartyB: till ? (cfg["till"] || cfg["shortcode"]) : cfg["shortcode"], PhoneNumber: phone,
      CallBackURL: `${data.origin.replace(/\/$/, "")}/api/mpesa-callback?o=${owner}`, AccountReference: data.reference, TransactionDesc: data.reference,
    }) });
    const body = (await res.json().catch(() => ({}))) as { CheckoutRequestID?: string; MerchantRequestID?: string; ResponseCode?: string; errorMessage?: string; CustomerMessage?: string };
    if (!res.ok || body.ResponseCode !== "0" || !body.CheckoutRequestID) throw new Error(body.errorMessage || "M-Pesa didn't accept the request");
    const ins = await (await admin()).from("mpesa_payments").insert({ owner_id: owner, checkout_request_id: body.CheckoutRequestID, merchant_request_id: body.MerchantRequestID, amount: data.amount, phone, reference: data.reference });
    if (ins.error) throw new Error(notReady(ins.error.message));
    return { checkoutRequestId: body.CheckoutRequestID, message: body.CustomerMessage ?? "" };
  });

export const mpesaPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ checkoutRequestId: z.string().min(5).max(80) }).parse(v))
  .handler(async ({ data, context }) => {
    const r = await untyped(context.supabase).from("mpesa_payments").select("status, receipt, result_desc, amount").eq("checkout_request_id", data.checkoutRequestId).maybeSingle();
    if (r.error) throw new Error(notReady(r.error.message));
    return (r.data ?? { status: "pending" }) as { status: "pending" | "paid" | "failed"; receipt?: string; result_desc?: string; amount?: number };
  });

/* ---------- WhatsApp Business / SMS: send a message from the business's own account ---------- */
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ channel: z.enum(["whatsapp", "sms"]), to: z.string().min(9).max(20), text: z.string().min(1).max(1500) }).parse(v))
  .handler(async ({ data, context }) => {
    const to = intlPhone(data.to);
    if (data.channel === "whatsapp") {
      const cfg = await configOf(context.userId, "whatsapp");
      const res = await fetch(`https://graph.facebook.com/v20.0/${cfg["phoneNumberId"]}/messages`, { method: "POST", headers: { Authorization: `Bearer ${cfg["accessToken"]}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: data.text } }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "WhatsApp didn't send the message");
      return { sent: true };
    }
    const cfg = await configOf(context.userId, "sms");
    const form = new URLSearchParams({ username: cfg["username"] ?? "", to: `+${to}`, message: data.text, ...(cfg["senderId"] ? { from: cfg["senderId"] } : {}) });
    const host = cfg["username"] === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
    const res = await fetch(`${host}/version1/messaging`, { method: "POST", headers: { apiKey: cfg["apiKey"] ?? "", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: form });
    if (!res.ok) throw new Error("The SMS provider didn't send the message");
    return { sent: true };
  });

/** For /api/mpesa-callback: records Safaricom's answer for that owner's payment. */
export async function recordMpesaCallback(owner: string, body: unknown) {
  const cb = (body as { Body?: { stkCallback?: { CheckoutRequestID?: string; ResultCode?: number; ResultDesc?: string; CallbackMetadata?: { Item?: { Name: string; Value?: unknown }[] } } } })?.Body?.stkCallback;
  if (!cb?.CheckoutRequestID) return;
  const receipt = cb.CallbackMetadata?.Item?.find((i) => i.Name === "MpesaReceiptNumber")?.Value;
  await (await admin()).from("mpesa_payments").update({ status: cb.ResultCode === 0 ? "paid" : "failed", receipt: receipt ? String(receipt) : null, result_desc: cb.ResultDesc ?? null, updated_at: new Date().toISOString() })
    .eq("checkout_request_id", cb.CheckoutRequestID).eq("owner_id", owner);
}
