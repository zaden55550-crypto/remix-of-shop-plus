// Shop tools screens (owner, 2026-11-23): Credit book, Loyalty, Alerts (Sales app) and Stock Count, Reorder, Shop Prices and Quick
// add by voice (Inventory). Messages open the phone's own WhatsApp or SMS app; a connected provider can send them later instead.
import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Mic, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { Scanner } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { listLocations, MAIN_LOCATION } from "@/lib/locations";
import { paymentLines } from "@/lib/ready-setup";
import { readSettings, saveSettings } from "@/lib/settings-config";
import { store } from "@/lib/shopbook";
import { creditReminder, debtors, loyalty, orderMessage, parseSpokenProduct, pointsOf, redeemPoints, reorderSuggestions, saveLoyalty, theftAlerts, type Reorder } from "@/lib/shop-tools";
import { smsLink, waLink } from "@/lib/whatsapp";
import { readPricePhoto, type PhotoLine } from "@/lib/ai/price-photo.functions";

type Money = (n: number) => string;
const country = () => store.get()?.country;
const business = () => store.get()?.shopName ?? "";
const fail = (tr: (x: string) => string, e: unknown) => toast.error(tr(e instanceof Error ? e.message : "Something went wrong"));

/* ---------- Credit book ---------- */
export function CreditBook({ s, money }: { s: erp.ErpState; money: Money }) {
  const { tr } = useLanguage();
  const list = debtors(s), total = list.reduce((a, c) => a + c.balance, 0);
  return <div className="tools-panel">
    <h3>{tr("Credit book")} <small>{list.length} · {money(total)}</small></h3>
    <p className="settings-note">{tr("Customers who owe you. Send a polite reminder with your ways to pay by WhatsApp or SMS.")}</p>
    {!list.length ? <p className="settings-note">{tr("Nobody owes you right now.")}</p> : <ul className="tools-list">
      {list.map((c) => { const text = creditReminder(c, { business: business(), money, tr, payLines: paymentLines(tr) }); return <li key={c.id}>
        <span><b>{c.name}</b><small>{c.phone ?? tr("No phone")}</small></span><b className="tools-amount">{money(c.balance)}</b>
        <a className="tools-btn is-wa" href={waLink(text, c.phone, country())} target="_blank" rel="noopener">WhatsApp</a>
        <a className="tools-btn is-sms" href={smsLink(text, c.phone)}>SMS</a>
      </li>; })}
    </ul>}
  </div>;
}

/* ---------- Loyalty ---------- */
export function LoyaltyPanel({ s, money }: { s: erp.ErpState; money: Money }) {
  const { tr } = useLanguage();
  const [l, setL] = useState(loyalty());
  const [use, setUse] = useState<Record<string, string>>({});
  const rows = s.customers.map((c) => ({ c, pts: pointsOf(s, c, l) })).filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts);
  return <div className="tools-panel">
    <h3>{tr("Loyalty points")}</h3>
    <div className="tools-row">
      <label className="feature-check"><input type="checkbox" checked={l.on} onChange={(e) => setL({ ...l, on: e.target.checked })} /> {tr("Customers earn points")}</label>
      <label className="inventory-field"><span>{tr("1 point for every")}</span><input className="inventory-input" inputMode="decimal" value={l.earnPer} onChange={(e) => setL({ ...l, earnPer: Number(e.target.value) || 0 })} /></label>
      <label className="inventory-field"><span>{tr("1 point is worth")}</span><input className="inventory-input" inputMode="decimal" value={l.pointValue} onChange={(e) => setL({ ...l, pointValue: Number(e.target.value) || 0 })} /></label>
      <ShopButton onClick={() => { try { saveLoyalty(l); toast.success(tr("Saved")); } catch (e) { fail(tr, e); } }}>{tr("Save")}</ShopButton>
    </div>
    <p className="settings-note">{tr("Points come from each customer's sales; returns take them back. To use points, redeem them here and give that amount as a discount at the till.")}</p>
    {l.on && (rows.length ? <ul className="tools-list">{rows.map(({ c, pts }) => <li key={c.id}>
      <span><b>{c.name}</b><small>{pts} {tr("points")} · {money(pts * l.pointValue)}</small></span>
      <input className="inventory-input tools-small" inputMode="numeric" placeholder={String(pts)} value={use[c.id] ?? ""} onChange={(e) => setUse({ ...use, [c.id]: e.target.value.replace(/\D/g, "") })} />
      <ShopButton variant="outline" onClick={() => { try { const v = redeemPoints(c.id, Number(use[c.id] || pts)); toast.success(`${tr("Give a discount of")} ${money(v)}`); setUse({ ...use, [c.id]: "" }); } catch (e) { fail(tr, e); } }}>{tr("Redeem")}</ShopButton>
    </li>)}</ul> : <p className="settings-note">{tr("No customer has points yet. Points start with the next sale to a named customer.")}</p>)}
  </div>;
}

/* ---------- Theft alerts ---------- */
export function AlertsPanel({ s, money }: { s: erp.ErpState; money: Money }) {
  const { tr } = useLanguage();
  const [pct, setPct] = useState(String(readSettings().alertDiscountPct ?? 20));
  const list = theftAlerts(s, { money, tr, discountPct: Number(pct) || 20 });
  const text = [`${business()} · ${tr("Alerts")}`, ...list.slice(0, 15).map((a) => `- ${new Date(a.at).toLocaleString("en-GB")} · ${a.user}: ${a.text}`)].join("\n");
  return <div className="tools-panel">
    <h3>{tr("Alerts")} <small>{list.length} · {tr("last 7 days")}</small></h3>
    <div className="tools-row">
      <label className="inventory-field"><span>{tr("Alert on discounts of at least (%)")}</span><input className="inventory-input" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value.replace(/\D/g, ""))} onBlur={() => saveSettings({ alertDiscountPct: Number(pct) || 20 })} /></label>
      {list.length > 0 && <a className="tools-btn is-wa" href={waLink(text, store.get()?.phone, country())} target="_blank" rel="noopener">{tr("Send to my WhatsApp")}</a>}
    </div>
    <p className="settings-note">{tr("Big discounts, sales below buying price, returns and short cash-ups, with who did them.")}</p>
    {list.length ? <ul className="tools-list">{list.map((a) => <li key={a.id} className={`is-${a.kind}`}><span><b>{a.text}</b><small>{new Date(a.at).toLocaleString("en-GB")} · {a.user}</small></span></li>)}</ul> : <p className="settings-note">{tr("Nothing to look at. Well done.")}</p>}
  </div>;
}

/* ---------- Stock count by phone ---------- */
export function StockCount({ s }: { s: erp.ErpState }) {
  const { tr } = useLanguage();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const [q, setQ] = useState(""), [scan, setScan] = useState(false);
  const found = q.trim() ? erp.searchProducts(s, q).slice(0, 6) : [];
  const addCode = (code: string) => { const p = erp.findByCode(s, code); setScan(false); if (!p) { toast.error(tr("Barcode not found")); return; } setCounted((c) => ({ ...c, [p.id]: String((Number(c[p.id]) || 0) + 1) })); toast.success(p.name); };
  const lines = Object.entries(counted).map(([id, v]) => ({ p: s.products.find((x) => x.id === id)!, n: Number(v) })).filter((x) => x.p);
  const apply = () => { try { erp.runErpTransaction(() => { for (const l of lines) if (Number.isFinite(l.n) && l.n !== l.p.qty) erp.adjustStock(l.p.id, l.n, "Stock count"); }); toast.success(tr("Stock updated from the count")); setCounted({}); } catch (e) { fail(tr, e); } };
  return <div className="tools-panel">
    <h3>{tr("Stock count")}</h3>
    <p className="settings-note">{tr("Walk the shelves: scan each item (each scan adds one) or search and type the number counted. Apply records the differences as adjustments.")}</p>
    <div className="tools-row">
      <ShopButton onClick={() => setScan(true)}><ScanLine aria-hidden /> {tr("Scan")}</ShopButton>
      <input className="inventory-input" placeholder={tr("Search products")} value={q} onChange={(e) => setQ(e.target.value)} />
    </div>
    {found.length > 0 && <ul className="tools-list">{found.map((p) => <li key={p.id}><span><b>{p.name}</b><small>{tr("On record")}: {p.qty}</small></span><ShopButton variant="outline" onClick={() => { setCounted({ ...counted, [p.id]: counted[p.id] ?? "" }); setQ(""); }}>{tr("Count")}</ShopButton></li>)}</ul>}
    {lines.length > 0 && <><ul className="tools-list">{lines.map(({ p }) => <li key={p.id}>
      <span><b>{p.name}</b><small>{tr("On record")}: {p.qty}</small></span>
      <input className="inventory-input tools-small" inputMode="decimal" aria-label={`${tr("Counted")} · ${p.name}`} value={counted[p.id] ?? ""} onChange={(e) => setCounted({ ...counted, [p.id]: e.target.value })} />
      <b className={Number(counted[p.id]) === p.qty ? "tools-ok" : "tools-diff"}>{counted[p.id] === "" ? "" : `${Number(counted[p.id]) - p.qty >= 0 ? "+" : ""}${Math.round((Number(counted[p.id]) - p.qty) * 1000) / 1000}`}</b>
    </li>)}</ul><ShopButton onClick={apply}>{tr("Apply count")}</ShopButton></>}
    {scan && <Scanner onCode={addCode} onClose={() => setScan(false)} tr={tr} />}
  </div>;
}

/* ---------- Reorder suggestions ---------- */
export function ReorderPanel({ s }: { s: erp.ErpState }) {
  const { tr } = useLanguage();
  const list = reorderSuggestions(s);
  const bySupplier = useMemo(() => { const m = new Map<string, Reorder[]>(); for (const l of list) m.set(l.supplier ?? "", [...(m.get(l.supplier ?? "") ?? []), l]); return [...m]; }, [list]);
  return <div className="tools-panel">
    <h3>{tr("Reorder suggestions")}</h3>
    <p className="settings-note">{tr("From the last 4 weeks of sales: what runs out first and how many to order for 2 weeks.")}</p>
    {!list.length ? <p className="settings-note">{tr("Nothing needs ordering yet.")}</p> : bySupplier.map(([sup, lines]) => { const phone = s.suppliers.find((x) => x.name === sup)?.phone; return <section key={sup || "none"} className="tools-group">
      <h4>{sup || tr("No supplier yet")}{sup && <a className="tools-btn is-wa" href={waLink(orderMessage(lines, business(), tr), phone, country())} target="_blank" rel="noopener">{tr("Send order by WhatsApp")}</a>}</h4>
      <ul className="tools-list">{lines.map((l) => <li key={l.product.id}><span><b>{l.product.name}</b><small>{l.left} {tr("left")} · {l.perDay}/{tr("day")} · {l.daysLeft} {tr("days")}</small></span><b className="tools-amount">{tr("Order")} {l.order}</b></li>)}</ul>
    </section>; })}
  </div>;
}

/* ---------- Price per shop ---------- */
export function ShopPrices({ s, money }: { s: erp.ErpState; money: Money }) {
  const { tr } = useLanguage();
  const shops = listLocations(s).filter((l) => l.type === "shop" && l.active !== false);
  const [q, setQ] = useState(""), [pid, setPid] = useState(""), [price, setPrice] = useState(""), [pick, setPick] = useState<string[]>([]);
  const p = s.products.find((x) => x.id === pid);
  const found = !p && q.trim() ? erp.searchProducts(s, q).slice(0, 6) : [];
  useEffect(() => { setPick(shops.map((x) => x.id)); }, [pid]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = () => {
    if (!p) return;
    const v = Number(price);
    if (!(v >= 0)) { toast.error(tr("Enter the new price")); return; }
    try {
      erp.runErpTransaction(() => { for (const id of pick) { if (id === MAIN_LOCATION) erp.updateProduct(p.id, { sell: v }); else erp.setShopPrice(p.id, id, v); } });
      toast.success(`${p.name}: ${money(v)} · ${pick.length} ${tr(pick.length === 1 ? "shop" : "shops")}`); setPrice("");
    } catch (e) { fail(tr, e); }
  };
  return <div className="tools-panel">
    <h3>{tr("Shop prices")}</h3>
    <p className="settings-note">{tr("Change a price and choose which shops it applies to. Shops you leave out keep their own price.")}</p>
    {!p ? <><input className="inventory-input" placeholder={tr("Search products")} value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="tools-list">{found.map((x) => <li key={x.id}><span><b>{x.name}</b><small>{money(x.sell)}</small></span><ShopButton variant="outline" onClick={() => setPid(x.id)}>{tr("Choose")}</ShopButton></li>)}</ul></>
    : <>
      <div className="tools-row"><b>{p.name}</b><button type="button" className="bsetup-link-btn" onClick={() => { setPid(""); setQ(""); }}>{tr("Change product")}</button></div>
      <ul className="tools-list">{shops.map((l) => <li key={l.id}><label className="feature-check"><input type="checkbox" checked={pick.includes(l.id)} onChange={(e) => setPick(e.target.checked ? [...pick, l.id] : pick.filter((x) => x !== l.id))} /> {l.name}</label><small>{tr("Now")}: {money(erp.shopPrice(p, l.id))}</small></li>)}</ul>
      <div className="tools-row"><input className="inventory-input" inputMode="decimal" placeholder={tr("New price")} value={price} onChange={(e) => setPrice(e.target.value)} /><ShopButton disabled={!pick.length} onClick={save}>{tr("Update chosen shops")}</ShopButton></div>
    </>}
  </div>;
}

/* ---------- Quick add by voice ---------- */
type Rec = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onerror: () => void; onend: () => void; start: () => void; stop: () => void };
export function VoiceAdd() {
  const { tr } = useLanguage();
  const [f, setF] = useState({ name: "", sell: "", qty: "" });
  const [listening, setListening] = useState(false);
  const rec = useRef<Rec | null>(null);
  const Speech = typeof window !== "undefined" ? ((window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Rec }).webkitSpeechRecognition) : undefined;
  const listen = () => {
    if (!Speech) { toast.error(tr("This browser can't listen. Use Chrome on Android or a computer.")); return; }
    const r = new Speech(); rec.current = r; r.lang = "en-KE"; r.interimResults = false;
    r.onresult = (e) => { const got = parseSpokenProduct(e.results[0]?.[0]?.transcript ?? ""); setF({ name: got.name, sell: got.sell ? String(got.sell) : "", qty: got.qty ? String(got.qty) : "" }); };
    r.onerror = () => { setListening(false); toast.error(tr("Didn't catch that. Try again.")); };
    r.onend = () => setListening(false);
    setListening(true); r.start();
  };
  const add = () => {
    try {
      if (!f.name.trim()) throw new erp.ErpError("Enter the product name");
      if (!(Number(f.sell) > 0)) throw new erp.ErpError("Enter the selling price");
      erp.addProduct({ name: f.name.trim(), sell: Number(f.sell), buy: 0, qty: Number(f.qty) || 0, unit: "pcs" });
      toast.success(`${tr("Added")}: ${f.name}`); setF({ name: "", sell: "", qty: "" });
    } catch (e) { fail(tr, e); }
  };
  return <div className="tools-panel">
    <h3>{tr("Quick add by voice")}</h3>
    <p className="settings-note">{tr("Tap the microphone and say the product, price and quantity, for example: “Sugar 1 kilo 180 shillings 20 pieces”. Check it, then Add.")}</p>
    <ShopButton onClick={listen} disabled={listening}><Mic aria-hidden /> {tr(listening ? "Listening…" : "Speak")}</ShopButton>
    <div className="tools-row">
      <label className="inventory-field"><span>{tr("Product name")}</span><input className="inventory-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="inventory-field"><span>{tr("Selling price")}</span><input className="inventory-input" inputMode="decimal" value={f.sell} onChange={(e) => setF({ ...f, sell: e.target.value })} /></label>
      <label className="inventory-field"><span>{tr("Quantity")}</span><input className="inventory-input" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
      <ShopButton onClick={add}>{tr("Add")}</ShopButton>
    </div>
    <PhotoAdd />
  </div>;
}

/** Shrinks a photo to at most 1600px so it uploads quickly, as a JPEG data URL. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85);
  } finally { URL.revokeObjectURL(url); }
}

/** Photo of a price list: the AI reads the lines; the owner checks them and adds the ones they want (normal addProduct). */
function PhotoAdd() {
  const { tr } = useLanguage();
  const [lines, setLines] = useState<(PhotoLine & { pick: boolean })[]>([]), [busy, setBusy] = useState(false);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { const r = await readPricePhoto({ data: { image: await shrink(file) } }); setLines(r.lines.map((l) => ({ ...l, pick: !!l.sell }))); if (!r.lines.length) toast(tr("No products found in the photo")); }
    catch (e) { fail(tr, e instanceof Error && /sign|auth|401/i.test(e.message) ? new Error("Sign in online to read photos") : e); } finally { setBusy(false); }
  };
  const addAll = () => {
    let n = 0;
    for (const l of lines.filter((x) => x.pick)) {
      try { erp.addProduct({ name: l.name, sell: l.sell ?? 0, buy: 0, qty: l.qty ?? 0, unit: l.unit || "pcs" }); n++; } catch (e) { fail(tr, e); }
    }
    if (n) toast.success(`${tr("Added")}: ${n}`); setLines(lines.filter((x) => !x.pick));
  };
  const set = (i: number, p: Partial<PhotoLine & { pick: boolean }>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return <>
    <h3>{tr("Quick add from a photo")}</h3>
    <p className="settings-note">{tr("Take a photo of a price list, shelf labels or a supplier invoice. Check each line, then Add the ticked ones. Nothing is saved until you tap Add.")}</p>
    <label className={"shop-button tools-photo" + (busy ? " is-busy" : "")}><Camera aria-hidden /> {tr(busy ? "Reading the photo…" : "Take or choose a photo")}
      <input type="file" accept="image/*" capture="environment" hidden disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} /></label>
    {lines.length > 0 && <>
      <table className="tools-table"><thead><tr><th /><th>{tr("Product name")}</th><th>{tr("Selling price")}</th><th>{tr("Quantity")}</th><th>{tr("Unit")}</th></tr></thead>
        <tbody>{lines.map((l, i) => <tr key={i}>
          <td><input type="checkbox" checked={l.pick} onChange={(e) => set(i, { pick: e.target.checked })} aria-label={tr("Add")} /></td>
          <td><input className="inventory-input" value={l.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
          <td><input className="inventory-input" inputMode="decimal" value={l.sell ?? ""} onChange={(e) => set(i, { sell: Number(e.target.value) || null })} /></td>
          <td><input className="inventory-input" inputMode="decimal" value={l.qty ?? ""} onChange={(e) => set(i, { qty: Number(e.target.value) || null })} /></td>
          <td><input className="inventory-input" value={l.unit ?? ""} onChange={(e) => set(i, { unit: e.target.value || null })} /></td>
        </tr>)}</tbody></table>
      <ShopButton onClick={addAll} disabled={!lines.some((l) => l.pick)}>{tr("Add ticked products")}</ShopButton>
    </>}
  </>;
}
