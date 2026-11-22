// Screens for Trade features 5-8: Sales › Lay-bys and Quotations, Inventory › Breakdown and Prescriptions, and the cart's extra
// actions (Put on lay-by, Save as quotation, the prescription form). The rules live in layby.ts, quotations.ts, breakdown.ts and
// prescriptions.ts; every action goes through the ERP engine.
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { SearchPicker } from "@/components/shopbook/search-picker";
import { sharePdfTable, sharePdfText } from "@/components/shopbook/print";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { translateCurrent } from "@/lib/interface-translations";
import { cancelLayby, collectLayby, laybyBalance, laybyDepositsHeld, laybyFeePercent, payLayby, setLaybyFeePercent, startLayby } from "@/lib/layby";
import { cancelQuotation, convertQuotation, createQuotation, QUOTE_DAYS, quoteExpired, quotationText } from "@/lib/quotations";
import { breakDown, previewBreakdown, type BreakdownOutput } from "@/lib/breakdown";
import { checkRx, controlledRegister, type RxDetails } from "@/lib/prescriptions";
import { readProductImage } from "@/lib/product-export";
import { cn } from "@/lib/utils";

type Money = (n: number) => string;
const attempt = <T,>(fn: () => T): T | undefined => {
  try { return fn(); } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Something went wrong")); return undefined; }
};
const day = (t: number) => new Date(t).toLocaleDateString("en-GB");
const custName = (s: erp.ErpState, id?: string) => (id ? s.customers.find((c) => c.id === id)?.name : undefined);

function MethodSelect({ s, value, onChange, credit }: { s: erp.ErpState; value: string; onChange: (m: erp.Method) => void; credit?: boolean }) {
  const { tr } = useLanguage();
  return <select className="inventory-input" value={value} onChange={(e) => onChange(e.target.value as erp.Method)}>
    {erp.moneyMethods(s).map((m) => <option key={m} value={m}>{erp.methodLabel(m, s, tr)}</option>)}
    {credit && <option value="credit">{tr("On credit")}</option>}
  </select>;
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <div className="gas-form" role="group" aria-label={title}><h4>{title}</h4>{children}</div>;
}
const Status = ({ tone, children }: { tone: "ok" | "warn" | "bad" | "muted"; children: ReactNode }) => <span className={cn("doc-status", `is-${tone}`)}>{children}</span>;

/* ---------- Cart extras (POS and Sales share the cart) ---------- */

/** Under the cart: Put on lay-by and Save as quotation. Both empty the cart when they succeed. */
export function CartDocActions({ s, cart, customerId, money, layby, quotes, onSaved }: { s: erp.ErpState; cart: erp.CartLine[]; customerId: string; money: Money; layby: boolean; quotes: boolean; onSaved: () => void }) {
  const { tr } = useLanguage();
  const [open, setOpen] = useState<null | "layby">(null);
  const [deposit, setDeposit] = useState("");
  const [method, setMethod] = useState<erp.Method>(erp.defaultMethod(s));
  const [due, setDue] = useState("");
  const total = erp.lineTotal(s, cart);
  if (!layby && !quotes) return null;
  const saveQuote = () => { const q = attempt(() => createQuotation({ cart, customerId: customerId || undefined })); if (q) { toast.success(`${tr("Quotation saved")} · ${q.ref}`); onSaved(); } };
  const saveLayby = () => {
    if (!customerId) { toast.error(tr("A lay-by needs a registered customer")); return; }
    const l = attempt(() => startLayby({ customerId, cart, deposit: Number(deposit), method: method as erp.MoneyMethod, dueAt: due ? new Date(due).getTime() : undefined }));
    if (l) { toast.success(`${tr("Lay-by started")} · ${l.ref} · ${tr("Balance")} ${money(laybyBalance(l))}`); onSaved(); }
  };
  return <div className="cart-doc-actions">
    <div className="cart-doc-buttons">
      {layby && <button type="button" disabled={!cart.length} onClick={() => setOpen(open ? null : "layby")}>{tr("Put on lay-by")}</button>}
      {quotes && <button type="button" disabled={!cart.length} onClick={saveQuote}>{tr("Save as quotation")}</button>}
    </div>
    {open === "layby" && <Panel title={`${tr("Put on lay-by")} · ${money(total)}`}>
      {!customerId && <p className="cart-serial-need">{tr("Choose the customer above first")}</p>}
      <div className="gas-form-grid">
        <label><span>{tr("Deposit now")}</span><input className="inventory-input" type="number" min="0" step="any" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></label>
        <label><span>{tr("Paid by")}</span><MethodSelect s={s} value={method} onChange={setMethod} /></label>
        <label><span>{tr("Collect by (optional)")}</span><input className="inventory-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
      </div>
      <p className="weight-pad-result">{Number(deposit) > 0 ? `${tr("Balance")} ${money(Math.max(0, total - Number(deposit)))} · ${tr("the goods are kept aside until collected")}` : tr("Enter the deposit the customer pays now")}</p>
      <div className="gas-form-foot"><ShopButton variant="outline" onClick={() => setOpen(null)}>{tr("Cancel")}</ShopButton><ShopButton disabled={!customerId || !(Number(deposit) > 0)} onClick={saveLayby}>{tr("Start lay-by")}</ShopButton></div>
    </Panel>}
  </div>;
}

/** The prescription form, shown in the cart when it has prescription-only or controlled products. */
export function RxForm({ products, value, onChange }: { products: erp.Product[]; value: RxDetails; onChange: (v: RxDetails) => void }) {
  const { tr } = useLanguage();
  const set = (k: keyof RxDetails) => (e: { target: { value: string } }) => onChange({ ...value, [k]: e.target.value });
  const problem = checkRx(value);
  return <div className={cn("rx-form", problem && "is-missing")}>
    <p className="rx-form-head"><b>{tr("Prescription needed")}</b> · {products.map((p) => `${p.name}${p.rx === "controlled" ? ` (${tr("controlled")})` : ""}`).join(", ")}</p>
    <div className="gas-form-grid">
      <label><span>{tr("Patient")} *</span><input className="inventory-input" value={value.patient} onChange={set("patient")} /></label>
      <label><span>{tr("Prescriber (doctor or clinic)")} *</span><input className="inventory-input" value={value.prescriber} onChange={set("prescriber")} /></label>
      <label><span>{tr("Prescription number")}</span><input className="inventory-input" value={value.number ?? ""} onChange={set("number")} /></label>
      <label><span>{tr("Photo (optional)")}</span><input type="file" accept="image/*" className="inventory-input" onChange={async (e) => {
        const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
        const img = await readProductImage(f).catch(() => null); if (img) onChange({ ...value, photo: img }); else toast.error(tr("The prescription photo is too large"));
      }} />{value.photo && <img src={value.photo} alt="" className="rx-photo" />}</label>
    </div>
    {problem && <p className="cart-serial-need" role="status">{tr(problem)}</p>}
  </div>;
}

/* ---------- Sales › Lay-bys ---------- */

export function LaybysPage({ s, money }: { s: erp.ErpState; money: Money }) {
  const { tr } = useLanguage();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [act, setAct] = useState<null | { k: "pay" | "cancel"; id: string }>(null);
  const [amount, setAmount] = useState(""), [method, setMethod] = useState<erp.Method>(erp.defaultMethod(s));
  const [fee, setFee] = useState(String(laybyFeePercent()));
  const rows = s.laybys.filter((l) => filter === "all" || l.status === "open");
  return <div className="gas-page">
    <div className="gas-toolbar">
      <p className="gas-held">{tr("Lay-by deposits held")}: <b>{money(laybyDepositsHeld(s))}</b></p>
      <div className="doc-filter">{(["open", "all"] as const).map((f) => <button key={f} type="button" className={cn(filter === f && "is-on")} onClick={() => setFilter(f)}>{tr(f === "open" ? "Open" : "All")}</button>)}</div>
      <label className="doc-fee"><span>{tr("Cancellation fee %")}</span><input className="inventory-input" type="number" min="0" max="100" step="any" value={fee} onChange={(e) => setFee(e.target.value)}
        onBlur={() => { if (attempt(() => setLaybyFeePercent(Number(fee))) === undefined) setFee(String(laybyFeePercent())); }} /></label>
    </div>
    {rows.length === 0 ? <p className="settings-note">{tr("No lay-bys yet. Start one from the cart: add the goods, choose the customer and tap Put on lay-by.")}</p>
      : <div className="doc-list">{rows.map((l) => {
        const bal = laybyBalance(l);
        return <div key={l.id} className="doc-row">
          <div className="doc-main"><b>{l.ref}</b> · {custName(s, l.customerId) ?? "—"} · {day(l.at)}{l.dueAt ? ` · ${tr("collect by")} ${day(l.dueAt)}` : ""}
            <small>{l.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</small></div>
          <div className="doc-money"><span>{tr("Total")} {money(l.total)}</span><span>{tr("Paid")} {money(l.paid)}</span><b>{tr("Balance")} {money(bal)}</b></div>
          <div className="gas-actions">
            {l.status === "open" ? <>
              {bal > 0 && <button type="button" onClick={() => { setAct({ k: "pay", id: l.id }); setAmount(String(bal)); }}>{tr("Add payment")}</button>}
              <button type="button" disabled={bal > 0} title={bal > 0 ? tr("Collect when fully paid") : undefined} onClick={() => { const sale = attempt(() => collectLayby(l.id)); if (sale) toast.success(`${tr("Collected")} · ${sale.ref}`); }}>{tr("Collect")}</button>
              <button type="button" className="is-danger" onClick={() => setAct({ k: "cancel", id: l.id })}>{tr("Cancel lay-by")}</button>
            </> : <Status tone={l.status === "collected" ? "ok" : "muted"}>{tr(l.status === "collected" ? "Collected" : "Cancelled")}{l.saleRef ? ` · ${l.saleRef}` : ""}{l.status === "cancelled" ? ` · ${tr("refunded")} ${money(l.refunded ?? 0)}` : ""}</Status>}
          </div>
          {act?.id === l.id && <Panel title={tr(act.k === "pay" ? "Add payment" : "Cancel lay-by")}>
            {act.k === "cancel" && <p className="settings-note">{tr("The goods go back to stock. The customer gets back what they paid minus the cancellation fee")} ({fee || 0}% = {money(Math.round(l.paid * (Number(fee) || 0)) / 100)}).</p>}
            <div className="gas-form-grid">
              {act.k === "pay" && <label><span>{tr("Amount")}</span><input className="inventory-input" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>}
              <label><span>{tr(act.k === "pay" ? "Paid by" : "Pay back from")}</span><MethodSelect s={s} value={method} onChange={setMethod} /></label>
            </div>
            <div className="gas-form-foot"><ShopButton variant="outline" onClick={() => setAct(null)}>{tr("Close")}</ShopButton>
              <ShopButton onClick={() => {
                const ok = act.k === "pay" ? attempt(() => payLayby(l.id, Number(amount), method as erp.MoneyMethod)) : attempt(() => cancelLayby(l.id, method as erp.MoneyMethod, Number(fee) || 0));
                if (ok) { toast.success(tr(act.k === "pay" ? "Payment recorded" : "Lay-by cancelled")); setAct(null); }
              }}>{tr(act.k === "pay" ? "Record payment" : "Cancel and refund")}</ShopButton></div>
          </Panel>}
        </div>;
      })}</div>}
  </div>;
}

/* ---------- Sales › Quotations ---------- */

export function QuotationsPage({ s, money, shop, phone }: { s: erp.ErpState; money: Money; shop: string; phone?: string | undefined }) {
  const { tr } = useLanguage();
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [converting, setConverting] = useState<string | null>(null);
  const [method, setMethod] = useState<erp.Method>(erp.defaultMethod(s));
  const rows = s.quotations.filter((q) => filter === "all" || q.status === "open");
  const share = (q: erp.Quotation) => {
    const text = quotationText(s, q, shop, money, tr, phone);
    const cust = q.customerId ? s.customers.find((c) => c.id === q.customerId) : undefined;
    const to = cust?.phone?.replace(/\D/g, "").replace(/^0/, "254");
    window.open(`https://wa.me/${to ?? ""}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  return <div className="gas-page">
    <div className="gas-toolbar">
      <p className="gas-held">{tr("Quotations are valid for")} <b>{QUOTE_DAYS}</b> {tr("days")}</p>
      <div className="doc-filter">{(["open", "all"] as const).map((f) => <button key={f} type="button" className={cn(filter === f && "is-on")} onClick={() => setFilter(f)}>{tr(f === "open" ? "Open" : "All")}</button>)}</div>
    </div>
    {rows.length === 0 ? <p className="settings-note">{tr("No quotations yet. Build one in the cart and tap Save as quotation.")}</p>
      : <div className="doc-list">{rows.map((q) => {
        const expired = quoteExpired(q);
        return <div key={q.id} className="doc-row">
          <div className="doc-main"><b>{q.ref}</b> · {custName(s, q.customerId) ?? q.customerName ?? tr("No Customer")} · {day(q.at)}
            <small>{q.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</small></div>
          <div className="doc-money"><b>{money(q.total)}</b><span>{tr("Valid until")} {day(q.validUntil)}</span></div>
          <div className="gas-actions">
            {q.status === "open" ? <>
              {expired && <Status tone="warn">{tr("Expired")}</Status>}
              <button type="button" onClick={() => share(q)}>WhatsApp</button>
              <button type="button" onClick={() => void sharePdfText(`${tr("Quotation")} ${q.ref}`, quotationText(s, q, shop, money, tr, phone))}>PDF</button>
              <button type="button" onClick={() => setConverting(q.id)}>{tr("Convert to sale")}</button>
              <button type="button" className="is-danger" onClick={() => { if (window.confirm(`${tr("Cancel")} ${q.ref}?`) && attempt(() => cancelQuotation(q.id)) !== undefined) toast.success(tr("Quotation cancelled")); }}>{tr("Cancel")}</button>
            </> : <Status tone={q.status === "converted" ? "ok" : "muted"}>{tr(q.status === "converted" ? "Converted" : "Cancelled")}{q.saleRef ? ` · ${q.saleRef}` : ""}</Status>}
          </div>
          {converting === q.id && <Panel title={`${tr("Convert to sale")} · ${money(q.total)}`}>
            <p className="settings-note">{tr("The sale uses the quoted prices. Stock is checked now.")}</p>
            <div className="gas-form-grid"><label><span>{tr("Paid by")}</span><MethodSelect s={s} value={method} onChange={setMethod} credit={!!q.customerId} /></label></div>
            <div className="gas-form-foot"><ShopButton variant="outline" onClick={() => setConverting(null)}>{tr("Close")}</ShopButton>
              <ShopButton onClick={() => { const sale = attempt(() => convertQuotation(q.id, { method })); if (sale) { toast.success(`${tr("Sale completed")} · ${sale.ref}`); setConverting(null); } }}>{tr("Complete Sale")}</ShopButton></div>
          </Panel>}
        </div>;
      })}</div>}
  </div>;
}

/* ---------- Inventory › Breakdown ---------- */

export function BreakdownPage({ s, money }: { s: erp.ErpState; money: Money }) {
  const { tr } = useLanguage();
  const live = s.products.filter((p) => !p.archived && !p.gas);
  const [source, setSource] = useState("");
  const [qty, setQty] = useState("1");
  const [outs, setOuts] = useState<{ productId: string; qty: string }[]>([{ productId: "", qty: "" }]);
  const [waste, setWaste] = useState("");
  const src = live.find((p) => p.id === source);
  const outputs: BreakdownOutput[] = outs.filter((o) => o.productId && Number(o.qty) > 0).map((o) => ({ productId: o.productId, qty: Number(o.qty) }));
  const preview = useMemo(() => { try { return src && Number(qty) > 0 && outputs.length ? previewBreakdown(s, src.id, Number(qty), outputs) : null; } catch { return null; } }, [s, src, qty, outputs]);
  const pick = (id: string) => live.map((p) => ({ id: p.id, label: `${p.name} (${p.qty} ${p.unit || "pcs"})` })).filter((x) => x.id !== source || x.id === id);
  const save = () => {
    const r = attempt(() => breakDown(source, Number(qty), outputs, waste));
    if (r) { toast.success(`${r.ref} · ${tr("Breakdown saved")}`); setOuts([{ productId: "", qty: "" }]); setWaste(""); setQty("1"); }
  };
  return <div className="gas-page">
    <p className="settings-note">{tr("Open a bale, carcass or sack into what it gave. Its cost is shared by selling value, so each piece, cut or kilo gets its true cost.")}</p>
    <div className="gas-form-grid">
      <label><span>{tr("Opening")}</span><SearchPicker tr={tr} items={pick(source)} value={source} onChange={setSource} placeholder={tr("Choose the bale, carcass or sack")} addLabel="" /></label>
      <label><span>{tr("How many")} {src ? `(${tr("in stock")}: ${src.qty} · ${tr("cost")} ${money(src.buy)})` : ""}</span><input className="inventory-input" type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      <label><span>{tr("Waste (optional)")}</span><input className="inventory-input" placeholder={tr("e.g. 4 kg bones")} value={waste} onChange={(e) => setWaste(e.target.value)} /></label>
    </div>
    <h4 className="feature-group-name">{tr("What it gave")}</h4>
    {outs.map((o, i) => <div key={i} className="breakdown-out">
      <SearchPicker tr={tr} items={pick(o.productId).filter((x) => x.id !== source)} value={o.productId} onChange={(id) => setOuts(outs.map((x, j) => (j === i ? { ...x, productId: id } : x)))} placeholder={tr("Choose a product")} addLabel="" />
      <input className="inventory-input" type="number" min="0" step="any" placeholder={tr("Quantity")} value={o.qty} onChange={(e) => setOuts(outs.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
      <button type="button" className="is-danger" aria-label={tr("Remove")} onClick={() => setOuts(outs.length > 1 ? outs.filter((_, j) => j !== i) : [{ productId: "", qty: "" }])}>×</button>
    </div>)}
    <div className="gas-actions breakdown-add"><button type="button" onClick={() => setOuts([...outs, { productId: "", qty: "" }])}>+ {tr("Add a line")}</button></div>
    {preview && <div className="doc-list">
      <p className="gas-held">{tr("Cost being shared")}: <b>{money(preview.cost)}</b></p>
      {preview.lines.map((l) => <div key={l.productId} className="doc-row"><div className="doc-main"><b>{l.name}</b> · {l.qty}</div>
        <div className="doc-money"><span>{tr("Cost each")} {money(l.unitCost)}</span><span>{tr("New buying price")} {money(l.newBuy)}</span><span>{Math.round(l.share * 100)}%</span></div></div>)}
    </div>}
    <div className="gas-form-foot"><ShopButton disabled={!preview} onClick={save}>{tr("Save breakdown")}</ShopButton></div>
  </div>;
}

/* ---------- Inventory › Prescriptions ---------- */

export function PrescriptionsPage({ s }: { s: erp.ErpState }) {
  const { tr } = useLanguage();
  const [tab, setTab] = useState<"register" | "all">("register");
  const reg = controlledRegister(s);
  const head = [tr("Date"), tr("Sale"), tr("Product"), tr("Qty"), tr("Patient"), tr("Prescriber"), tr("Prescription number"), tr("Served by")];
  const print = () => void sharePdfTable(tr("Controlled drugs register"), new Date().toLocaleDateString("en-GB"), head, reg.map((r) => [day(r.at), r.saleRef, r.product, String(r.qty), r.patient, r.prescriber, r.number ?? "", r.user]));
  return <div className="gas-page">
    <div className="gas-toolbar">
      <div className="doc-filter">{(["register", "all"] as const).map((t) => <button key={t} type="button" className={cn(tab === t && "is-on")} onClick={() => setTab(t)}>{tr(t === "register" ? "Controlled drugs register" : "All prescriptions")}</button>)}</div>
      {tab === "register" && <ShopButton disabled={!reg.length} onClick={print}>{tr("Print register")}</ShopButton>}
    </div>
    <p className="settings-note">{tr("Mark products as prescription-only or controlled in Inventory › Edit Product. The till then asks for the prescription before the sale.")}</p>
    {tab === "register" ? (reg.length ? <div className="doc-list">{reg.map((r, i) => <div key={i} className="doc-row">
        <div className="doc-main"><b>{r.product}</b> × {r.qty} · {day(r.at)} · {r.saleRef}<small>{r.patient} · {r.prescriber}{r.number ? ` · ${r.number}` : ""}</small></div></div>)}</div>
      : <p className="settings-note">{tr("No controlled drugs sold yet.")}</p>)
      : (s.prescriptions.length ? <div className="doc-list">{s.prescriptions.map((r) => <div key={r.id} className="doc-row">
        <div className="doc-main"><b>{r.saleRef}</b> · {day(r.at)} · {r.patient}<small>{r.prescriber}{r.number ? ` · ${r.number}` : ""} · {r.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</small></div>
        {r.photo && <img src={r.photo} alt="" className="rx-photo" />}</div>)}</div>
      : <p className="settings-note">{tr("No prescriptions yet.")}</p>)}
  </div>;
}
