// A product's serials (Serial / IMEI numbers & warranty), on Edit Product: switch tracking on, set the warranty months, add
// serials (typed or pasted, one per line), and see each one in stock or sold (sale, customer, warranty end). Changes save at
// once through the ERP engine, apart from the product form's own Save. Sold serials stay on record.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { addSerials, findSerial, parseSerials, removeSerial, serialsInStock } from "@/lib/serials";
import { translateCurrent } from "@/lib/interface-translations";
import { cn } from "@/lib/utils";

const attempt = <T,>(fn: () => T, ok?: string): T | undefined => {
  try { const out = fn(); if (ok) toast.success(ok); return out; }
  catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Something went wrong")); return undefined; }
};
const day = (at: number) => new Date(at).toLocaleDateString("en-GB");

export function SerialManager({ s, productId }: { s: erp.ErpState; productId: string }) {
  const { tr } = useLanguage();
  const p = s.products.find((x) => x.id === productId);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [months, setMonths] = useState(() => (p?.warrantyMonths ? String(p.warrantyMonths) : ""));
  if (!p) return null;
  const all = p.serials ?? [], inStock = serialsInStock(p).length, sold = all.length - inStock;
  const stockWhole = Math.round(p.qty);
  const shown = q.trim() ? all.filter((u) => erp.serialKey(u.code).includes(erp.serialKey(q))) : all;

  const track = (on: boolean) => attempt(() => erp.updateProduct(p.id, { serialTracked: on || undefined }), tr(on ? "Serial / IMEI tracking switched on" : "Serial / IMEI tracking switched off"));
  const saveMonths = () => {
    const v = months.trim();
    if (v && !(Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 120)) { toast.error(tr("Warranty months must be a whole number from 0 to 120")); return; }
    const next = v ? Number(v) || undefined : undefined;
    if (next !== p.warrantyMonths) attempt(() => erp.updateProduct(p.id, { warrantyMonths: next }), tr("Warranty saved"));
  };
  const add = () => {
    const codes = parseSerials(text);
    const r = attempt(() => addSerials(p.id, codes));
    if (!r) return;
    setText("");
    toast.success(`${r.added.length} ${tr("added")}${r.skipped.length ? ` · ${r.skipped.length} ${tr("already recorded, skipped")}` : ""}`);
  };

  return <section className="serial-manager" aria-label={tr("Serial / IMEI numbers")}>
    <div className="serial-manager-head">
      <label className="serial-track"><input type="checkbox" checked={!!p.serialTracked} onChange={(e) => track(e.target.checked)} />
        <span><b>{tr("Track serial / IMEI numbers")}</b><small>{tr("Each unit sold must be given one of its serials; each serial can be sold once.")}</small></span></label>
      {p.serialTracked && <label className="serial-warranty"><span>{tr("Warranty (months)")}</span>
        <input type="number" min="0" max="120" step="1" className="inventory-input" placeholder="12" value={months} onChange={(e) => setMonths(e.target.value)} onBlur={saveMonths} /></label>}
    </div>
    {p.serialTracked && <>
      <p className="serial-counts"><b>{tr("In stock")}</b> {inStock} · <b>{tr("Sold")}</b> {sold}</p>
      {inStock !== stockWhole && <p className="serial-mismatch" role="status">{tr("Stock shows")} {stockWhole}, {tr("serials in stock")} {inStock}. {tr(inStock < stockWhole ? "Add the missing serials so every unit can be sold." : "Some serials have no stock: check Stock In or remove the extra serials.")}</p>}
      <div className="serial-add">
        <textarea className="inventory-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={tr("Add serials / IMEIs: one per line, or paste a column from a spreadsheet")} aria-label={tr("Add serials / IMEIs")} />
        <button type="button" className="serial-add-btn" disabled={!parseSerials(text).length} onClick={add}>{tr("Add")} {parseSerials(text).length || ""}</button>
      </div>
      {all.length > 0 && <>
        <input className="inventory-input serial-search" placeholder={tr("Find a serial / IMEI")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={tr("Find a serial / IMEI")} />
        <ul className="serial-rows">
          {shown.slice(0, 200).map((u) => {
            const f = u.sold ? findSerial(s, u.code) : undefined;
            return <li key={u.code} className={cn(u.sold && "is-sold")}>
              <span className="serial-code">{u.code}</span>
              {u.sold
                ? <span className="serial-status">{tr("Sold")} · {u.sold.ref} · {day(u.sold.at)}{f?.customer ? ` · ${f.customer.name}` : ""}{f?.warrantyUntil ? ` · ${tr("Warranty until")} ${day(f.warrantyUntil)}` : ""}</span>
                : <span className="serial-status is-in">{tr("In stock")}</span>}
              {!u.sold && <button type="button" aria-label={`${tr("Remove")} ${u.code}`} title={tr("Remove (typed by mistake)")} onClick={() => { if (window.confirm(`${tr("Remove")} ${u.code}?`)) attempt(() => removeSerial(p.id, u.code), tr("Removed")); }}><Trash2 /></button>}
            </li>;
          })}
          {shown.length === 0 && <li className="settings-note">{tr("No matching serial")}</li>}
          {shown.length > 200 && <li className="settings-note">{tr("Showing the first 200 — search to find others")}</li>}
        </ul>
      </>}
    </>}
  </section>;
}
