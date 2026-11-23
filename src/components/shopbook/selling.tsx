import { clean } from "@/lib/format";
import { smsLink, waLink } from "@/lib/whatsapp";
import { paymentLines, printedRef } from "@/lib/ready-setup";
import { GlassPage } from "@/components/shopbook/glass-page";
// Shared selling UI: Sales → New Sale and POS → Sell use the same components and the same engine.
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, FileText, Mail, MessageCircle, MessageSquare, Minus, Plus, Printer, Share2, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { inputCls } from "@/components/shopbook/product-search";
import { store, canOpen, type Account, type Tier } from "@/lib/shopbook";
import type { HeaderPeriod } from "@/lib/period";
import { PayPicker, emptyPay, payInvalid, payRecord, type PayState } from "@/components/shopbook/pay-picker";
import { vatRate } from "@/lib/prefs";
import { PrintPreview, sharePdfText } from "@/components/shopbook/print";
import { useLanguage } from "@/hooks/use-language";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { translateCurrent } from "@/lib/interface-translations";
import { cn } from "@/lib/utils";
import { BackupStatus } from "@/components/shopbook/backup-status";
import { ProductCatalog } from "@/components/shopbook/product-catalog";
import { Empty, Tabs } from "@/components/shopbook/erp-shell";
import { GlobalApplicationHeader } from "@/components/shopbook/global-application-header";
import { SearchPicker } from "@/components/shopbook/search-picker";
import { CartCheckout, useCartDraft } from "@/components/shopbook/cart-sheet";
import { WeightPad } from "@/components/shopbook/weight-pad";
import { addScannedSerial } from "@/components/shopbook/serial-chooser";
import { GasPad } from "@/components/shopbook/gas-pad";
import { useFeature } from "@/lib/use-features";
import { qtyTimesPrice, weighedUnit } from "@/lib/weight-display";
import { MAIN_LOCATION } from "@/lib/locations";
import { readSettings } from "@/lib/settings-config";
import * as erp from "@/lib/erp";
import { forOpenBusiness } from "@/lib/businesses";

export type Tr = (t: string) => string;
export type SCtx = { s: erp.ErpState; money: (n: number) => string; tr: Tr; shop: string; channel: "POS" | "Sales" };

export const dt = (n: number) => new Date(n).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const tm = (n: number) => new Date(n).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
export const run = <T,>(fn: () => T, ok?: string): T | undefined => {
  try { const r = fn(); if (ok) toast.success(ok); return r; } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Failed")); return undefined; }
};
const sameDay = (a: number, b = Date.now()) => new Date(a).toDateString() === new Date(b).toDateString();

export { forOpenBusiness } from "@/lib/businesses";

/** Guards the route, returns the signed-in account (as the open business shows it) or null while redirecting. */
export function useAccount(tier: Tier) {
  const nav = useNavigate();
  const [acct, setAcct] = useState<Account | null>(null);
  useEffect(() => {
    const read = () => {
      const a = store.get();
      if (!a || !store.signedIn()) { nav({ to: "/", replace: true }); return; }
      if (!canOpen(a, tier)) { nav({ to: "/apps", replace: true }); return; }
      const next = forOpenBusiness(a);
      // Every save notifies; keep the same object unless something shown changed, so effects that depend on the account don't re-run.
      setAcct((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    read();
    // Opening another business changes the name, currency and industry every screen shows.
    return erp.subscribe(read);
  }, [nav, tier]);
  return acct;
}
export const moneyFor = (cur: string) => (n: number) => `${cur} ${clean(Math.round(clean(n) * 100) / 100).toLocaleString("en-KE")}`;

export function AppShell({ title, tabs, tab, setTab, children }: { title: string; tabs: string[]; tab: string; setTab: (t: string) => void; children: ReactNode }) {
  const { tr, dir } = useLanguage();
  const shop = store.get()?.shopName ?? "";
  return (
    <main dir={dir} className="shop-app app-screen mx-auto flex min-h-screen w-full max-w-md md:max-w-none flex-col bg-background pb-24 text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <GlobalApplicationHeader title={title} shop={shop} moduleFirst menus={tabs} menu={tab} onMenu={setTab} />
        <BackupStatus />
        {tabs.length > 0 && <Tabs items={tabs} value={tab} onChange={setTab} tr={tr} />}
      </header>
      <section className="flex-1 px-4 pt-4">{children}</section>
    </main>
  );
}

export const Title = ({ children }: { children: ReactNode }) => <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground first:mt-0">{children}</h2>;
export { Empty };
const Label = ({ t, children }: { t: string; children: ReactNode }) => <div role="group" aria-label={t} className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t}<div className="mt-1">{children}</div></div>;

function Sheet({ onClose, children, title }: { onClose: () => void; children: ReactNode; title: string }) {
  return (
    <GlassPage narrow label={title} onClose={onClose}>
      <div className="mb-3 flex items-center justify-between"><p className="text-lg font-bold">{title}</p><button onClick={onClose} aria-label={translateCurrent("Close")}><X className="h-5 w-5" /></button></div>
      {children}
    </GlassPage>
  );
}

// ---------------- SELL ----------------
export function Sell({ s, money, tr, shop, channel }: SCtx) {
  const { cart, setCart, saveDraft, clearDraft } = useCartDraft(channel);
  const [step, setStep] = useState<null | "cart">(null);
  const [receipt, setReceipt] = useState<erp.Sale | null>(null);
  const count = cart.length;
  const prod = (id: string) => s.products.find((p) => p.id === id);
  // Selling by weight: a weighed product opens the weight keypad instead of adding one.
  const byWeight = useFeature("weight");
  const [weigh, setWeigh] = useState<string | null>(null);
  const weighed = weigh ? prod(weigh) : undefined;
  // Gas cylinder exchange: a full cylinder asks Refill or New cylinder first.
  const gasOn = useFeature("gas");
  const [gasFor, setGasFor] = useState<string | null>(null);
  const gasProduct = gasFor ? prod(gasFor) : undefined;

  const add = (id: string) => {
    const p = prod(id); if (!p) return;
    if (gasOn && p.gas?.kind === "full") { setGasFor(id); return; }
    if (byWeight && erp.isWeightUnit(p.unit, s.units)) { setWeigh(id); return; }
    // Check inside the updater so rapid taps can't exceed stock through a stale cart.
    let blocked = false;
    setCart((c) => {
      const inCart = c.find((l) => l.productId === id)?.qty ?? 0;
      // The last part of a kilo or a yard can still be added: only what is left, not a full one.
      const room = erp.roundQty(p.qty - inCart), step = room > 0 && room < 1 && !erp.isWholeUnit(p.unit, s.units) ? room : 1;
      if (inCart + step > p.qty + 1e-9) { blocked = true; return c; }
      return c.some((l) => l.productId === id) ? c.map((l) => (l.productId === id ? { ...l, qty: erp.roundQty(l.qty + step) } : l)) : [...c, { productId: id, qty: step }];
    });
    if (blocked || (cart.find((l) => l.productId === id)?.qty ?? 0) >= p.qty) toast.error(`${tr("Insufficient stock")}: ${p.name} (${tr("Available")} ${p.qty})`, { id: `stock-${id}` });
  };
  const setQty = (id: string, qty: number) => setCart((c) => (qty <= 0 ? c.filter((l) => l.productId !== id) : c.map((l) => (l.productId === id ? { ...l, qty } : l))));
  // A scanned serial / IMEI adds its product with that serial already chosen; any other code adds the product as usual.
  const onScan = (code: string) => { const bySerial = addScannedSerial(s, cart, code); if (bySerial) { setCart(bySerial.cart); toast.success(`${bySerial.product.name} · ${erp.serialKey(code)}`); return; } const p = erp.findByCode(s, code); if (p) { add(p.id); toast.success(p.name); } else toast.error(tr("Barcode not found — add it in Inventory")); };

  return (
    <div>
      <ProductCatalog s={s} cart={cart} tr={tr} add={(id) => add(id)} onScan={onScan} />
      <ShopButton variant="bare" onClick={() => cart.length ? setStep("cart") : toast(tr("Cart is empty"))} aria-label={`${tr("Cart")} (${count})`} className="pos-fab">
        <ShoppingCart className="h-6 w-6" />{count > 0 && <span className="pos-fab-count">{count}</span>}
      </ShopButton>

      {step && <CartCheckout s={s} cart={cart} money={money} tr={tr} channel={channel}
        setLine={(line) => setCart((c) => c.map((v) => v.productId === line.productId ? line : v))}
        remove={(id) => setQty(id, 0)} clear={() => { setCart([]); clearDraft(); setStep(null); }}
        back={() => setStep(null)} saveDraft={saveDraft}
        onDone={(sale) => { setCart([]); clearDraft(); setStep(null); setReceipt(sale); }} />}
      {receipt && <ReceiptSheet live sale={receipt} s={s} money={money} tr={tr} shop={shop} onClose={() => setReceipt(null)} />}
      {gasProduct && <GasPad s={s} p={gasProduct} line={cart.find((l) => l.productId === gasProduct.id)} money={money} onClose={() => setGasFor(null)}
        onSet={(line) => setCart((c) => (c.some((l) => l.productId === line.productId) ? c.map((l) => (l.productId === line.productId ? line : l)) : [...c, line]))} />}
      {weighed && <WeightPad s={s} p={weighed} line={cart.find((l) => l.productId === weighed.id)} money={money} onClose={() => setWeigh(null)}
        onSet={(line) => setCart((c) => (c.some((l) => l.productId === line.productId) ? c.map((l) => (l.productId === line.productId ? line : l)) : [...c, line]))} />}
    </div>
  );
}

// ---------------- RECEIPT (always white) ----------------
export function Receipt({ sale, s, money, tr, shop }: { sale: erp.Sale; s: erp.ErpState; money: SCtx["money"]; tr: Tr; shop: string }) {
  const byWeight = useFeature("weight");
  const cust = sale.customerId ? s.customers.find((c) => c.id === sale.customerId) : undefined;
  const rets = s.returns.filter((r) => r.saleId === sale.id);
  // The business's own receipt details (Settings › Receipts and Business Profile); blank ones are left out.
  // The shop that made the sale prints its own phone (Business Setup › Phone); without one, the business number.
  const shopPhone = s.locations.find((l) => l.id === (sale.locationId ?? MAIN_LOCATION))?.phone?.trim();
  const cfg = readSettings(), phone = shopPhone || cfg.phone || store.get()?.phone || "";
  // A location's own receipt heading, tax PIN and hours (Business Setup › Edit) come before the business's.
  const here = s.locations.find((l) => l.id === (sale.locationId ?? MAIN_LOCATION));
  const taxPin = here?.taxPin || cfg.taxPin, hours = here?.hours || cfg.hours;
  return (
    <div className="print-area receipt-paper mx-auto w-full max-w-xs rounded-xl p-4 font-mono text-[12px] leading-5">
      <p className="text-center text-sm font-bold">Zakrio Systems</p>
      <p className="text-center font-bold uppercase">{shop}</p>
      {phone && <p className="text-center">{tr("Tel")}: {phone}</p>}
      {here?.receiptHeader && <p className="text-center">{here.receiptHeader}</p>}
      {taxPin && <p className="text-center">{tr("PIN")}: {taxPin}</p>}
      {hours && <p className="text-center">{hours}</p>}
      <div className="mt-2 border-t border-dashed border-current pt-2">
        <p>{printedRef(sale.ref)} • {tr("Till")}: {sale.channel === "POS" ? String(sale.counter ?? 1).padStart(2, "0") : "—"}</p>
        <p>{tr("Cashier")}: {sale.cashier}</p>
        <p>{tr("Seller")}: {s.employees.find((e) => e.id === sale.sellerId)?.name ?? tr("Admin")}</p>
        <p>{dt(sale.at)}</p>
        {cust && <p>{tr("Customer")}: {cust.name}</p>}
      </div>
      <div className="mt-2 border-t border-dashed border-current pt-2">
        {sale.items.map((i) => (
          <div key={i.productId}><div className="flex justify-between gap-2"><span className="truncate">{i.name} {qtyTimesPrice(i.qty, i.price.toLocaleString("en-KE"), weighedUnit(s, i.productId, i.unit, byWeight))}{i.wholesale ? ` · ${tr("Wholesale")}` : ""}</span><span>{(i.qty * i.price).toLocaleString("en-KE")}</span></div>{i.gas ? <p className="receipt-serials">{i.gas.mode === "refill" ? tr("Refill") : `${tr("New cylinder")} · ${tr("deposit")} ${i.gas.deposit.toLocaleString("en-KE")} ${tr("each")}`}</p> : null}{i.serials?.length ? <p className="receipt-serials">{i.serials.join(", ")}{i.warrantyUntil ? ` · ${tr("Warranty until")} ${new Date(i.warrantyUntil).toLocaleDateString("en-GB")}` : ""}</p> : null}</div>
        ))}
      </div>
      <div className="mt-2 border-t border-dashed border-current pt-2">
        <div className="flex justify-between"><span>{tr("Subtotal")}</span><span>{money(sale.subtotal)}</span></div>
        {sale.discount > 0 && <div className="flex justify-between"><span>{tr("Discount")}</span><span>− {money(sale.discount)}</span></div>}
        {!!sale.vat && <div className="flex justify-between"><span>{tr("VAT")}</span><span>{money(sale.vat)}</span></div>}
        <div className="flex justify-between font-bold"><span>{tr("TOTAL")}</span><span>{money(sale.total)}</span></div>
        {erp.payLines(s, sale.pay).map(([m, v]) => <div key={m} className="flex justify-between"><span>{m === "credit" ? tr("On credit") : erp.methodLabel(m, s, tr)}</span><span>{money(v)}</span></div>)}
        {erp.saleBalance(s, sale) > 0.001 && <div className="flex justify-between font-bold"><span>{tr("Balance due")}</span><span>{money(erp.saleBalance(s, sale))}</span></div>}
        {rets.map((r) => <div key={r.id} className="flex justify-between"><span>{tr("Returned")} {r.ref}</span><span>− {money(r.amount)}</span></div>)}
      </div>
      {paymentLines(tr).map((l) => <p key={l} className="text-center">{l}</p>)}
      <p className="mt-3 text-center">{tr("Thank you!")}</p>
      {cfg.receiptFooter.trim() && <p className="mt-1 whitespace-pre-line text-center">{cfg.receiptFooter.trim()}</p>}
    </div>
  );
}

export function ReceiptSheet({ sale, s, money, tr, shop, onClose, children, live }: { sale: erp.Sale; s: erp.ErpState; money: SCtx["money"]; tr: Tr; shop: string; onClose: () => void; children?: ReactNode; live?: boolean }) {
  const byWeight = useFeature("weight");
  const text = () => [`Zakrio Systems — ${shop}`, `${sale.ref} • ${dt(sale.at)}`, ...sale.items.map((i) => `${i.name} ${qtyTimesPrice(i.qty, String(i.price), weighedUnit(s, i.productId, i.unit, byWeight))}${i.wholesale ? ` (${tr("Wholesale")})` : ""}${i.gas ? ` (${i.gas.mode === "refill" ? tr("Refill") : `${tr("New cylinder")}, ${tr("deposit")} ${i.gas.deposit}`})` : ""} = ${Math.round(i.qty * i.price * 100) / 100}${i.serials?.length ? ` [${i.serials.join(", ")}${i.warrantyUntil ? ` · ${tr("Warranty until")} ${new Date(i.warrantyUntil).toLocaleDateString("en-GB")}` : ""}]` : ""}`), `${tr("TOTAL")} ${money(sale.total)}`, ...erp.payLines(s, sale.pay).map(([m, v]) => `${m === "credit" ? tr("On credit") : erp.methodLabel(m, s, tr)} ${money(v)}`)].join("\n");
  const share = () => { void sharePdfText(`${tr("Receipt")} ${sale.ref}`, text()); };
  const [print, setPrint] = useState<null | "print" | "pdf">(null);
  const [animate] = useState(() => !!live && readSettings().liveReceipt && !(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
  const A = ({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) => <ShopButton variant="outline" className="h-10 flex-col gap-0.5 px-1 text-[11px]" onClick={onClick}>{icon}{label}</ShopButton>;
  return (
    <>
    {print && <PrintPreview title={print === "pdf" ? "Save as PDF" : "Receipt"} onClose={() => setPrint(null)} actions={print === "pdf" ? <p className="text-center text-[11px] text-muted-foreground">{tr("Tap Print, then choose “Save as PDF” as the printer.")}</p> : undefined}><Receipt sale={sale} s={s} money={money} tr={tr} shop={shop} /></PrintPreview>}
    <Sheet title={tr("Receipt")} onClose={onClose}>
      {animate ? <div className="thermal">
        <div className="thermal-head" aria-hidden><span className="thermal-light" /><span className="thermal-slot" /></div>
        <div className="thermal-paper"><Receipt sale={sale} s={s} money={money} tr={tr} shop={shop} /><div className="thermal-tear" aria-hidden /></div>
      </div> : <Receipt sale={sale} s={s} money={money} tr={tr} shop={shop} />}
      <div className="mt-3 grid grid-cols-6 gap-1.5">
        <A label={tr("Print")} icon={<Printer className="h-4 w-4" />} onClick={() => setPrint("print")} />
        <A label="PDF" icon={<FileText className="h-4 w-4" />} onClick={() => setPrint("pdf")} />
        {/* WhatsApp receipt (owner, 2026-11-23): opens WhatsApp to the customer's number with the receipt; no customer: choose the chat. */}
        <A label="WhatsApp" icon={<MessageCircle className="h-4 w-4" />} onClick={() => { const c = sale.customerId ? s.customers.find((x) => x.id === sale.customerId) : undefined; window.open(waLink(text(), c?.phone, store.get()?.country), "_blank", "noopener"); }} />
        {/* SMS receipt (owner, 2026-11-23): opens the phone's own messages app, so it works with no internet. */}
        <A label="SMS" icon={<MessageSquare className="h-4 w-4" />} onClick={() => { const c = sale.customerId ? s.customers.find((x) => x.id === sale.customerId) : undefined; window.location.href = smsLink(text(), c?.phone); }} />
        <A label={tr("Email")} icon={<Mail className="h-4 w-4" />} onClick={() => { void sharePdfText(`${tr("Receipt")} ${sale.ref}`, text()); }} />
        <A label={tr("Share")} icon={<Share2 className="h-4 w-4" />} onClick={share} />
      </div>
      {children}
      <ShopButton className="mt-2 h-10 w-full text-sm" onClick={onClose}>{tr("Exit")}</ShopButton>
    </Sheet>
    </>
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

export function ReturnForm({ sale, s, money, tr, onDone }: { sale: erp.Sale; s: erp.ErpState; money: SCtx["money"]; tr: Tr; onDone: () => void }) {
  const [q, setQ] = useState<Record<string, string>>({});
  const hasCust = !!sale.customerId && s.customers.some((c) => c.id === sale.customerId);
  const [refund, setRefund] = useState<erp.Method>(() => erp.defaultMethod(erp.load()));
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
          {erp.moneyMethods(s).map((m) => <option key={m} value={m}>{erp.methodLabel(m, s, tr)}</option>)}{hasCust && <option value="credit">{tr("Customer credit")}</option>}
        </select>
      </Label>
      <div className="flex justify-between text-sm font-bold"><span>{tr("Refund")}</span><span>{money(amount)}</span></div>
      <ShopButton className="h-10 text-sm" onClick={() => { if (run(() => erp.returnSale(sale.id, sale.items.map((i) => ({ productId: i.productId, qty: erp.roundQty(+(q[i.productId] ?? 0) || 0) })), refund), tr("Return recorded")) !== undefined) onDone(); }}>{tr("Confirm Return")}</ShopButton>
    </div>
  );
}

export function ReturnsList({ s, money, tr }: SCtx) {
  const refunded = s.returns.filter((r) => r.refund !== "credit").reduce((a, r) => a + r.amount, 0);
  const credit = s.returns.filter((r) => r.refund === "credit").reduce((a, r) => a + r.amount, 0);
  const touched = s.sales.filter((x) => erp.returnStatus(x) !== "NOT RETURNED");
  return (
    <div>
      <KpiRow className="mb-3">
        <Kpi tone="info" label={tr("Sales returns")} value={s.returns.length} />
        <Kpi tone="info" label={tr("Purchase returns")} value={<span title={tr("Not available yet")}>—</span>} />
        <Kpi tone="bad" label={tr("Refunded")} value={money(refunded)} />
        <Kpi tone="warn" label={tr("Credit")} value={money(credit)} />
      </KpiRow>
      {touched.length > 0 && <p className="mb-2 text-[11px] text-muted-foreground">{touched.map((x) => `${x.ref} • ${tr(erp.returnStatus(x))}`).join("  |  ")}</p>}
      <p className="mb-2 text-xs text-muted-foreground">{tr("To return items, open the original sale in Sales and tap Return items.")}</p>
      {s.returns.length === 0 && <Empty>{tr("No returns yet")}</Empty>}
      {s.returns.map((r) => (
        <div key={r.id} className="border-b border-border py-2.5 text-sm">
          <div className="flex justify-between"><b>{r.ref}</b><span>{money(r.amount)}</span></div>
          <p className="text-[11px] text-muted-foreground">{tr("Original")}: {r.saleRef} • {r.items.map((i) => `${i.name} × ${i.qty}`).join(", ")} • {r.refund === "credit" ? tr("Customer credit") : tr(erp.methodName(r.refund))} • {dt(r.at)}</p>
        </div>
      ))}
    </div>
  );
}

// ---------------- CUSTOMERS ----------------
export function Customers({ s, money, tr }: SCtx) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [amt, setAmt] = useState(""); const [method, setMethod] = useState<erp.Method>(() => erp.defaultMethod(erp.load()));
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
          <Kpi tone={c.balance >= 0 ? "warn" : "good"} label={tr(c.balance >= 0 ? "Outstanding balance" : "Credit in favour")} value={money(Math.abs(c.balance))} />
          {c.balance > 0 && (
            <div className="mt-3 flex gap-2">
              <input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} placeholder={tr("Amount")} className={inputCls} />
              <select value={method} onChange={(e) => setMethod(e.target.value as erp.Method)} className={cn(inputCls, "w-28")}>{erp.moneyMethods(s).map((m) => <option key={m} value={m}>{tr(erp.methodName(m, s))}</option>)}</select>
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
          <span>{p.ref} • {tr(erp.methodName(p.method))} • {tr(p.kind === "SALE" ? "Sale" : p.kind === "DEBT" ? "Debt payment" : "Refund")}<span className="block text-[11px] text-muted-foreground">{p.source} • {dt(p.at)}</span></span>
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
  // Money received by each of the business's methods, in its order; what is still owed is reported apart (`onCredit`), never as a method.
  const byMethod: Record<string, number> = Object.fromEntries(erp.moneyMethods(s).map((m) => [m, 0]));
  let onCredit = 0;
  sales.forEach((x) => erp.payParts(x.pay).forEach(([m, v]) => { if (m === "credit") onCredit += v; else byMethod[m] = (byMethod[m] ?? 0) + v; }));
  const top = new Map<string, number>();
  sales.forEach((x) => x.items.forEach((i) => top.set(i.name, (top.get(i.name) ?? 0) + i.qty - i.returned)));
  return { count: sales.length, gross, returned, net: gross - returned, profit: gross - returned - cost, byMethod, onCredit, top: [...top].sort((a, b) => b[1] - a[1]).slice(0, 5) };
}

export function SalesReport({ s, money, tr, onlyChannel, period }: SCtx & { onlyChannel?: "POS"; period?: HeaderPeriod }) {
  const [range, setRange] = useState<"today" | "7d" | "all">("today");
  const since = period ? period.range.from : range === "today" ? new Date(new Date().toDateString()).getTime() : range === "7d" ? Date.now() - 7 * 864e5 : 0;
  const until = period ? period.range.to : Infinity;
  const st = salesStats(s, (x) => x.at >= since && x.at <= until && (!onlyChannel || x.channel === onlyChannel));
  return (
    <div>
      {!period && <Tabs small items={["today", "7d", "all"]} value={range} onChange={(v) => { if (v === "today" || v === "7d" || v === "all") setRange(v); }} tr={(r) => tr(r === "today" ? "Today" : r === "7d" ? "Last 7 days" : "All time")} />}
      <KpiRow>
        <Kpi tone="good" label={tr("Sales")} value={st.count} />
        <Kpi tone="good" label={tr("Net sales")} value={money(st.net)} />
        <Kpi tone="bad" label={tr("Returns")} value={money(st.returned)} />
        <Kpi tone="profit" label={tr("Gross profit")} value={money(st.profit)} />
      </KpiRow>
      <Title>{tr("By payment")}</Title>
      <KpiRow>{Object.entries(st.byMethod).map(([m, v]) => <Kpi key={m} label={erp.methodLabel(m, s, tr)} value={money(v)} />)}<Kpi tone="warn" label={tr("On credit (unpaid)")} value={money(st.onCredit)} /></KpiRow>
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
        <Kpi tone="good" label={tr("Today's sales")} value={money(st.net)} />
        <Kpi tone="info" label={tr("Transactions")} value={st.count} />
        <Kpi tone="warn" label={tr("Customer debt")} value={money(owed)} />
        <Kpi tone="bad" label={tr("Returns today")} value={money(st.returned)} />
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
      <Tabs small items={["OPENING CASH", "CASH IN", "CASH OUT", "CASH UP", "CASH HISTORY"]} value={view} onChange={(v) => { if (v === "OPENING CASH" || v === "CASH IN" || v === "CASH OUT" || v === "CASH UP" || v === "CASH HISTORY") setView(v); }} tr={tr} />
      <KpiRow>
        <Kpi tone="info" label={tr("Opening Cash")} value={money(cs.opening)} />
        <Kpi tone="good" label={tr("Cash Sales")} value={money(cs.sales)} />
        <Kpi tone="bad" label={tr("Cash Refunds")} value={money(cs.refunds)} />
        <Kpi tone="good" label={tr("Cash In")} value={money(cs.cin)} />
        <Kpi tone="bad" label={tr("Cash Out")} value={money(cs.cout)} />
        <Kpi tone="info" label={tr("Expected Cash")} value={money(cs.expected)} />
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
