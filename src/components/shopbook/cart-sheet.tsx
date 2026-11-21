// Page 2 of Sales / POS / Inventory selling: cart review and payment on one screen.
import { useEffect, useState } from "react";
import { ChevronLeft, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ShopButton } from "@/components/ui/shop-button";
import { SearchPicker } from "@/components/shopbook/search-picker";
import { PayPicker, emptyPay, payInvalid, payRecord, type PayState } from "@/components/shopbook/pay-picker";
import { vatRate } from "@/lib/prefs";
import { parseQty } from "@/lib/qty-parse";
import { translateCurrent } from "@/lib/interface-translations";
import * as erp from "@/lib/erp";

export function useCartDraft(channel: string) {
  const [cart, setCart] = useState<erp.CartLine[]>([]);
  const key = `shopbook.cart.${channel}`;
  useEffect(() => {
    try {
      const draft: unknown = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(draft)) setCart(draft.filter((l): l is erp.CartLine => !!l && typeof l.productId === "string" && Number.isFinite(l.qty) && l.qty > 0 && (l.price === undefined || (Number.isFinite(l.price) && l.price >= 0))));
    } catch { /* A malformed draft never changes ERP records. */ }
  }, [key]);
  const saveDraft = () => { localStorage.setItem(key, JSON.stringify(cart)); };
  const clearDraft = () => { localStorage.removeItem(key); };
  return { cart, setCart, saveDraft, clearDraft };
}

const fmt = (n: number) => String(erp.roundQty(n));

/** Validates a typed quantity for a product; returns an error message or "". */
export function qtyError(p: erp.Product, qty: number | null, tr: (x: string) => string, units?: erp.Unit[]) {
  if (qty === null || !Number.isFinite(qty) || qty <= 0) return tr("Enter a quantity above zero");
  if (qty > p.qty + 1e-9) return `${tr("Insufficient stock")} (${tr("Available")} ${p.qty})`;
  if (erp.isWholeUnit(p.unit, units) && Math.abs(qty - Math.round(qty)) > 1e-9) return `${tr("Whole numbers only for")} ${p.unit || "pcs"}`;
  return "";
}

/** Amount typed for a line → new line. Kilos, litres and yards: the quantity comes from the money ("100 shillings' worth").
 *  Pieces can't be cut, so a different amount is a different price for the same pieces. Inexact amounts become an audited one-sale price. */
export function lineForAmount(s: erp.ErpState, line: erp.CartLine, amount: number): erp.CartLine | null {
  const p = s.products.find((x) => x.id === line.productId);
  if (!p || !(amount > 0)) return null;
  const agreed = (qty: number): erp.CartLine => ({ ...line, qty, price: Math.round((amount / qty) * 10000) / 10000, priceReason: line.priceReason || "Manual amount" });
  const r = erp.qtyForAmount(amount, erp.linePrice(s, line));
  if (!r) return agreed(line.qty); // the product has no selling price yet
  const whole = erp.isWholeUnit(p.unit, s.units);
  if (whole && !(r.exact && Number.isInteger(r.qty) && r.qty >= 1)) return agreed(line.qty);
  if (r.qty <= 0 || r.qty > p.qty + 1e-9) return null;
  return r.exact ? { ...line, qty: r.qty } : agreed(erp.roundQty(r.qty));
}

/** Sold under what the shop paid for it. */
export const belowBuying = (s: erp.ErpState, l: erp.CartLine) => { const p = s.products.find((x) => x.id === l.productId); return !!p && erp.linePrice(s, l) < p.buy; };

function QtyCell({ p, line, tr, setLine, onBad }: { p: erp.Product; line: erp.CartLine; tr: (x: string) => string; setLine: (l: erp.CartLine) => void; onBad: (b: boolean) => void }) {
  const [v, setV] = useState(fmt(line.qty));
  const [focus, setFocus] = useState(false);
  const [bad, setBad] = useState("");
  useEffect(() => { if (!focus) { setV(fmt(line.qty)); setBad(""); onBad(false); } }, [line.qty, focus]);
  return <input className="cart-amount-input cart-qty-input" aria-label={`${tr("Quantity")} ${p.name}`} aria-invalid={!!bad} title={bad || tr("Type 0.5, 1/2 or 1 3/4")} inputMode="text" value={v}
    onFocus={(e) => { setFocus(true); e.currentTarget.select(); }}
    onBlur={() => setFocus(false)}
    onChange={(e) => { const raw = e.target.value; setV(raw); const q = parseQty(raw); const err = qtyError(p, q === null ? null : erp.roundQty(q), tr, erp.load().units); setBad(err); onBad(!!err); if (!err && q !== null) setLine({ ...line, qty: erp.roundQty(q) }); }} />;
}

/** The price for this one sale, typed freely; the product's own selling price never changes. */
function PriceCell({ s, p, line, tr, setLine, onBad, onLeave }: { s: erp.ErpState; p: erp.Product; line: erp.CartLine; tr: (x: string) => string; setLine: (l: erp.CartLine) => void; onBad: (b: boolean) => void; onLeave: () => void }) {
  const price = Math.round(erp.linePrice(s, line) * 100) / 100;
  const [v, setV] = useState(String(price));
  const [focus, setFocus] = useState(false);
  const [bad, setBad] = useState(false);
  useEffect(() => { if (!focus) { setV(String(price)); setBad(false); } }, [price, focus]);
  return <input className="cart-amount-input" aria-label={`${tr("Price")} ${p.name}`} aria-invalid={bad} title={tr("Type the price for this sale")} inputMode="decimal" value={v}
    onFocus={(e) => { setFocus(true); e.currentTarget.select(); }}
    onBlur={() => { setFocus(false); onLeave(); }}
    onChange={(e) => {
      const raw = e.target.value; setV(raw);
      const ok = /^\d+(\.\d{0,2})?$/.test(raw); setBad(!ok); onBad(!ok);
      if (!ok) return;
      const { price: _old, priceReason: _why, ...rest } = line;
      setLine(Number(raw) === p.sell ? rest : { ...rest, price: Number(raw), priceReason: "Manual price" });
    }} />;
}

function AmountCell({ s, p, line, tr, setLine, onBad, onLeave }: { s: erp.ErpState; p: erp.Product; line: erp.CartLine; tr: (x: string) => string; setLine: (l: erp.CartLine) => void; onBad: (b: boolean) => void; onLeave: () => void }) {
  const amount = erp.lineAmount(s, line);
  const [v, setV] = useState(String(amount));
  const [focus, setFocus] = useState(false);
  const [bad, setBad] = useState(false);
  useEffect(() => { if (!focus) { setV(String(amount)); setBad(false); onBad(false); } }, [amount, focus]);
  return <input className="cart-amount-input" aria-label={`${tr("Amount")} ${p.name}`} aria-invalid={bad} title={tr("Type the money amount — quantity is calculated")} inputMode="decimal" value={v}
    onFocus={(e) => { setFocus(true); e.currentTarget.select(); }}
    onBlur={() => { setFocus(false); onLeave(); }}
    onChange={(e) => { const raw = e.target.value; setV(raw); const next = /^\d+(\.\d{0,2})?$/.test(raw) ? lineForAmount(s, line, Number(raw)) : null; setBad(!next); onBad(!next); if (next) setLine(next); }} />;
}

export function CartCheckout({ s, cart, money, tr, channel, setLine, remove, clear, back, saveDraft, onDone }: {
  s: erp.ErpState; cart: erp.CartLine[]; money: (n: number) => string; tr: (x: string) => string; channel: "POS" | "Sales";
  setLine: (l: erp.CartLine) => void; remove: (id: string) => void; clear: () => void; back: () => void; saveDraft: () => void; onDone: (sale: erp.Sale) => void;
}) {
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [customerId, setCustomer] = useState("");
  const [pay, setPay] = useState<PayState>(emptyPay());
  // Prices already confirmed as below the buying price, and the product the warning is open for.
  const [okayed, setOkayed] = useState<Record<string, number>>({});
  const [asking, setAsking] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const vr = vatRate();
  const subtotal = erp.lineTotal(s, cart);
  const vat = Math.round(subtotal * vr) / 100;
  const total = Math.round((subtotal + vat) * 100) / 100;
  const rec = payRecord(pay, total);
  const invalid = cart.some((l) => bad[l.productId]);
  const mark = (id: string) => (b: boolean) => setBad((c) => (c[id] === b ? c : { ...c, [id]: b }));
  const unconfirmed = (l: erp.CartLine) => belowBuying(s, l) && okayed[l.productId] !== erp.linePrice(s, l);
  const warnIfLow = (id: string) => { const l = cart.find((x) => x.productId === id); if (l && unconfirmed(l)) setAsking(id); };
  const askedLine = cart.find((l) => l.productId === asking);
  const askedProduct = s.products.find((p) => p.id === asking);
  const review = () => {
    if (invalid) { toast.error(tr("Fix the highlighted quantities or amounts")); return; }
    if (payInvalid(pay, total)) { toast.error(tr("Check the payment amounts")); return; }
    if (rec.credit > 0.001 && !customerId) { toast.error(tr("Credit needs a registered customer")); return; }
    const low = cart.find(unconfirmed);
    if (low) { setAsking(low.productId); return; }
    setReviewing(true);
  };
  const complete = () => {
    try {
      // Seller is always the signed-in user (recorded as the sale's cashier).
      const sale = erp.confirmSale({ cart, discount: 0, pay: rec, customerId: customerId || undefined, channel, vatRate: vr });
      toast.success(`${tr("Sale completed")} • ${sale.ref}`);
      onDone(sale);
    } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Failed")); }
  };
  return <div role="dialog" aria-modal="true" aria-label={tr("Cart & Payment")} className="cart-page">
    <section className="inventory-screen cart-sheet">
      <header className="cart-heading">
        <div className="flex min-w-0 items-center gap-1"><ShopButton variant="bare" className="cart-icon" aria-label={tr("Back to products")} onClick={back}><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></ShopButton><b className="truncate">{tr("Cart & Payment")}</b></div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ShopButton variant="bare" className="cart-clear" disabled={invalid} onClick={() => { try { saveDraft(); toast.success(tr("Cart saved locally")); } catch { toast.error(tr("Unable to save cart")); } }}><Save className="h-3.5 w-3.5" />{tr("Save Cart")}</ShopButton>
          <ShopButton variant="bare" className="cart-clear text-destructive" onClick={clear}><Trash2 className="h-3.5 w-3.5" />{tr("Clear")}</ShopButton>
        </div>
      </header>
      <div role="group" aria-label={tr("Customer")} className="inventory-field">{tr("Customer (optional)")}
        <SearchPicker tr={tr} items={s.customers.map((c) => ({ id: c.id, label: c.name, hint: c.phone }))} value={customerId} onChange={setCustomer} noneLabel={tr("No Customer")} placeholder={tr("Select customer")} addLabel={tr("Add Customer")} withPhone
          onAdd={(n, ph) => { try { return erp.addCustomer(n, ph).id; } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Failed")); return undefined; } }} />
      </div>
      <p className="inventory-field mt-2">{tr("Items")} ({cart.length})</p>
      <div className="cart-row cart-row-head"><span>{tr("Item")}</span><span>{tr("Qty")}</span><span>{tr("Unit")}</span><span className="text-end">{tr("Price")}</span><span className="text-end">{tr("Amount")}</span><span /></div>
      {cart.map((l) => {
        const p = s.products.find((x) => x.id === l.productId);
        if (!p) return null;
        return <div className="cart-row" key={p.id}>
          <span className="truncate font-semibold" title={p.name}>{p.name}</span>
          <QtyCell p={p} line={l} tr={tr} setLine={setLine} onBad={mark(p.id)} />
          <span className="truncate text-muted-foreground">{p.unit || "pcs"}</span>
          <PriceCell s={s} p={p} line={l} tr={tr} setLine={setLine} onBad={mark(p.id)} onLeave={() => warnIfLow(p.id)} />
          <AmountCell s={s} p={p} line={l} tr={tr} setLine={setLine} onBad={mark(p.id)} onLeave={() => warnIfLow(p.id)} />
          <ShopButton variant="bare" className="cart-icon text-destructive" aria-label={`${tr("Remove")} ${p.name}`} onClick={() => remove(p.id)}><X className="h-4 w-4" /></ShopButton>
        </div>;
      })}
      {vr > 0 && <div className="pur-totals mt-1"><span>{tr("Subtotal")}</span><b>{money(subtotal)}</b><span>{tr("VAT")} ({vr}%)</span><b>{money(vat)}</b></div>}
      <div className="mt-2"><PayPicker value={pay} onChange={setPay} total={total} money={money} tr={tr} creditNote={customerId ? undefined : "Credit needs a registered customer"} /></div>
      <ShopButton className="inventory-save mt-2 w-full" disabled={!cart.length || invalid} onClick={review}>{tr("Complete Sale")} • {money(total)}</ShopButton>
    </section>
    <AlertDialog open={!!askedLine && !!askedProduct} onOpenChange={(open) => { if (!open) setAsking(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("This is below the buying price")}</AlertDialogTitle>
          <AlertDialogDescription>{askedProduct?.name}: {tr("selling at")} {money(askedLine ? erp.linePrice(s, askedLine) : 0)}, {tr("buying price")} {money(askedProduct?.buy ?? 0)}. {tr("Confirm this price?")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { if (askedLine) { const { price: _p, priceReason: _r, ...rest } = askedLine; setLine(rest); } }}>{tr("Change price")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => { if (askedLine) setOkayed((c) => ({ ...c, [askedLine.productId]: erp.linePrice(s, askedLine) })); }}>{tr("Yes, confirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={reviewing} onOpenChange={setReviewing}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("Confirm this sale")}</AlertDialogTitle>
          <AlertDialogDescription>{tr("This customer is paying for these goods at these prices. Is it confirmed?")}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="cart-review">
          {cart.map((l) => { const p = s.products.find((x) => x.id === l.productId); return p && <li key={p.id}><span>{p.name}: {fmt(l.qty)} {p.unit || "pcs"} × {money(erp.linePrice(s, l))}{belowBuying(s, l) && <small> ({tr("below buying price")})</small>}</span><b>{money(erp.lineAmount(s, l))}</b></li>; })}
          <li className="cart-review-total"><span>{tr("Total")}</span><b>{money(total)}</b></li>
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("Go back")}</AlertDialogCancel>
          <AlertDialogAction onClick={complete}>{tr("Yes, complete sale")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
