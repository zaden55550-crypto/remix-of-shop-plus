// Shared selling UI: Sales → Billing and POS → Sell use the same components and the same engine.
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, Minus, Plus, Printer, Share2, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { ProductSearch, inputCls } from "@/components/shopbook/product-search";
import { store, canOpen, type Account, type Tier } from "@/lib/shopbook";
import { useLanguage } from "@/hooks/use-language";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { translateCurrent } from "@/lib/interface-translations";
import { cn } from "@/lib/utils";
import * as erp from "@/lib/erp";

export type Tr = (t: string) => string;
export type SCtx = { s: erp.ErpState; money: (n: number) => string; tr: Tr; shop: string; channel: "POS" | "Sales" };

export const dt = (n: number) => new Date(n).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const tm = (n: number) => new Date(n).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const run = <T,>(fn: () => T, ok?: string): T | undefined => {
  try { const r = fn(); if (ok) toast.success(ok); return r; } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Failed")); return undefined; }
};
const sameDay = (a: number, b = Date.now()) => new Date(a).toDateString() === new Date(b).toDateString();

/** Guards the route, returns the signed-in account or null while redirecting. */
export function useAccount(tier: Tier) {
  const nav = useNavigate();
  const [acct, setAcct] = useState<Account | null>(null);
  useEffect(() => {
    const a = store.get();
    if (!a || !store.signedIn()) { nav({ to: "/", replace: true }); return; }
    if (!canOpen(a, tier)) { nav({ to: "/apps", replace: true }); return; }
    setAcct(a);
  }, [nav, tier]);
  return acct;
}
export const moneyFor = (cur: string) => (n: number) => `${cur} ${(Math.round(n * 100) / 100).toLocaleString("en-KE")}`;

export function AppShell({ title, tabs, tab, setTab, children }: { title: string; tabs: string[]; tab: string; setTab: (t: string) => void; children: ReactNode }) {
  const nav = useNavigate();
  const { tr, dir } = useLanguage();
  return (
    <main dir={dir} className="app-screen mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-3">
          <ShopButton variant="bare" className="h-auto w-auto p-1" aria-label={tr("Back")} onClick={() => nav({ to: "/apps" })}><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></ShopButton>
          <h1 className="text-lg font-bold tracking-wide">{tr(title).toUpperCase()}</h1>
        </div>
        <div className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {tabs.map((k) => (
            <button key={k} onClick={() => setTab(k)} className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{tr(k).toUpperCase()}</button>
          ))}
        </div>
      </header>
      <section className="flex-1 px-4 pt-4">{children}</section>
    </main>
  );
}

export const Title = ({ children }: { children: ReactNode }) => <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground first:mt-0">{children}</h2>;
export const Empty = ({ children }: { children: ReactNode }) => <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
const Label = ({ t, children }: { t: string; children: ReactNode }) => <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t}<div className="mt-1">{children}</div></label>;

function Sheet({ onClose, children, title }: { onClose: () => void; children: ReactNode; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><p className="text-lg font-bold">{title}</p><button onClick={onClose} aria-label={translateCurrent("Close")}><X className="h-5 w-5" /></button></div>
        {children}
      </div>
    </div>
  );
}

// ---------------- SELL ----------------
export function Sell({ s, money, tr, shop, channel }: SCtx) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<erp.CartLine[]>([]);
  const [step, setStep] = useState<null | "cart" | "pay">(null);
  const [receipt, setReceipt] = useState<erp.Sale | null>(null);
  const list = useMemo(() => erp.searchProducts(s, q), [s, q]);
  const count = cart.reduce((a, l) => a + l.qty, 0);
  const prod = (id: string) => s.products.find((p) => p.id === id);

  const add = (id: string) => {
    const p = prod(id); if (!p) return;
    const inCart = cart.find((l) => l.productId === id)?.qty ?? 0;
    if (inCart + 1 > p.qty) { toast.error(`${tr("Insufficient stock")}: ${p.name} (${p.qty})`); return; }
    setCart((c) => (c.some((l) => l.productId === id) ? c.map((l) => (l.productId === id ? { ...l, qty: l.qty + 1 } : l)) : [...c, { productId: id, qty: 1 }]));
  };
  const setQty = (id: string, qty: number) => setCart((c) => (qty <= 0 ? c.filter((l) => l.productId !== id) : c.map((l) => (l.productId === id ? { ...l, qty } : l))));
  const onScan = (code: string) => { const p = erp.findByCode(s, code); if (p) { add(p.id); toast.success(p.name); } else toast.error(tr("Barcode not found — add it in Inventory")); };

  return (
    <div>
      <ProductSearch q={q} setQ={setQ} onScan={onScan} tr={tr} />
      <div className="mt-2">
        {list.length === 0 && <Empty>{s.products.length ? tr("No matching products") : tr("No products yet. Add products in Inventory.")}</Empty>}
        {list.map((p) => {
          const n = cart.find((l) => l.productId === p.id)?.qty ?? 0;
          return (
            <button key={p.id} onClick={() => add(p.id)} disabled={p.qty <= 0} className="flex w-full items-center gap-3 border-b border-border py-2.5 text-start disabled:opacity-50">
              {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.name}</p><p className="text-[11px] text-muted-foreground">{p.sku} • {p.qty > 0 ? `${p.qty} ${p.unit || tr("pcs")}` : tr("Out of stock")}</p></div>
              <span className="shrink-0 text-sm font-bold">{money(p.sell)}</span>
              {n > 0 && <span className="grid h-6 min-w-6 shrink-0 place-items-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground">{n}</span>}
            </button>
          );
        })}
      </div>

      {count > 0 && (
        <button onClick={() => setStep("cart")} aria-label={tr("Cart")} className="fixed right-4 top-1/2 z-30 grid h-14 w-14 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg">
          <ShoppingCart className="h-6 w-6" /><span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-foreground px-1 text-xs font-bold text-background">{count}</span>
        </button>
      )}

      {step === "cart" && (
        <Sheet title={tr("Cart")} onClose={() => setStep(null)}>
          {cart.map((l) => { const p = prod(l.productId); if (!p) return null; return (
            <div key={l.productId} className="flex items-center gap-2 border-b border-border py-2.5">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{p.name}</p><p className="text-[11px] text-muted-foreground">{l.qty} × {money(p.sell)}</p></div>
              <button aria-label="-" onClick={() => setQty(l.productId, l.qty - 1)} className="grid h-8 w-8 place-items-center rounded-lg border border-border"><Minus className="h-3.5 w-3.5" /></button>
              <input type="number" min="1" value={l.qty} onChange={(e) => setQty(l.productId, Math.floor(+e.target.value) || 0)} className="h-8 w-12 rounded-lg border border-border bg-card text-center text-sm" />
              <button aria-label="+" onClick={() => add(l.productId)} className="grid h-8 w-8 place-items-center rounded-lg border border-border"><Plus className="h-3.5 w-3.5" /></button>
              <span className="w-20 text-end text-sm font-semibold">{money(l.qty * p.sell)}</span>
              <button aria-label={tr("Remove")} onClick={() => setQty(l.productId, 0)}><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          ); })}
          <div className="mt-3 flex justify-between text-base font-bold"><span>{tr("TOTAL")}</span><span>{money(erp.lineTotal(s, cart))}</span></div>
          <ShopButton className="mt-3" disabled={!cart.length} onClick={() => setStep("pay")}>{tr("Continue")} →</ShopButton>
        </Sheet>
      )}

      {step === "pay" && (
        <Checkout s={s} money={money} tr={tr} cart={cart} onClose={() => setStep("cart")}
          onDone={(sale) => { setCart([]); setStep(null); setReceipt(sale); }} channel={channel} />
      )}
      {receipt && <ReceiptSheet sale={receipt} s={s} money={money} tr={tr} shop={shop} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function Checkout({ s, money, tr, cart, onClose, onDone, channel }: { s: erp.ErpState; money: SCtx["money"]; tr: Tr; cart: erp.CartLine[]; onClose: () => void; onDone: (s: erp.Sale) => void; channel: SCtx["channel"] }) {
  const [customerId, setCustomer] = useState("");
  const [newCust, setNewCust] = useState<string | null>(null);
  const [dMode, setDMode] = useState<"fixed" | "percent">("fixed");
  const [dVal, setDVal] = useState("");
  const [pay, setPay] = useState<Record<erp.Method, string>>({ cash: "", mpesa: "", bank: "", credit: "" });
  const subtotal = erp.lineTotal(s, cart);
  const discount = Math.min(subtotal, Math.max(0, dMode === "percent" ? (subtotal * (+dVal || 0)) / 100 : +dVal || 0));
  const total = subtotal - discount;
  const nums = Object.fromEntries(erp.METHODS.map((m) => [m, Math.max(0, +pay[m] || 0)])) as Record<erp.Method, number>;
  const allocated = erp.METHODS.reduce((a, m) => a + nums[m], 0);
  const remaining = total - allocated;
  const fill = (m: erp.Method) => setPay((p) => ({ ...p, [m]: String(Math.max(0, (+p[m] || 0) + remaining)) }));
  const over = allocated > total + 0.001;

  return (
    <Sheet title={tr("Payment")} onClose={onClose}>
      <div className="space-y-3">
        <Label t={tr("Customer")}>
          {newCust === null ? (
            <div className="flex gap-2">
              <select value={customerId} onChange={(e) => (e.target.value === "__new" ? setNewCust("") : setCustomer(e.target.value))} className={inputCls}>
                <option value="">{tr("No Customer")}</option>
                {s.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new">+ {tr("New customer")}</option>
              </select>
            </div>
          ) : (
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const c = run(() => erp.addCustomer(newCust)); if (c) { setCustomer(c.id); setNewCust(null); } }}>
              <input autoFocus value={newCust} maxLength={100} onChange={(e) => setNewCust(e.target.value)} placeholder={tr("Customer name")} className={inputCls} />
              <ShopButton className="h-11 w-20">{tr("Add")}</ShopButton>
            </form>
          )}
        </Label>
        <Label t={tr("Discount")}>
          <div className="flex gap-2">
            <select value={dMode} onChange={(e) => setDMode(e.target.value as "fixed" | "percent")} className={cn(inputCls, "w-36")}><option value="fixed">{tr("Fixed amount")}</option><option value="percent">{tr("Percentage")}</option></select>
            <input type="number" min="0" inputMode="decimal" value={dVal} onChange={(e) => setDVal(e.target.value)} placeholder={dMode === "percent" ? "%" : "0"} className={inputCls} />
          </div>
        </Label>
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <div className="flex justify-between"><span>{tr("Subtotal")}</span><span>{money(subtotal)}</span></div>
          <div className="flex justify-between"><span>{tr("Discount")}</span><span>{discount ? `− ${money(discount)}` : "—"}</span></div>
          <div className="mt-1 flex justify-between text-base font-bold"><span>{tr("TOTAL")}</span><span>{money(total)}</span></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {erp.METHODS.map((m) => (
            <Label key={m} t={tr(erp.METHOD_LABEL[m])}>
              <div className="relative">
                <input type="number" min="0" inputMode="decimal" value={pay[m]} onChange={(e) => setPay({ ...pay, [m]: e.target.value })} className={inputCls} />
                {remaining > 0.001 && <button type="button" onClick={() => fill(m)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">{tr("Rest")}</button>}
              </div>
            </Label>
          ))}
        </div>
        <div className="text-sm">
          <div className="flex justify-between"><span>{tr("Allocated")}</span><span className={cn(over && "text-destructive")}>{money(allocated)}</span></div>
          <div className="flex justify-between"><span>{tr(remaining >= 0 ? "Remaining" : "Over by")}</span><span className={cn(remaining !== 0 && "font-bold", over && "text-destructive")}>{money(Math.abs(remaining))}</span></div>
          {nums.credit > 0 && <div className="flex justify-between"><span>{tr("Outstanding")}</span><span className="font-bold">{money(nums.credit)}</span></div>}
          {nums.credit > 0 && !customerId && <p className="mt-1 text-xs text-destructive">{tr("Credit needs a registered customer")}</p>}
        </div>
        <ShopButton disabled={over || Math.abs(remaining) > 0.001 || (nums.credit > 0 && !customerId)}
          onClick={() => { const sale = run(() => erp.confirmSale({ cart, discount, pay: nums, customerId: customerId || undefined, channel })); if (sale) { toast.success(`${tr("Sale completed")} • ${sale.ref}`); onDone(sale); } }}>
          {tr("Confirm Sale")}
        </ShopButton>
      </div>
    </Sheet>
  );
}

// ---------------- RECEIPT (always white) ----------------
export function Receipt({ sale, s, money, tr, shop }: { sale: erp.Sale; s: erp.ErpState; money: SCtx["money"]; tr: Tr; shop: string }) {
  const cust = sale.customerId ? s.customers.find((c) => c.id === sale.customerId) : undefined;
  const rets = s.returns.filter((r) => r.saleId === sale.id);
  return (
    <div className="print-area receipt-paper mx-auto w-full max-w-xs rounded-xl p-4 font-mono text-[12px] leading-5">
      <p className="text-center text-sm font-bold">SHOPBOOK</p>
      <p className="text-center font-bold uppercase">{shop}</p>
      <div className="mt-2 border-t border-dashed border-current pt-2">
        <p>{sale.ref} • {tr("Till")}: {sale.channel === "POS" ? "01" : "—"}</p>
        <p>{tr("Cashier")}: {sale.cashier}</p>
        <p>{dt(sale.at)}</p>
        {cust && <p>{tr("Customer")}: {cust.name}</p>}
      </div>
      <div className="mt-2 border-t border-dashed border-current pt-2">
        {sale.items.map((i) => (
          <div key={i.productId} className="flex justify-between gap-2"><span className="truncate">{i.name} {i.qty} × {i.price.toLocaleString("en-KE")}</span><span>{(i.qty * i.price).toLocaleString("en-KE")}</span></div>
        ))}
      </div>
      <div className="mt-2 border-t border-dashed border-current pt-2">
        <div className="flex justify-between"><span>{tr("Subtotal")}</span><span>{money(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div className="flex justify-between"><span>{tr("Discount")}</span><span>− {money(sale.discount)}</span></div>}
        <div className="flex justify-between font-bold"><span>{tr("TOTAL")}</span><span>{money(sale.total)}</span></div>
        {erp.METHODS.filter((m) => sale.pay[m] > 0).map((m) => <div key={m} className="flex justify-between"><span>{tr(erp.METHOD_LABEL[m])}</span><span>{money(sale.pay[m])}</span></div>)}
        {rets.map((r) => <div key={r.id} className="flex justify-between"><span>{tr("Returned")} {r.ref}</span><span>− {money(r.amount)}</span></div>)}
      </div>
      <p className="mt-3 text-center">{tr("Thank you!")}</p>
    </div>
  );
}

export function ReceiptSheet({ sale, s, money, tr, shop, onClose, children }: { sale: erp.Sale; s: erp.ErpState; money: SCtx["money"]; tr: Tr; shop: string; onClose: () => void; children?: ReactNode }) {
  const text = () => [`SHOPBOOK — ${shop}`, `${sale.ref} • ${dt(sale.at)}`, ...sale.items.map((i) => `${i.name} ${i.qty} × ${i.price} = ${i.qty * i.price}`), `${tr("TOTAL")} ${money(sale.total)}`, `${tr("Payment")}: ${tr(erp.methodOf(sale.pay))}`].join("\n");
  const share = async () => {
    try { if (navigator.share) await navigator.share({ title: sale.ref, text: text() }); else { await navigator.clipboard.writeText(text()); toast.success(tr("Receipt copied")); } } catch { /* cancelled */ }
  };
  return (
    <Sheet title={tr("Receipt")} onClose={onClose}>
      <Receipt sale={sale} s={s} money={money} tr={tr} shop={shop} />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <ShopButton variant="outline" className="h-10 text-sm" onClick={share}><Share2 className="h-4 w-4" />{tr("Share")}</ShopButton>
        <ShopButton variant="outline" className="h-10 text-sm" onClick={() => window.print()}><Printer className="h-4 w-4" />{tr("Print")}</ShopButton>
        <ShopButton variant="outline" className="h-10 text-sm" onClick={() => window.print()}>{tr("Reprint")}</ShopButton>
      </div>
      {children}
    </Sheet>
  );
}

// ---------------- SALES HISTORY / TRANSACTIONS ----------------
export function SalesList({ s, money, tr, shop, onlyChannel }: SCtx & { onlyChannel?: "POS" }) {
  const [open, setOpen] = useState<erp.Sale | null>(null);
  const [ret, setRet] = useState(false);
  const list = s.sales.filter((x) => !onlyChannel || x.channel === onlyChannel);
  const live = open ? s.sales.find((x) => x.id === open.id) ?? open : null;
  return (
    <div>
      {list.length === 0 && <Empty>{tr("No sales yet")}</Empty>}
      {list.map((x) => (
        <button key={x.id} onClick={() => { setOpen(x); setRet(false); }} className="flex w-full items-center justify-between border-b border-border py-2.5 text-start text-sm">
          <span className="min-w-0 truncate"><b>{x.ref}</b> • {money(x.total)} • {tr(erp.methodOf(x.pay))}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{sameDay(x.at) ? tm(x.at) : dt(x.at)}</span>
        </button>
      ))}
      {live && (
        <ReceiptSheet sale={live} s={s} money={money} tr={tr} shop={shop} onClose={() => setOpen(null)}>
          {!ret ? (live.items.some((i) => i.returned < i.qty) && <ShopButton variant="outline" className="mt-2 h-10 text-sm" onClick={() => setRet(true)}>{tr("Return items")}</ShopButton>)
            : <ReturnForm sale={live} s={s} money={money} tr={tr} onDone={() => setRet(false)} />}
        </ReceiptSheet>
      )}
    </div>
  );
}

function ReturnForm({ sale, s, money, tr, onDone }: { sale: erp.Sale; s: erp.ErpState; money: SCtx["money"]; tr: Tr; onDone: () => void }) {
  const [q, setQ] = useState<Record<string, string>>({});
  const hasCust = !!sale.customerId && s.customers.some((c) => c.id === sale.customerId);
  const [refund, setRefund] = useState<erp.Method>("cash");
  const ratio = sale.subtotal ? sale.total / sale.subtotal : 1;
  const amount = sale.items.reduce((a, i) => a + (+(q[i.productId] ?? 0) || 0) * i.price * ratio, 0);
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
      <p className="text-sm font-bold">{tr("Return items")} • {sale.ref}</p>
      {sale.items.map((i) => (
        <div key={i.productId} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">{i.name} <span className="text-xs text-muted-foreground">({i.qty - i.returned} {tr("left")})</span></span>
          <input type="number" min="0" max={i.qty - i.returned} value={q[i.productId] ?? ""} onChange={(e) => setQ({ ...q, [i.productId]: e.target.value })} className="h-9 w-16 rounded-lg border border-border bg-card text-center" disabled={i.returned >= i.qty} />
        </div>
      ))}
      <Label t={tr("Refund as")}>
        <select value={refund} onChange={(e) => setRefund(e.target.value as erp.Method)} className={inputCls}>
          {erp.METHODS.filter((m) => m !== "credit" || hasCust).map((m) => <option key={m} value={m}>{m === "credit" ? tr("Customer credit") : tr(erp.METHOD_LABEL[m])}</option>)}
        </select>
      </Label>
      <div className="flex justify-between text-sm font-bold"><span>{tr("Refund")}</span><span>{money(amount)}</span></div>
      <ShopButton className="h-10 text-sm" onClick={() => { if (run(() => erp.returnSale(sale.id, sale.items.map((i) => ({ productId: i.productId, qty: Math.floor(+(q[i.productId] ?? 0) || 0) })), refund), tr("Return recorded")) !== undefined) onDone(); }}>{tr("Confirm Return")}</ShopButton>
    </div>
  );
}

export function ReturnsList({ s, money, tr }: SCtx) {
  return (
    <div>
      <p className="mb-2 text-xs text-muted-foreground">{tr("To return items, open the original sale in Sales and tap Return items.")}</p>
      {s.returns.length === 0 && <Empty>{tr("No returns yet")}</Empty>}
      {s.returns.map((r) => (
        <div key={r.id} className="border-b border-border py-2.5 text-sm">
          <div className="flex justify-between"><b>{r.ref}</b><span>{money(r.amount)}</span></div>
          <p className="text-[11px] text-muted-foreground">{tr("Original")}: {r.saleRef} • {r.items.map((i) => `${i.name} × ${i.qty}`).join(", ")} • {r.refund === "credit" ? tr("Customer credit") : tr(erp.METHOD_LABEL[r.refund])} • {dt(r.at)}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------- CUSTOMERS ----------------
export function Customers({ s, money, tr }: SCtx) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [amt, setAmt] = useState(""); const [method, setMethod] = useState<erp.Method>("cash");
  const c = s.customers.find((x) => x.id === open);
  return (
    <div>
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (run(() => erp.addCustomer(name, phone), tr("Customer added"))) { setName(""); setPhone(""); } }}>
        <div className="flex gap-2">
          <input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder={tr("Customer name")} className={inputCls} />
          <input value={phone} maxLength={20} inputMode="tel" onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ""))} placeholder={tr("Phone")} className={cn(inputCls, "w-32")} />
        </div>
        <ShopButton className="h-10 text-sm">{tr("Add customer")}</ShopButton>
      </form>
      <div className="mt-3">
        {s.customers.length === 0 && <Empty>{tr("No customers yet")}</Empty>}
        {s.customers.map((x) => (
          <button key={x.id} onClick={() => setOpen(x.id)} className="flex w-full justify-between border-b border-border py-2.5 text-start text-sm">
            <span>{x.name}{x.phone && <span className="text-xs text-muted-foreground"> • {x.phone}</span>}</span>
            <span className={cn("font-semibold", x.balance > 0 && "text-destructive", x.balance < 0 && "text-primary")}>{x.balance ? money(Math.abs(x.balance)) + (x.balance < 0 ? ` ${tr("credit")}` : "") : "—"}</span>
          </button>
        ))}
      </div>
      {c && (
        <Sheet title={c.name} onClose={() => setOpen(null)}>
          <Kpi label={tr(c.balance >= 0 ? "Outstanding balance" : "Credit in favour")} value={money(Math.abs(c.balance))} />
          {c.balance > 0 && (
            <div className="mt-3 flex gap-2">
              <input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={tr("Amount")} className={inputCls} />
              <select value={method} onChange={(e) => setMethod(e.target.value as erp.Method)} className={cn(inputCls, "w-28")}>{(["cash", "mpesa", "bank"] as erp.Method[]).map((m) => <option key={m} value={m}>{tr(erp.METHOD_LABEL[m])}</option>)}</select>
              <ShopButton className="h-11 w-24 text-sm" onClick={() => { if (run(() => erp.receiveDebt(c.id, +amt, method), tr("Payment received")) !== undefined) setAmt(""); }}>{tr("Receive")}</ShopButton>
            </div>
          )}
          <Title>{tr("Transactions")}</Title>
          {[...s.sales.filter((x) => x.customerId === c.id).map((x) => ({ at: x.at, t: `${x.ref} • ${tr(erp.methodOf(x.pay))}`, a: x.total })),
            ...s.payments.filter((p) => p.customerId === c.id && p.kind === "DEBT").map((p) => ({ at: p.at, t: `${p.ref} • ${tr("Debt payment")}`, a: -p.amount })),
            ...s.returns.filter((r) => s.sales.find((x) => x.id === r.saleId)?.customerId === c.id).map((r) => ({ at: r.at, t: `${r.ref} • ${tr("Return")}`, a: -r.amount }))]
            .sort((a, b) => b.at - a.at).map((r, i) => <div key={i} className="flex justify-between border-b border-border py-2 text-sm"><span>{r.t}<span className="block text-[11px] text-muted-foreground">{dt(r.at)}</span></span><span>{money(r.a)}</span></div>)}
        </Sheet>
      )}
    </div>
  );
}

export function PaymentsList({ s, money, tr }: SCtx) {
  return (
    <div>
      {s.payments.length === 0 && <Empty>{tr("No payments yet")}</Empty>}
      {s.payments.map((p) => (
        <div key={p.id} className="flex justify-between border-b border-border py-2.5 text-sm">
          <span>{p.ref} • {tr(erp.METHOD_LABEL[p.method])} • {tr(p.kind === "SALE" ? "Sale" : p.kind === "DEBT" ? "Debt payment" : "Refund")}<span className="block text-[11px] text-muted-foreground">{p.source} • {dt(p.at)}</span></span>
          <span className={cn("font-semibold", p.amount < 0 && "text-destructive")}>{money(p.amount)}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------- REPORTS / OVERVIEW ----------------
export function salesStats(s: erp.ErpState, filter: (x: erp.Sale) => boolean = () => true) {
  const sales = s.sales.filter(filter);
  const ids = new Set(sales.map((x) => x.id));
  const rets = s.returns.filter((r) => ids.has(r.saleId));
  const gross = sales.reduce((a, x) => a + x.total, 0);
  const returned = rets.reduce((a, r) => a + r.amount, 0);
  const cost = sales.reduce((a, x) => a + x.items.reduce((b, i) => b + (i.qty - i.returned) * i.cost, 0), 0);
  const byMethod = Object.fromEntries(erp.METHODS.map((m) => [m, sales.reduce((a, x) => a + x.pay[m], 0)])) as Record<erp.Method, number>;
  const top = new Map<string, number>();
  sales.forEach((x) => x.items.forEach((i) => top.set(i.name, (top.get(i.name) ?? 0) + i.qty - i.returned)));
  return { count: sales.length, gross, returned, net: gross - returned, profit: gross - returned - cost, byMethod, top: [...top].sort((a, b) => b[1] - a[1]).slice(0, 5) };
}

export function SalesReport({ s, money, tr, onlyChannel }: SCtx & { onlyChannel?: "POS" }) {
  const [range, setRange] = useState<"today" | "7d" | "all">("today");
  const since = range === "today" ? new Date(new Date().toDateString()).getTime() : range === "7d" ? Date.now() - 7 * 864e5 : 0;
  const st = salesStats(s, (x) => x.at >= since && (!onlyChannel || x.channel === onlyChannel));
  return (
    <div>
      <div className="mb-3 flex gap-1">{(["today", "7d", "all"] as const).map((r) => <button key={r} onClick={() => setRange(r)} className={cn("rounded-full px-3 py-1 text-xs font-semibold", range === r ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{tr(r === "today" ? "Today" : r === "7d" ? "Last 7 days" : "All time")}</button>)}</div>
      <KpiRow>
        <Kpi label={tr("Sales")} value={st.count} />
        <Kpi label={tr("Net sales")} value={money(st.net)} />
        <Kpi label={tr("Returns")} value={money(st.returned)} />
        <Kpi label={tr("Gross profit")} value={money(st.profit)} />
      </KpiRow>
      <Title>{tr("By payment")}</Title>
      {erp.METHODS.map((m) => <div key={m} className="flex justify-between border-b border-border py-2 text-sm"><span>{tr(erp.METHOD_LABEL[m])}</span><span>{money(st.byMethod[m])}</span></div>)}
      <Title>{tr("Top products")}</Title>
      {st.top.length ? st.top.map(([n, q]) => <div key={n} className="flex justify-between border-b border-border py-2 text-sm"><span>{n}</span><span>{q}</span></div>) : <Empty>{tr("No sales yet")}</Empty>}
    </div>
  );
}

export function SalesOverview(ctx: SCtx) {
  const { s, money, tr } = ctx;
  const st = salesStats(s, (x) => sameDay(x.at));
  const owed = s.customers.reduce((a, c) => a + Math.max(0, c.balance), 0);
  return (
    <div>
      <KpiRow>
        <Kpi label={tr("Today's sales")} value={money(st.net)} />
        <Kpi label={tr("Transactions")} value={st.count} />
        <Kpi label={tr("Customer debt")} value={money(owed)} />
        <Kpi label={tr("Returns today")} value={money(st.returned)} />
      </KpiRow>
      <Title>{tr("Recent sales")}</Title>
      <SalesList {...ctx} s={{ ...s, sales: s.sales.slice(0, 5) }} />
    </div>
  );
}

// ---------------- POS CASH ----------------
export function Cash({ s, money, tr }: SCtx) {
  const [view, setView] = useState<"OPENING CASH" | "CASH IN" | "CASH OUT" | "CASH UP" | "CASH HISTORY">("OPENING CASH");
  const [amt, setAmt] = useState(""); const [note, setNote] = useState("");
  const cs = erp.cashSession(s);
  const lastUp = s.cash.find((e) => e.type === "CASH UP");
  const submit = () => {
    const ok = view === "CASH UP" ? run(() => erp.cashUp(+amt), tr("Cash-up saved")) : run(() => erp.cashEvent(view === "OPENING CASH" ? "OPENING" : (view as "CASH IN" | "CASH OUT"), +amt, note), tr("Recorded"));
    if (ok !== undefined) { setAmt(""); setNote(""); }
  };
  return (
    <div>
      <div className="mb-3 flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {(["OPENING CASH", "CASH IN", "CASH OUT", "CASH UP", "CASH HISTORY"] as const).map((k) => <button key={k} onClick={() => setView(k)} className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", view === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{tr(k)}</button>)}
      </div>
      <KpiRow>
        <Kpi label={tr("Opening Cash")} value={money(cs.opening)} />
        <Kpi label={tr("Cash Sales")} value={money(cs.sales)} />
        <Kpi label={tr("Cash Refunds")} value={money(cs.refunds)} />
        <Kpi label={tr("Cash In")} value={money(cs.cin)} />
        <Kpi label={tr("Cash Out")} value={money(cs.cout)} />
        <Kpi label={tr("Expected Cash")} value={money(cs.expected)} />
      </KpiRow>
      {view !== "CASH HISTORY" ? (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input type="number" min="0" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={tr(view === "CASH UP" ? "Counted cash" : "Amount")} className={inputCls} />
          {view === "CASH UP" && amt !== "" && <p className="text-sm">{tr("Difference")}: <b className={cn(+amt - cs.expected < 0 && "text-destructive")}>{money(+amt - cs.expected)}</b></p>}
          {(view === "CASH IN" || view === "CASH OUT") && <input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder={tr("Reason")} className={inputCls} />}
          <ShopButton type="submit">{tr(view === "CASH UP" ? "Confirm Cash-up" : "Confirm")}</ShopButton>
          {view === "CASH UP" && lastUp && <p className="text-xs text-muted-foreground">{tr("Last cash-up")}: {dt(lastUp.at)} • {money(lastUp.counted ?? 0)}</p>}
        </form>
      ) : (
        <div className="mt-3">
          {s.cash.length === 0 && <Empty>{tr("No cash records yet")}</Empty>}
          {s.cash.map((e) => <div key={e.id} className="flex justify-between border-b border-border py-2 text-sm"><span>{tr(e.type)}{e.note && ` • ${e.note}`}<span className="block text-[11px] text-muted-foreground">{dt(e.at)} • {e.user}</span></span><span>{e.type === "CASH UP" ? `${money(e.counted ?? 0)} (${(e.amount >= 0 ? "+" : "") + Math.round(e.amount)})` : money(e.amount)}</span></div>)}
        </div>
      )}
    </div>
  );
}
