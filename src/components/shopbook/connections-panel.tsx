// Settings › Finance › Connections (owner, 2026-11-23): each business connects its OWN M-Pesa (Daraja), WhatsApp Business, SMS and
// KRA eTIMS accounts. Keys go to the server (integrations.functions.ts) and are never shown again; the screen only knows what is set.
// Each connection needs the terms accepted, because providers charge for messages and payments, and Zakrio Systems may add a fee.
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import { AutoSummaryForm } from "@/components/shopbook/auto-summary";
import { GlassPage } from "@/components/shopbook/glass-page";
import { supabase } from "@/integrations/supabase/client";
import { store } from "@/lib/shopbook";
import { waNumber } from "@/lib/whatsapp";
import { integrationStatus, mpesaPaymentStatus, mpesaStkPush, saveIntegration, sendMessage, type IntegrationKind } from "@/lib/integrations.functions";

type Field = { key: string; label: string; secret?: boolean; options?: [string, string][]; hint?: string };
const FORMS: Record<IntegrationKind, { title: string; about: string; fields: Field[] }> = {
  mpesa: { title: "M-Pesa (Daraja)", about: "Your own Daraja app from developer.safaricom.co.ke. Customers get a payment prompt on their phone and the sale is marked paid when Safaricom confirms.", fields: [
    { key: "environment", label: "Environment", options: [["sandbox", "Sandbox (testing)"], ["live", "Live"]] },
    { key: "type", label: "Paybill or Till", options: [["paybill", "Paybill"], ["till", "Till (Buy Goods)"]] },
    { key: "shortcode", label: "Shortcode (Paybill or store number)" }, { key: "till", label: "Till number (Buy Goods only)" },
    { key: "consumerKey", label: "Consumer Key", secret: true }, { key: "consumerSecret", label: "Consumer Secret", secret: true }, { key: "passkey", label: "Passkey", secret: true }] },
  whatsapp: { title: "WhatsApp Business", about: "Your own WhatsApp Business Cloud API (Meta). Receipts, reminders and the daily summary are sent from your business number. Messages you start may need an approved template.", fields: [
    { key: "phoneNumberId", label: "Phone number ID" }, { key: "accessToken", label: "Access token", secret: true }] },
  sms: { title: "SMS (Africa's Talking)", about: "Your own Africa's Talking account. Receipts, reminders and the daily summary by SMS.", fields: [
    { key: "username", label: "Username (\"sandbox\" for testing)" }, { key: "apiKey", label: "API key", secret: true }, { key: "senderId", label: "Sender ID (optional)" }] },
  airtel: { title: "Airtel Money", about: "Your own Airtel Money business API (Collections) from developers.airtel.africa. The details are saved now; till prompts for Airtel switch on once they are tested with your account.", fields: [
    { key: "environment", label: "Environment", options: [["sandbox", "Sandbox (testing)"], ["live", "Live"]] },
    { key: "country", label: "Country code (e.g. KE, UG, TZ, RW, ZM)" }, { key: "currency", label: "Currency (e.g. KES, UGX)" },
    { key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client secret", secret: true }] },
  mtn: { title: "MTN MoMo", about: "Your own MTN Mobile Money API (Collections) from momodeveloper.mtn.com. The details are saved now; till prompts for MTN switch on once they are tested with your account.", fields: [
    { key: "environment", label: "Environment", options: [["sandbox", "Sandbox (testing)"], ["live", "Live"]] },
    { key: "targetEnvironment", label: "Target environment (e.g. mtnuganda)" }, { key: "currency", label: "Currency (e.g. UGX, GHS)" },
    { key: "subscriptionKey", label: "Subscription key", secret: true }, { key: "apiUser", label: "API user" }, { key: "apiKey", label: "API key", secret: true }] },
  orange: { title: "Orange Money", about: "Your own Orange Money merchant API from developer.orange.com. The details are saved now; till prompts for Orange switch on once they are tested with your account.", fields: [
    { key: "country", label: "Country code (e.g. CI, SN, CM)" }, { key: "merchantKey", label: "Merchant key", secret: true },
    { key: "clientId", label: "Client ID" }, { key: "clientSecret", label: "Client secret", secret: true }] },
  evc: { title: "EVC Plus (WaafiPay)", about: "Your own Hormuud WaafiPay merchant account for EVC Plus, Zaad and Sahal. The details are saved now; till prompts for EVC Plus switch on once they are tested with your account.", fields: [
    { key: "environment", label: "Environment", options: [["sandbox", "Sandbox (testing)"], ["live", "Live"]] },
    { key: "merchantUid", label: "Merchant UID" }, { key: "apiUserId", label: "API user ID" }, { key: "apiKey", label: "API key", secret: true }] },
  otherpay: { title: "Other payment provider", about: "Any other mobile money, bank or card provider (Tigo Pesa, Halopesa, Wave, Equity, Paystack…). Save its details here; till prompts switch on once that provider's API is added for you.", fields: [
    { key: "provider", label: "Provider name" }, { key: "baseUrl", label: "API address (URL)" }, { key: "account", label: "Merchant / account number" },
    { key: "apiKey", label: "API key", secret: true }, { key: "apiSecret", label: "API secret", secret: true }] },
  etims: { title: "KRA eTIMS", about: "Your eTIMS details are kept ready. Sales start going to KRA once Zakrio Systems is approved by KRA as an eTIMS integrator.", fields: [
    { key: "kraPin", label: "KRA PIN" }, { key: "branchId", label: "Branch ID" }, { key: "deviceSerial", label: "Device serial number" }] },
};

const GROUPS: { title: string; items: (IntegrationKind | "summary" | "shop")[] }[] = [
  { title: "Payments", items: ["mpesa", "airtel", "mtn", "orange", "evc", "otherpay"] },
  { title: "Messages", items: ["whatsapp", "sms", "summary"] },
  { title: "Tax & online shop", items: ["etims", "shop"] },
];
const EXTRA = { summary: "Daily summary at closing time", shop: "Online shop link" } as const;

/** One page of tiles (owner, 2026-11-23): each connection is a tile with its state; tapping it opens its form in a window. */
export function ConnectionsPanel() {
  const { tr } = useLanguage();
  const [status, setStatus] = useState<{ ready: boolean; error: string | null; items: { kind: string; enabled: boolean; fields: string[] }[] } | null>(null);
  const [open, setOpen] = useState<IntegrationKind | "summary" | "shop" | null>(null);
  const load = () => { void integrationStatus().then(setStatus).catch((e: unknown) => setStatus({ ready: false, error: e instanceof Error ? e.message : "Sign in online first", items: [] })); };
  useEffect(load, []);
  const state = (k: string) => { const it = status?.items.find((x) => x.kind === k); return it ? (it.enabled ? "on" : "paused") : "off"; };
  const title = (k: IntegrationKind | "summary" | "shop") => (k === "summary" || k === "shop" ? EXTRA[k] : FORMS[k].title);
  return <div className="connections">
    <p className="settings-note">{tr("Connect your own accounts. Your keys are kept on the server and never shown again; leave a box empty to keep what is saved.")}</p>
    {status && !status.ready && <p className="settings-note is-warn" role="alert">{tr(/authori[sz]|sign.?in|jwt|session/i.test(status.error ?? "") ? "Sign in online with your business email to connect your accounts." : status.error ?? "Not available yet")}</p>}
    <div className="connection-groups">
      {GROUPS.map((g) => <section key={g.title} className="connection-group"><h4>{tr(g.title)}</h4>
        <div className="connection-tiles">{g.items.map((k) => { const st = k === "summary" || k === "shop" ? null : state(k);
          return <button key={k} type="button" className={`connection-tile${st === "on" ? " is-on" : ""}`} onClick={() => setOpen(k)}>
            <b>{tr(title(k))}</b>{st && <span className={`connection-chip is-${st}`}>{tr(st === "on" ? "Connected" : st === "paused" ? "Paused" : "Not connected")}</span>}
          </button>; })}</div>
      </section>)}
    </div>
    {open && <GlassPage label={tr(title(open))} onClose={() => setOpen(null)}>
      <div className="connection-window">{open === "summary" ? <AutoSummaryForm /> : open === "shop" ? <OnlineShopForm /> : <ConnectionForm kind={open} saved={status?.items.find((x) => x.kind === open)} onSaved={load} />}</div>
    </GlassPage>}
  </div>;
}

function ConnectionForm({ kind, saved, onSaved }: { kind: IntegrationKind; saved?: { enabled: boolean; fields: string[] } | undefined; onSaved: () => void }) {
  const { tr } = useLanguage();
  const form = FORMS[kind];
  const [v, setV] = useState<Record<string, string>>({ environment: "sandbox", type: "paybill" });
  const [accept, setAccept] = useState(false), [enabled, setEnabled] = useState(saved?.enabled ?? true), [busy, setBusy] = useState(false);
  const [test, setTest] = useState({ phone: "", amount: "1" }), [checking, setChecking] = useState<string | null>(null);
  const save = async () => {
    if (!accept) { toast.error(tr("Accept the terms first")); return; }
    setBusy(true);
    try { await saveIntegration({ data: { kind, config: v, enabled, accept } }); toast.success(tr("Saved")); setV({ environment: v["environment"] ?? "sandbox", type: v["type"] ?? "paybill" }); onSaved(); }
    catch (e) { toast.error(tr(e instanceof Error ? e.message : "Could not save")); } finally { setBusy(false); }
  };
  const tryIt = async () => {
    try {
      if (kind === "mpesa") {
        const r = await mpesaStkPush({ data: { amount: Number(test.amount) || 1, phone: test.phone, reference: "TEST", origin: window.location.origin } });
        toast.success(tr("Payment prompt sent. Check the phone.")); setChecking(r.checkoutRequestId);
      } else await sendMessage({ data: { channel: kind === "sms" ? "sms" : "whatsapp", to: test.phone, text: tr("Test message from Zakrio Systems") } }).then(() => toast.success(tr("Sent")));
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Could not send")); }
  };
  const check = async () => { if (!checking) return; const r = await mpesaPaymentStatus({ data: { checkoutRequestId: checking } }); toast(r.status === "paid" ? `${tr("Paid")} · ${r.receipt ?? ""}` : r.status === "failed" ? `${tr("Not paid")} · ${r.result_desc ?? ""}` : tr("Still waiting for the customer")); };
  return <section className="connection">
    <header><h4>{tr(form.title)}</h4><span className={saved ? "is-on" : "is-off"}>{saved ? tr(saved.enabled ? "Connected" : "Paused") : tr("Not connected")}</span></header>
    <p className="settings-note">{tr(form.about)}</p>
    <div className="connection-grid">
      {form.fields.map((f) => <label key={f.key} className="inventory-field"><span>{tr(f.label)}{saved?.fields.includes(f.key) && f.secret ? ` · ${tr("saved")}` : ""}</span>
        {f.options ? <select className="inventory-input" value={v[f.key] ?? f.options[0]![0]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })}>{f.options.map(([val, l]) => <option key={val} value={val}>{tr(l)}</option>)}</select>
          : <input className="inventory-input" type={f.secret ? "password" : "text"} autoComplete="off" value={v[f.key] ?? ""} placeholder={saved?.fields.includes(f.key) ? tr("Saved, leave empty to keep") : ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value.trim() })} />}
      </label>)}
    </div>
    <label className="feature-check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {tr("Use this connection")}</label>
    <label className="connection-terms"><input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} /> <span>{tr("I accept the")} <Link to="/terms" target="_blank">{tr("Terms & Conditions")}</Link> {tr("and")} <Link to="/privacy" target="_blank">{tr("Privacy Policy")}</Link>{tr(", and understand that the provider charges for payments and messages and Zakrio Systems may add a service fee.")}</span></label>
    <div className="connection-actions">
      <ShopButton disabled={busy} onClick={() => void save()}>{tr("Save")}</ShopButton>
      {saved && (kind === "mpesa" || kind === "whatsapp" || kind === "sms") && <><input className="inventory-input" inputMode="tel" placeholder={tr("Phone to test")} value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} />
        {kind === "mpesa" && <input className="inventory-input connection-amount" inputMode="numeric" value={test.amount} onChange={(e) => setTest({ ...test, amount: e.target.value })} aria-label={tr("Amount")} />}
        <ShopButton variant="outline" disabled={!test.phone} onClick={() => void tryIt()}>{tr(kind === "mpesa" ? "Send a test prompt" : "Send a test message")}</ShopButton>
        {checking && <ShopButton variant="outline" onClick={() => void check()}>{tr("Check payment")}</ShopButton>}</>}
    </div>
  </section>;
}

/** Online shop link: a public page at /shop/<link> with product names, prices and stock, and Order on WhatsApp (proposed 0023). */
function OnlineShopForm() {
  const { tr } = useLanguage();
  const [v, setV] = useState({ slug: "", title: "", whatsapp: "", enabled: true }), [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  useEffect(() => {
    void (supabase.from as unknown as (t: string) => { select: (c: string) => { maybeSingle: () => Promise<{ data: { slug: string; title: string; whatsapp: string | null; enabled: boolean } | null }> } })("public_shops")
      .select("slug, title, whatsapp, enabled").maybeSingle().then((r) => { if (r.data) { setV({ slug: r.data.slug, title: r.data.title, whatsapp: r.data.whatsapp ?? "", enabled: r.data.enabled }); setSaved(true); } }, () => undefined);
  }, []);
  const save = async () => {
    const slug = v.slug.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)) { toast.error(tr("Choose a link of 3 to 40 letters, numbers or dashes")); return; }
    if (!v.title.trim()) { toast.error(tr("Enter the shop name to show")); return; }
    setBusy(true);
    const r = await (supabase.rpc as unknown as (fn: string, a: object) => Promise<{ error: { message: string } | null }>)("set_public_shop", { p_slug: slug, p_title: v.title.trim(), p_whatsapp: v.whatsapp ? waNumber(v.whatsapp, store.get()?.country) : "", p_enabled: v.enabled });
    setBusy(false);
    if (r.error) { toast.error(tr(/does not exist|schema cache/i.test(r.error.message) ? "Connections aren't switched on in the server yet (migration 0023)" : r.error.message)); return; }
    setV({ ...v, slug }); setSaved(true); toast.success(tr("Saved"));
  };
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/shop/${v.slug}`;
  return <section className="connection">
    <header><h4>{tr("Online shop link")}</h4><span className={saved && v.enabled ? "is-on" : "is-off"}>{tr(saved && v.enabled ? "Connected" : "Not connected")}</span></header>
    <p className="settings-note">{tr("A page anyone can open with your products, prices and what is in stock. Customers pick items and order on WhatsApp. Buying prices, customers and money are never shown.")}</p>
    <div className="connection-grid">
      <label className="inventory-field"><span>{tr("Link")}</span><input className="inventory-input" value={v.slug} placeholder="my-shop" onChange={(e) => setV({ ...v, slug: e.target.value })} /></label>
      <label className="inventory-field"><span>{tr("Shop name to show")}</span><input className="inventory-input" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
      <label className="inventory-field"><span>{tr("WhatsApp number for orders")}</span><input className="inventory-input" inputMode="tel" value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} /></label>
    </div>
    <label className="feature-check"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} /> {tr("Show the page")}</label>
    <div className="connection-actions">
      <ShopButton disabled={busy} onClick={() => void save()}>{tr("Save")}</ShopButton>
      {saved && v.enabled && <><a className="connection-link" href={url} target="_blank" rel="noopener">{url}</a>
        <ShopButton variant="outline" onClick={() => { void navigator.clipboard?.writeText(url).then(() => toast.success(tr("Link copied"))); }}>{tr("Copy link")}</ShopButton></>}
    </div>
  </section>;
}
