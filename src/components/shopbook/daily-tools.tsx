// Day-to-day screens (owner, 2026-11-23): Close the day (POS › Cash), barcode labels (Inventory), the online-shop QR on receipts,
// the spoken Setup guide, and "Invite a shop, get a free month" (Plans). Logic lives in src/lib/day-tools.ts and src/lib/qr.ts.
import { useEffect, useMemo, useState } from "react";
import { Barcode, Gift, MessageCircle, Printer, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { CounterPicker } from "@/components/shopbook/counter-picker";
import { PrintPreview } from "@/components/shopbook/print";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { assignBarcodes, closeDayText, code128, dayAtCounter, shopLinkUrl } from "@/lib/day-tools";
import { qrDataUrl } from "@/lib/qr";
import { readSettings } from "@/lib/settings-config";
import { PLANS, store } from "@/lib/shopbook";
import { PAID_INVITES_PER_FREE_MONTH, deviceReferralCode, freeMonths, referralPlan, rememberReferralCode } from "@/lib/referrals";
import { smsLink, waLink } from "@/lib/whatsapp";

type Tr = (x: string) => string;
type Money = (n: number) => string;
const fail = (tr: Tr, e: unknown) => toast.error(tr(e instanceof Error ? e.message : "Something went wrong"));

/* ---------- 6. Close the day (one counter at a time) ---------- */
export function CloseDay({ s, money, tr }: { s: erp.ErpState; money: Money; tr: Tr }) {
  const counter = erp.activeCounter(s), day = dayAtCounter(s, counter);
  const [counted, setCounted] = useState(""), [note, setNote] = useState(""), [done, setDone] = useState<string | null>(null);
  const diff = counted === "" ? null : +counted - day.expected;
  const label = (m: string) => erp.methodLabel(m, s, tr);
  const acc = store.get();
  const close = () => {
    try {
      if (counted === "" || !Number.isFinite(+counted)) throw new erp.ErpError("Enter the counted cash");
      if (diff !== 0 && !note.trim()) throw new erp.ErpError("Say why the cash is different");
      const text = closeDayText({ business: acc?.shopName ?? "", counter, day, counted: +counted, label, money, tr });
      erp.cashUp(+counted, note || tr("Day closed"));
      setDone(text); toast.success(tr("Day closed"));
    } catch (e) { fail(tr, e); }
  };
  if (done) return <div className="close-day">
    <h3>{tr("Day closed")}</h3>
    <pre className="close-day-text">{done}</pre>
    <div className="close-day-send">
      <a className="tools-btn is-wa" href={waLink(done, acc?.phone, acc?.country)} target="_blank" rel="noopener"><MessageCircle aria-hidden /> {tr("Send to my WhatsApp")}</a>
      <a className="tools-btn is-sms" href={smsLink(done, acc?.phone)}>SMS</a>
      <ShopButton variant="outline" onClick={() => { setDone(null); setCounted(""); setNote(""); }}>{tr("Done")}</ShopButton>
    </div>
  </div>;
  return <div className="close-day">
    <CounterPicker s={s} />
    <div className="close-day-grid">
      <p><span>{tr("Sales today")}</span><b>{day.sales} · {money(day.total)}</b></p>
      {day.byMethod.map(([m, v]) => <p key={m}><span>{label(m)}</span><b>{money(v)}</b></p>)}
      <p><span>{tr("Opening Cash")}</span><b>{money(day.opening)}</b></p>
      <p className="is-key"><span>{tr("Expected cash")}</span><b>{money(day.expected)}</b></p>
    </div>
    <label className="inventory-field"><span>{tr("Counted cash")} <i aria-hidden>*</i></span><input className="inventory-input" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" /></label>
    {diff !== null && <p className={`close-day-diff ${diff === 0 ? "is-ok" : "is-bad"}`}>{tr(diff === 0 ? "Cash is correct" : diff > 0 ? "Cash over by" : "Cash short by")}{diff !== 0 ? ` ${money(Math.abs(diff))}` : ""}</p>}
    {diff !== null && diff !== 0 && <label className="inventory-field"><span>{tr("Reason")} <i aria-hidden>*</i></span><input className="inventory-input" maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} /></label>}
    <ShopButton className="inventory-save" disabled={counted === ""} onClick={close}>{tr("Close the day")}</ShopButton>
  </div>;
}

/* ---------- 3. Barcode labels ---------- */
function BarcodeSvg({ code }: { code: string }) {
  const bars = code128(code), total = bars.reduce((a, [, w]) => a + w, 0) + 20;
  let x = 10;
  return <svg className="label-bars" viewBox={`0 0 ${total} 40`} preserveAspectRatio="none" aria-label={code} role="img">
    <rect width={total} height={40} fill="#fff" />
    {bars.map(([bar, w], i) => { const r = bar ? <rect key={i} x={x} y={0} width={w} height={40} fill="#000" /> : null; x += w; return r; })}
  </svg>;
}
export function BarcodeLabels({ s, money }: { s: erp.ErpState; money: Money }) {
  const { tr } = useLanguage();
  const [q, setQ] = useState(""), [pick, setPick] = useState<Record<string, number>>({}), [print, setPrint] = useState(false);
  const list = useMemo(() => erp.searchProducts(s, q).slice(0, 60), [s, q]);
  const chosen = Object.entries(pick).filter(([, n]) => n > 0).map(([id, n]) => ({ p: s.products.find((x) => x.id === id)!, n })).filter((x) => x.p);
  const missing = chosen.filter((x) => !x.p.barcode).length;
  const give = () => { try { const n = assignBarcodes(chosen.map((x) => x.p.id)); toast.success(`${tr("Barcodes given")}: ${n}`); } catch (e) { fail(tr, e); } };
  return <div className="tools-panel">
    <h3><Barcode aria-hidden /> {tr("Barcode labels")}</h3>
    <p className="settings-note">{tr("Choose products and how many labels each. Products without a barcode can get their own new one first. Labels print with name, price and barcode.")}</p>
    <input className="inventory-input" placeholder={tr("Search products")} value={q} onChange={(e) => setQ(e.target.value)} />
    <ul className="tools-list label-pick">{list.map((p) => <li key={p.id}>
      <span><b>{p.name}</b><small>{p.barcode || tr("No barcode")} · {money(erp.shopPrice(p, erp.activeShop(s)))}</small></span>
      <input className="inventory-input tools-small" inputMode="numeric" aria-label={`${tr("Labels")} · ${p.name}`} value={pick[p.id] ?? ""} placeholder="0" onChange={(e) => setPick({ ...pick, [p.id]: Math.max(0, Math.min(200, Math.floor(+e.target.value || 0))) })} />
    </li>)}</ul>
    <div className="connection-actions">
      {missing > 0 && <ShopButton variant="outline" onClick={give}>{tr("Give new barcodes")} ({missing})</ShopButton>}
      <ShopButton disabled={!chosen.length} onClick={() => setPrint(true)}><Printer aria-hidden /> {tr("Print labels")} ({chosen.reduce((a, x) => a + x.n, 0)})</ShopButton>
    </div>
    {print && <PrintPreview title={tr("Barcode labels")} onClose={() => setPrint(false)}>
      <div className="label-sheet">{chosen.flatMap(({ p, n }) => Array.from({ length: n }, (_, i) => <div key={`${p.id}-${i}`} className="label">
        <b>{p.name}</b><span>{money(erp.shopPrice(p, erp.activeShop(s)))}</span>{p.barcode ? <BarcodeSvg code={p.barcode} /> : <em>{tr("No barcode")}</em>}<small>{p.barcode}</small>
      </div>))}</div>
    </PrintPreview>}
  </div>;
}

/* ---------- 4. Receipt QR to the online shop ---------- */
export function ReceiptQr({ tr }: { tr: Tr }) {
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(shopLinkUrl(readSettings().shopLink, window.location.origin)); }, []);
  const src = useMemo(() => { try { return url ? qrDataUrl(url) : ""; } catch { return ""; } }, [url]);
  if (!src) return null;
  return <div className="receipt-qr"><img src={src} alt={url} width={96} height={96} /><small>{tr("Scan to order again on WhatsApp")}</small></div>;
}

/* ---------- 7. Spoken Setup guide (English or Kiswahili) ---------- */
const GUIDE: Record<"English" | "Swahili", string[]> = {
  English: ["Welcome to Business Setup.", "First, type your business name and phone number.", "Next, choose your business type.", "Then add your shops and warehouses. Each one gets its own row.", "Add the people who will work with you using Add User.", "When everything is ready, press the green Activate button at the top right."],
  Swahili: ["Karibu kwenye Mpangilio wa Biashara.", "Kwanza, andika jina la biashara yako na namba ya simu.", "Kisha, chagua aina ya biashara yako.", "Baadaye ongeza maduka na maghala yako. Kila moja lina mstari wake.", "Ongeza watu watakaofanya kazi nawe kwa kubonyeza Ongeza Mtumiaji.", "Kila kitu kikiwa tayari, bonyeza kitufe cha kijani cha Washa juu upande wa kulia."],
};
export function VoiceGuide() {
  const { tr, language } = useLanguage();
  const [on, setOn] = useState(false);
  useEffect(() => () => { try { window.speechSynthesis?.cancel(); } catch { /* none */ } }, []);
  const play = () => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!synth) { toast.error(tr("This browser can't read aloud")); return; }
    if (on) { synth.cancel(); setOn(false); return; }
    const sw = language === "Swahili", voices = synth.getVoices();
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(sw ? "sw" : "en-ke")) ?? voices.find((v) => v.lang.toLowerCase().startsWith(sw ? "sw" : "en"));
    const u = new SpeechSynthesisUtterance(GUIDE[sw ? "Swahili" : "English"].join(" "));
    u.lang = sw ? "sw-KE" : "en-KE"; u.rate = 0.92; if (voice) u.voice = voice;
    u.onend = () => setOn(false); u.onerror = () => setOn(false);
    synth.cancel(); synth.speak(u); setOn(true);
  };
  return <button type="button" className={`voice-guide${on ? " is-on" : ""}`} onClick={play} title={tr(on ? "Stop the spoken guide" : "Listen to the setup guide")} aria-label={tr(on ? "Stop the spoken guide" : "Listen to the setup guide")}>
    {on ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
  </button>;
}

/* ---------- 8. Invite a shop, get a free month ---------- */
const REF = "shopbook.ref";
/** /signup?ref=CODE keeps the code on this device until the new owner is signed in online (then record_referral, once). */
export function captureReferral() {
  try {
    const code = new URLSearchParams(window.location.search).get("ref");
    if (code && /^[A-Za-z0-9]{6}$/.test(code)) localStorage.setItem(REF, code.toUpperCase());
  } catch { /* no storage */ }
}
export async function sendReferral() {
  let code: string | null = null; try { code = localStorage.getItem(REF); } catch { return; }
  if (!code) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  const r = await (supabase.rpc as unknown as (fn: string, a: object) => Promise<{ error: unknown }>)("record_referral", { p_code: code });
  if (!r.error) try { localStorage.removeItem(REF); } catch { /* sent again next time; recorded once on the server */ }
}
/** Invite a shop, get a free month (owner, 2026-11-24): the link shows at once, made on this device; online, the server claims the
 *  same code (proposed 0026, falling back to 0025's my_referral_code) and says how many invited shops joined and how many paid.
 *  Only paying shops count, and the number per free month follows the inviter's plan (src/lib/referrals.ts). */
export function ReferralCard() {
  const { tr } = useLanguage();
  const acct = store.get();
  const plan = referralPlan(acct);
  const [code, setCode] = useState(() => deviceReferralCode(acct));
  const [counts, setCounts] = useState<{ joined: number; paid: number } | null>(null);
  useEffect(() => {
    type Res = { data: { code: string; joined: number; paid: number } | null; error: unknown };
    const rpc = supabase.rpc as unknown as (fn: string, args?: object) => Promise<Res>;
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
      if (!data.session) return;
      let r = await rpc("claim_referral_code", { p_code: deviceReferralCode(acct) }).catch(() => null);
      if (!r || r.error || !r.data) r = await rpc("my_referral_code").catch(() => null);
      if (!live || !r || r.error || !r.data) return;
      rememberReferralCode(r.data.code); setCode(r.data.code); setCounts({ joined: r.data.joined, paid: r.data.paid });
    })();
    return () => { live = false; };
  }, []);
  const link = `${window.location.origin}/signup?ref=${code}`;
  const text = `${tr("I run my shop with Zakrio Systems: sales, stock and M-Pesa in one app, even offline. Try it free for 30 days:")} ${link}`;
  const progress = counts ? freeMonths(counts.paid, plan) : null;
  const planName = PLANS.find((p) => p.id === plan)?.name ?? plan;
  return <div className="referral">
    <h3><Gift aria-hidden /> {tr("Invite a shop, get a free month")}</h3>
    <p className="settings-note">{tr("Share your link. Only shops that pay for a plan count, not free trials.")}</p>
    <ul className="referral-rules">
      {(["basic", "growth", "business"] as const).map((p) => <li key={p} className={p === plan ? "is-mine" : undefined}>
        <b>{PLANS.find((x) => x.id === p)?.name ?? p}</b>
        <span>{tr("Every {x} paying shops = 1 free month", String(PAID_INVITES_PER_FREE_MONTH[p]))}</span>
      </li>)}
    </ul>
    <p className="referral-code"><span>{tr("Your code")}</span><b>{code}</b></p>
    <p className="referral-link">{link}</p>
    <div className="connection-actions">
      <a className="tools-btn is-wa" href={waLink(text)} target="_blank" rel="noopener"><MessageCircle aria-hidden /> {tr("Share on WhatsApp")}</a>
      <ShopButton variant="outline" onClick={() => { void navigator.clipboard?.writeText(link).then(() => toast.success(tr("Link copied"))); }}>{tr("Copy link")}</ShopButton>
    </div>
    {progress && counts ? <p className="referral-count">
      {tr("Shops joined")}: <b>{counts.joined}</b> · {tr("Paid")}: <b>{counts.paid}</b> · {tr("Free months earned")}: <b>{progress.earned}</b>
      <small>{tr("{x} more paying shops for your next free month", String(progress.toNext))} ({planName})</small>
    </p> : <p className="referral-count"><small>{tr("Your invited shops are counted here when you are online.")}</small></p>}
  </div>;
}
