// The one payment chooser for every money screen: the business's own payment methods (Settings › Finance › Payment Methods, in its order),
// then the two payment states, Credit (nothing paid now) and Partial Payment (some paid by real methods, the rest owed), kept apart.
import { cn } from "@/lib/utils";
import { Badge } from "@/components/shopbook/erp-shell";
import { ShopButton } from "@/components/ui/shop-button";
import { useBusinessErp } from "@/components/shopbook/product-search";
import type { KeyboardEvent } from "react";
import { defaultMethod, emptyPayRecord, load, methodName, moneyMethods, paidAmount, type Method, type MoneyMethod, type PayRecord } from "@/lib/erp";

export type PayMode = Method | "ppay";
export type PayState = { mode: PayMode; split: Record<string, string>; received: string };
/** A fresh picker. With no mode it starts on the business's first payment method in use. */
export const emptyPay = (mode?: PayMode): PayState => ({ mode: mode ?? defaultMethod(load()), split: {}, received: "" });

/** Turns the picker state into the shared pay record; whatever is unpaid lands on credit. Only accounts given an amount appear in it. */
export function payRecord(p: PayState, total: number): PayRecord {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pay = emptyPayRecord();
  if (p.mode === "ppay") {
    for (const [m, v] of Object.entries(p.split)) {
      const amt = r2(Math.max(0, +v || 0));
      if (m === "cash" || m === "mpesa" || m === "bank") pay[m] = amt;
      else if (m.startsWith("acct-") && amt > 0) pay[m as `acct-${string}`] = amt;
    }
  } else if (p.mode !== "credit") pay[p.mode] = r2(total);
  pay.credit = r2(Math.max(0, total - paidAmount({ ...pay, credit: 0 })));
  return pay;
}
export const paidOf = (pay: PayRecord) => paidAmount(pay);

export function PayPicker({ value, onChange, total, money, tr, allowCredit = true, allowPartial = allowCredit, creditNote }: {
  value: PayState; onChange: (p: PayState) => void; total: number; money: (n: number) => string; tr: (t: string) => string; allowCredit?: boolean; allowPartial?: boolean; creditNote?: string | undefined;
}) {
  const s = useBusinessErp(), money_ = moneyMethods(s); // the open business's own methods
  // A screen reopened with a retired account still shows it, so nothing chosen silently disappears.
  const live: MoneyMethod[] = value.mode !== "ppay" && value.mode !== "credit" && !money_.includes(value.mode) ? [...money_, value.mode] : money_;
  const pay = payRecord(value, total);
  const paid = paidOf(pay);
  const over = value.mode === "ppay" && paid > total + 0.001;
  const change = value.mode === "cash" && value.received !== "" ? +value.received - total : null;
  const status = over ? null : pay.credit > 0.001 ? (paid > 0 ? "Partially Paid" : "Unpaid") : "Paid";
  const states: PayMode[] = [...(allowCredit ? ["credit" as const] : []), ...(allowPartial ? ["ppay" as const] : [])];
  const opts: PayMode[] = [...live, ...states];
  // Custom names are the business's own words and are shown as typed; the default names are translated.
  const label = (m: PayMode) => (m === "ppay" ? tr("Partial Payment") : m === "credit" ? tr("Credit") : s.moneyAccounts?.some((a) => a.id === m) ? methodName(m, s) : tr(methodName(m, s)));
  const hint = (m: PayMode) => (m === "credit" ? tr("Nothing paid now: the whole bill is owed") : m === "ppay" ? tr("Pay part now with your methods; the rest is owed") : !money_.includes(m as MoneyMethod) ? `${label(m)} · ${tr("not in use")}` : label(m));
  // Arrow keys move between every choice, as in any radio group; the chosen one is the one Tab lands on.
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : e.key === "Home" ? -Infinity : e.key === "End" ? Infinity : 0;
    if (!step) return;
    e.preventDefault();
    const group = e.currentTarget;
    const i = Math.max(0, opts.indexOf(value.mode)), next = step === -Infinity ? 0 : step === Infinity ? opts.length - 1 : (i + step + opts.length) % opts.length;
    const o = opts[next]; if (o === undefined) return;
    onChange({ ...value, mode: o });
    requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-pay="${o}"]`)?.focus());
  };
  const chip = (o: PayMode, state = false) => <ShopButton variant="bare" key={o} role="radio" data-pay={o} aria-checked={value.mode === o} tabIndex={value.mode === o || (!opts.includes(value.mode) && o === opts[0]) ? 0 : -1} title={hint(o)}
    onClick={() => onChange({ ...value, mode: o })} className={cn("pay-chip", state && "pay-state-chip", value.mode === o && "pay-on")}>{label(o)}</ShopButton>;
  return <div className="grid gap-1.5">
    <p className="inventory-field" id="pay-method-label">{tr("Payment Method")} <span className="text-destructive">*</span></p>
    <div role="radiogroup" aria-label={tr("Payment Method")} className="pay-picker" onKeyDown={onKey}>
      <div className="pay-strip">{live.map((o) => chip(o))}</div>
      {states.length > 0 && <div className="pay-states" role="presentation"><span className="pay-states-label">{tr("Not fully paid")}</span>{states.map((o) => chip(o, true))}</div>}
    </div>
    {value.mode === "cash" && <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5"><span className="text-[11px]">{tr("Money given")}</span><input aria-label={tr("Money given")} className="inventory-input" inputMode="decimal" placeholder={String(total)} value={value.received} onChange={(e) => onChange({ ...value, received: e.target.value })} /><ShopButton variant="outline" className="h-8 px-2 text-[11px]" onClick={() => onChange({ ...value, received: String(total) })}>{tr("MAX")}</ShopButton></div>}
    {value.mode === "ppay" && <div className="inventory-box mt-0 grid gap-1.5">
      <p className="text-[11px] font-bold">{tr("Partial Payment")} · {tr("amount paid by each method")}</p>
      <div className="ppay-cards">
        {money_.map((m) => <label key={m} className="ppay-card"><span>{label(m)}</span><input aria-label={`${tr("Partial Payment")} · ${label(m)}`} className="inventory-input" inputMode="decimal" placeholder="0" value={value.split[m] ?? ""} onChange={(e) => onChange({ ...value, split: { ...value.split, [m]: e.target.value } })} /></label>)}
        {allowCredit && <div className="ppay-card"><span>{tr("Owed (credit)")}</span><span className="inventory-input flex items-center tabular-nums text-warning">{pay.credit.toLocaleString("en-KE")}</span></div>}
      </div>
    </div>}
    <div className="pur-totals">
      <span>{tr("Total bill")}</span><b>{money(total)}</b>
      {change !== null && <><span>{tr("Cash tendered")}</span><b>{money(+value.received || 0)}</b></>}
      <span>{tr("Total Paid")}</span><b>{money(paid)}</b>
      <span>{tr(pay.credit > 0.001 ? "Balance due (customer credit)" : "Balance due")}</span><b className={cn(pay.credit > 0 && "text-warning")}>{money(pay.credit)}</b>
      {change !== null && change > 0 && <><span>{tr("Change")}</span><b className="text-primary">{money(change)}</b></>}
      {status && <><span>{tr("Status")}</span><span className="justify-self-end"><Badge s={status === "Partially Paid" ? "P.PAY" : status === "Unpaid" ? "Credit" : "Paid"} /> <small className="ms-1 text-[11px] font-semibold">{tr(status.toUpperCase())}</small></span></>}
    </div>
    {over && <p className="text-[11px] text-destructive">{tr("Payments exceed the total")}</p>}
    {change !== null && change < -0.001 && <p className="text-[11px] text-destructive">{tr("Cash received is less than the total — use Partial Payment")}</p>}
    {pay.credit > 0.001 && creditNote && <p className="text-[11px] text-warning">{tr(creditNote)}</p>}
  </div>;
}
/** True when the picker holds something that can't be saved. */
export const payInvalid = (p: PayState, total: number) => { const pay = payRecord(p, total); return paidOf(pay) > total + 0.001 || (p.mode === "cash" && p.received !== "" && +p.received < total - 0.001); };
