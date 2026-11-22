// The serials of a cart line (Serial / IMEI numbers & warranty). Under a serial-tracked product in the cart: what is chosen and
// how many are still needed (the sale can't complete until every unit has one), and a window listing the product's serials
// still in stock, searchable, where typing or scanning a full serial picks it. The engine checks the same again (recordSale).
import { useEffect, useMemo, useState } from "react";
import { Check, ScanLine, X } from "lucide-react";
import { GlassPage } from "@/components/shopbook/glass-page";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { serialsInStock } from "@/lib/serials";
import { cn } from "@/lib/utils";

/** The cart after scanning `code`: when it is an in-stock serial of a tracked product, that product's line gains one unit
 *  with that serial already chosen; otherwise null (the till adds the product the usual way). */
export function addScannedSerial(s: erp.ErpState, cart: erp.CartLine[], code: string): { cart: erp.CartLine[]; product: erp.Product } | null {
  const key = erp.serialKey(code);
  const p = s.products.find((x) => !x.archived && x.serialTracked && serialsInStock(x).some((u) => erp.serialKey(u.code) === key));
  if (!p) return null;
  const line = cart.find((l) => l.productId === p.id);
  if (line?.serials?.includes(key)) return { cart, product: p };
  const next: erp.CartLine = line ? { ...line, qty: Math.round(line.qty) + 1, serials: [...(line.serials ?? []), key] } : { productId: p.id, qty: 1, serials: [key] };
  return { cart: line ? cart.map((l) => (l === line ? next : l)) : [...cart, next], product: p };
}

/** How many serials a tracked line still needs (0 when complete, or the product isn't tracked). */
export function missingSerials(p: erp.Product, line: erp.CartLine): number {
  if (!p.serialTracked) return 0;
  const want = Math.max(0, Math.round(line.qty));
  return Math.max(0, want - (line.serials?.length ?? 0));
}

export function SerialChooser({ p, line, setLine }: { p: erp.Product; line: erp.CartLine; setLine: (l: erp.CartLine) => void }) {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const want = Math.max(0, Math.round(line.qty));
  // A lower quantity drops the extra serials, last chosen first.
  const chosen = (line.serials ?? []).slice(0, want);
  const missing = want - chosen.length;
  const set = (serials: string[]) => setLine({ ...line, serials: serials.length ? serials : undefined });
  // The line itself drops serials beyond its quantity, so the sale never names more units than it sells.
  useEffect(() => { if ((line.serials?.length ?? 0) > want) set(chosen); }); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={cn("cart-serials", missing > 0 && "is-missing")}>
    {chosen.map((code) => <span key={code} className="cart-serial-chip">{code}<button type="button" aria-label={`${tr("Remove")} ${code}`} onClick={() => set(chosen.filter((x) => x !== code))}><X /></button></span>)}
    {missing > 0 && <span className="cart-serial-need" role="status">{missing} {tr(missing === 1 ? "serial / IMEI still needed" : "serials / IMEIs still needed")}</span>}
    <button type="button" className="cart-serial-btn" onClick={() => setOpen(true)}><ScanLine aria-hidden /> {tr(chosen.length ? "Change serials" : "Choose serials")}</button>
    {open && <SerialWindow p={p} want={want} chosen={chosen} onDone={(x) => { set(x); setOpen(false); }} onClose={() => setOpen(false)} />}
  </div>;
}

function SerialWindow({ p, want, chosen, onDone, onClose }: { p: erp.Product; want: number; chosen: string[]; onDone: (serials: string[]) => void; onClose: () => void }) {
  const { tr } = useLanguage();
  const [picked, setPicked] = useState<string[]>(chosen);
  const [q, setQ] = useState("");
  const stock = useMemo(() => serialsInStock(p).map((u) => erp.serialKey(u.code)), [p]);
  const shown = q.trim() ? stock.filter((x) => x.includes(erp.serialKey(q))) : stock;
  const toggle = (code: string) => setPicked((x) => (x.includes(code) ? x.filter((c) => c !== code) : x.length >= want ? x : [...x, code]));
  // Typing or scanning a whole serial and pressing Enter picks it.
  const pickTyped = () => { const key = erp.serialKey(q); if (stock.includes(key)) { if (!picked.includes(key) && picked.length < want) setPicked([...picked, key]); setQ(""); } };
  return <GlassPage narrow label={`${tr("Choose serials")} · ${p.name}`} onClose={onClose}>
    <div className="serial-window">
      <p className="serial-window-head"><b translate="no">{p.name}</b> · {tr("Chosen")} {picked.length} / {want}</p>
      <input className="inventory-input" autoFocus inputMode="text" placeholder={tr("Type or scan a serial / IMEI")} value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); pickTyped(); } }} aria-label={tr("Type or scan a serial / IMEI")} />
      {stock.length === 0 ? <p className="settings-note">{tr("No serials of this product are in stock. Add them in Inventory › Edit Product.")}</p>
        : <ul className="serial-list" role="listbox" aria-multiselectable="true">
          {shown.map((code) => { const on = picked.includes(code), full = !on && picked.length >= want;
            return <li key={code}><button type="button" role="option" aria-selected={on} disabled={full} className={cn(on && "is-on")} onClick={() => toggle(code)}>
              {on ? <Check aria-hidden /> : <span className="serial-box" aria-hidden />}<span>{code}</span></button></li>; })}
          {shown.length === 0 && <li className="settings-note">{tr("No matching serial in stock")}</li>}
        </ul>}
      <div className="serial-window-foot">
        <ShopButton variant="outline" onClick={onClose}>{tr("Cancel")}</ShopButton>
        <ShopButton onClick={() => onDone(picked)}>{tr("Done")} ({picked.length}/{want})</ShopButton>
      </div>
    </div>
  </GlassPage>;
}
