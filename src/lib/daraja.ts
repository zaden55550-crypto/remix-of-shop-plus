// Safaricom Daraja calls shared by the business's own M-Pesa (integrations.functions.ts) and Zakrio Systems' plan payments
// (plan-payment.functions.ts). Server-side only: callers pass the keys they read from the server.
export type DarajaConfig = { environment?: string; type?: string; shortcode?: string; till?: string; consumerKey?: string; consumerSecret?: string; passkey?: string };

const host = (c: DarajaConfig) => (c.environment === "live" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const stamp = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
/** 07…, 7…, +254… or 254… → 2547… */
export const darajaPhone = (p: string) => { const d = p.replace(/\D/g, ""); return d.startsWith("0") ? `254${d.slice(1)}` : d.startsWith("254") ? d : d.length === 9 ? `254${d}` : d; };
export const darajaReady = (c: DarajaConfig) => !!(c.consumerKey && c.consumerSecret && c.shortcode && c.passkey);

async function token(c: DarajaConfig) {
  const r = await fetch(`${host(c)}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${btoa(`${c.consumerKey}:${c.consumerSecret}`)}` } });
  if (!r.ok) throw new Error("M-Pesa refused the Consumer Key or Secret");
  const t = ((await r.json()) as { access_token?: string }).access_token;
  if (!t) throw new Error("M-Pesa didn't give an access token");
  return t;
}

/** Sends the "Lipa na M-Pesa" prompt to the payer's phone. */
export async function stkPush(c: DarajaConfig, p: { amount: number; phone: string; reference: string; callbackUrl: string }) {
  if (!darajaReady(c)) throw new Error("Fill in every M-Pesa field first");
  const ts = stamp(), till = c.type === "till", phone = darajaPhone(p.phone);
  const res = await fetch(`${host(c)}/mpesa/stkpush/v1/processrequest`, { method: "POST", headers: { Authorization: `Bearer ${await token(c)}`, "Content-Type": "application/json" }, body: JSON.stringify({
    BusinessShortCode: c.shortcode, Password: btoa(`${c.shortcode}${c.passkey}${ts}`), Timestamp: ts,
    TransactionType: till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline", Amount: Math.round(p.amount), PartyA: phone,
    PartyB: till ? (c.till || c.shortcode) : c.shortcode, PhoneNumber: phone, CallBackURL: p.callbackUrl,
    AccountReference: p.reference.slice(0, 12), TransactionDesc: p.reference.slice(0, 13),
  }) });
  const body = (await res.json().catch(() => ({}))) as { CheckoutRequestID?: string; MerchantRequestID?: string; ResponseCode?: string; errorMessage?: string; CustomerMessage?: string };
  if (!res.ok || body.ResponseCode !== "0" || !body.CheckoutRequestID) throw new Error(body.errorMessage || "M-Pesa didn't accept the request");
  return { checkoutRequestId: body.CheckoutRequestID, merchantRequestId: body.MerchantRequestID ?? "", phone, message: body.CustomerMessage ?? "" };
}

/** Asks Safaricom directly how a prompt ended, so a payment is never trusted from a callback alone.
 *  pending: the customer hasn't answered yet; paid; failed (cancelled, wrong PIN, not enough money…). */
export async function stkQuery(c: DarajaConfig, checkoutRequestId: string): Promise<{ status: "pending" | "paid" | "failed"; desc: string }> {
  const ts = stamp();
  const res = await fetch(`${host(c)}/mpesa/stkpushquery/v1/query`, { method: "POST", headers: { Authorization: `Bearer ${await token(c)}`, "Content-Type": "application/json" }, body: JSON.stringify({
    BusinessShortCode: c.shortcode, Password: btoa(`${c.shortcode}${c.passkey}${ts}`), Timestamp: ts, CheckoutRequestID: checkoutRequestId,
  }) });
  const b = (await res.json().catch(() => ({}))) as { ResultCode?: string | number; ResultDesc?: string; errorCode?: string; errorMessage?: string };
  // While the customer is still on the prompt, Daraja answers with an error saying the transaction is being processed.
  if (b.errorCode || b.ResultCode === undefined) return { status: "pending", desc: b.errorMessage ?? "" };
  return String(b.ResultCode) === "0" ? { status: "paid", desc: b.ResultDesc ?? "" } : { status: "failed", desc: b.ResultDesc ?? "Not paid" };
}
