import { ModuleCharts } from "@/components/shopbook/analytics-charts";
import { CounterPicker } from "@/components/shopbook/counter-picker";
import { usePeriod } from "@/lib/period";
import { createFileRoute } from "@tanstack/react-router";
import { startView, viewSearch } from "@/lib/deep-link";
import { useState } from "react";
import { Banknote, Smartphone, Landmark, Wallet, ArrowRightLeft, WalletCards } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useShopErp } from "@/components/shopbook/product-search";
import { dt, moneyFor, run, useAccount } from "@/components/shopbook/selling";
import { ErpShell, Empty } from "@/components/shopbook/erp-shell";
import { ActivityList, AmountRow, MoneyDetail } from "@/components/shopbook/money-ui";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import { PayPicker, emptyPay } from "@/components/shopbook/pay-picker";
import { PaymentMethodsManager } from "@/components/shopbook/payment-methods";
import { moneyActivity, type MoneyActivity } from "@/lib/money-activity";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";

export const Route = createFileRoute("/float")({ head: () => ({ meta: [
  { title: "Float — DataQuill Solutions" }, { name: "description", content: "Compact Cash, M-Pesa and Bank activity, internal transfers, owner capital and daily cash-up." },
  { property: "og:title", content: "Float — DataQuill Solutions" }, { property: "og:description", content: "Track your real business money and reconcile the cash drawer." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), validateSearch: viewSearch, component: Float });
const MENUS: Record<string, readonly string[]> = {
  Overview: [], Cash: ["Balance", "Cash in", "Cash out", "History"], "M-Pesa": ["Balance", "Money in", "Money out", "History"], Bank: ["Balance", "Money in", "Money out", "History"],
  "Other Accounts": ["Balances", "Money in", "Money out", "History", "Manage accounts"],
  Transfers: ["New transfer", "History"], "Business Money": ["Owner withdrawal", "Capital in", "History"],
  "Daily Cash-up": ["Opening cash", "Cash count", "Expected cash", "Actual cash", "Variance", "Cash removal", "History"],
};
function Float() {
  const acct = useAccount("growth"), s = useShopErp(); const { tr } = useLanguage(); const per = usePeriod(null);
  // A Dashboard link may name the starting tab (?menu=…&sub=…).
  const search = Route.useSearch();
  const [start] = useState(() => startView(MENUS, search, "Overview"));
  const [menu, setMenu] = useState(start[0]), [sub, setSub] = useState(start[1]);
  const [amount, setAmount] = useState(""), [note, setNote] = useState(""), [counted, setCounted] = useState("");
  const [pay, setPay] = useState(emptyPay()), [from, setFrom] = useState<erp.Method>(() => erp.defaultMethod(erp.load())), [to, setTo] = useState<erp.Method>(() => erp.moneyMethods(erp.load())[1] ?? erp.defaultMethod(erp.load()));
  const [detail, setDetail] = useState<MoneyActivity | null>(null);
  // Other Accounts: the named account being worked on (methods are managed in the shared Payment Methods manager).
  const [other, setOther] = useState("");
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh"), b = fin.floatBalances(s), cs = erp.cashSession(s);
  const rows = moneyActivity(s), account = menu === "M-Pesa" ? "mpesa" : menu === "Bank" ? "bank" : "cash";
  const named = erp.namedAccounts(s).filter((a) => a.active !== false), shown = fin.shownAccounts(s, b);
  // Cash, M-Pesa and Bank have their own menus, shown by the business's name for them; one disabled with nothing in it has no menu.
  const builtInMenu: Record<string, erp.BuiltInMoney> = { Cash: "cash", "M-Pesa": "mpesa", Bank: "bank" };
  const menus = Object.fromEntries(Object.entries(MENUS).filter(([k]) => !builtInMenu[k] || shown.includes(builtInMenu[k]!) || k === menu));
  const menuLabels = Object.fromEntries(Object.entries(builtInMenu).map(([k, m]) => [k, erp.methodLabel(m, s, tr)]));
  const otherId = (named.find((a) => a.id === other) ?? named[0])?.id;
  const label = (m: erp.Method) => erp.methodLabel(m, s, tr);
  const last = s.cash.find((x) => x.type === "CASH UP");
  const go = (m: string) => { setMenu(m); setSub(MENUS[m]?.[0] ?? ""); setAmount(""); setNote(""); };
  const heading = (t: string) => <h2 className="money-heading">{tr(t)}</h2>;
  const list = (rr: MoneyActivity[]) => <ActivityList rows={rr.slice(0, 150)} money={money} tr={tr} onOpen={setDetail} />;
  const amountField = <label className="inventory-field"><span>{tr("Amount")}</span><input aria-label={tr("Amount")} className="inventory-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" /></label>;
  const noteField = <label className="inventory-field"><span>{tr("Reason")}</span><input aria-label={tr("Reason")} className="inventory-input" value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} /></label>;
  const save = (fn: () => void) => run(() => { fn(); setAmount(""); setNote(""); return true; }, tr("Saved"));
  const transfer = <div className="inventory-form">{heading("Transfer between accounts")}<div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2"><select aria-label={tr("From account")} className="inventory-input" value={from} onChange={(e) => setFrom(e.target.value as erp.Method)}>{fin.accounts(s).map((m) => <option key={m} value={m}>{label(m)}</option>)}</select><ArrowRightLeft className="h-3 w-3 text-primary" /><select aria-label={tr("To account")} className="inventory-input" value={to} onChange={(e) => setTo(e.target.value as erp.Method)}>{fin.accounts(s).map((m) => <option key={m} value={m}>{label(m)}</option>)}</select></div>{amountField}<ShopButton className="inventory-save" disabled={!amount || from === to} onClick={() => save(() => fin.floatTransfer(from, to, +amount))}>{tr("Transfer")}</ShopButton></div>;
  const movement = (method: erp.Method, withdrawal: boolean, choose: boolean) => <div className="inventory-form">{heading(sub)}{choose && <PayPicker value={pay} onChange={setPay} total={+amount || 0} money={money} tr={tr} allowCredit={false} />}{amountField}{noteField}<ShopButton className="inventory-save" disabled={!amount || !note.trim()} onClick={() => save(() => fin.floatDeposit(choose && pay.mode !== "ppay" ? pay.mode : method, +amount, withdrawal ? "WITHDRAWAL" : "DEPOSIT", note))}>{tr("Save")}</ShopButton></div>;
  return <ErpShell period={menu === "Overview" ? per : undefined} title="Float" shop={acct.shopName} menus={menus} labels={menuLabels} menu={menu} sub={sub} onMenu={go} onSub={(v) => { setSub(v); setAmount(""); setNote(""); }} deps={s}><div className="money-screen">
    <KpiRow>{shown.includes("cash") && <Kpi label={label("cash")} value={money(b.cash)} tone={b.cash < 0 ? "bad" : "good"} icon={<Banknote />} />}{shown.includes("mpesa") && <Kpi label={label("mpesa")} value={money(b.mpesa)} tone={b.mpesa < 0 ? "bad" : "info"} icon={<Smartphone />} />}{shown.includes("bank") && <Kpi label={label("bank")} value={money(b.bank)} tone={b.bank < 0 ? "bad" : "info"} icon={<Landmark />} />}{shown.some(erp.isAccountMethod) && <Kpi tone="info" label={tr("Other Accounts")} value={money(fin.totalMoney(b) - b.cash - b.mpesa - b.bank)} icon={<WalletCards />} />}<Kpi tone="good" label={tr("Total")} value={money(fin.totalMoney(b))} icon={<Wallet />} /></KpiRow>
    {menu === "Overview" && <><ModuleCharts s={s} module="float" money={money} tr={tr} from={per.range.from} to={per.range.to} />{heading("Money Position")}{shown.map((m) => <ShopButton variant="bare" key={m} className="money-record" onClick={() => { if (erp.isAccountMethod(m)) { go("Other Accounts"); setOther(m); } else go(m === "mpesa" ? "M-Pesa" : m === "bank" ? "Bank" : "Cash"); }}><span className="pur-name">{label(m)}</span><b>{money(fin.balanceOf(b, m))}</b><span>›</span></ShopButton>)}{heading("Recent Money Activity")}{list(rows.slice(0, 10))}</>}
    {["Cash", "M-Pesa", "Bank"].includes(menu) && <>
      {sub === "Balance" && <>{heading(`${label(account)} · ${tr("balance")}`)}<AmountRow label={tr("Current balance")} value={money(b[account])} bold />{heading("Recent Money Activity")}{list(rows.filter((x) => x.method === erp.methodName(account, s)).slice(0, 8))}</>}
      {sub === "History" && list(rows.filter((x) => x.method === erp.methodName(account, s)))}
      {["Cash in", "Money in", "Cash out", "Money out"].includes(sub) && movement(account, sub.endsWith("out"), false)}
    </>}
    {menu === "Other Accounts" && <>
      {sub !== "Manage accounts" && !named.length && <Empty>{tr("No other accounts yet. Add one under Manage accounts")}</Empty>}
      {sub === "Balances" && named.length > 0 && <>{heading("Other Accounts")}{shown.filter(erp.isAccountMethod).map((m) => <AmountRow key={m} label={label(m)} value={money(fin.balanceOf(b, m))} />)}</>}
      {(sub === "Money in" || sub === "Money out") && otherId && <div className="inventory-form">{heading(sub)}<label className="inventory-field"><span>{tr("Account")}</span><select aria-label={tr("Account")} className="inventory-input" value={otherId} onChange={(e) => setOther(e.target.value)}>{named.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label><AmountRow label={tr("Current balance")} value={money(fin.balanceOf(b, otherId))} />{amountField}{noteField}<ShopButton className="inventory-save" disabled={!amount || !note.trim()} onClick={() => save(() => fin.floatDeposit(otherId, +amount, sub === "Money out" ? "WITHDRAWAL" : "DEPOSIT", note))}>{tr("Save")}</ShopButton></div>}
      {sub === "History" && named.length > 0 && list(rows.filter((x) => erp.namedAccounts(s).some((a) => a.name === x.method)))}
      {sub === "Manage accounts" && <div className="inventory-form">{heading("Payment Methods")}<PaymentMethodsManager tr={tr} /></div>}
    </>}
    {menu === "Transfers" && (sub === "History" ? list(rows.filter((x) => x.kind === "TRANSFER")) : transfer)}
    {menu === "Business Money" && (sub === "History" ? list(rows.filter((x) => x.kind === "DEPOSIT" || x.kind === "WITHDRAWAL")) : movement("cash", sub === "Owner withdrawal", true))}
    {menu === "Daily Cash-up" && <>
      {sub === "Opening cash" && <div className="inventory-form">{heading(sub)}<AmountRow label={tr("Opening cash")} value={money(cs.opening)} />{amountField}<ShopButton className="inventory-save" disabled={!amount || cs.opening > 0} onClick={() => save(() => erp.cashEvent("OPENING", +amount, "Opening cash"))}>{tr("Save")}</ShopButton></div>}
      {sub === "Expected cash" && <>{heading(sub)}{([["Opening cash", cs.opening], ["Money in", cs.sales + cs.cin], ["Money out", cs.cout + cs.refunds], ["Expected cash", cs.expected]] as [string, number][]).map(([k, v]) => <AmountRow key={k} label={tr(k)} value={money(v)} bold={k === "Expected cash"} />)}</>}
      {sub === "Cash count" && <div className="inventory-form">{heading(sub)}<CounterPicker s={s} /><AmountRow label={tr("Expected cash")} value={money(cs.expected)} /><label className="inventory-field"><span>{tr("Actual cash")}</span><input aria-label={tr("Actual cash")} className="inventory-input" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" /></label>{counted !== "" && <AmountRow label={tr("Variance")} value={money(+counted - cs.expected)} bad={+counted !== cs.expected} />}{noteField}<ShopButton className="inventory-save" disabled={counted === "" || (+counted !== cs.expected && !note.trim())} onClick={() => run(() => { erp.cashUp(+counted, note); setCounted(""); setNote(""); setSub("Actual cash"); return true; }, tr("Saved"))}>{tr("Confirm cash-up")}</ShopButton></div>}
      {(sub === "Actual cash" || sub === "Variance") && <>{heading(sub)}{last ? <><AmountRow label={tr("Expected cash")} value={money(last.expected ?? 0)} /><AmountRow label={tr("Actual cash")} value={money(last.counted ?? 0)} /><AmountRow label={tr("Variance")} value={money(last.amount)} bad={last.amount !== 0} /><AmountRow label={tr("Date")} value={dt(last.at)} /><AmountRow label={tr("User")} value={last.user} /><p className="py-2">{last.note}</p></> : <Empty>{tr("No records yet")}</Empty>}</>}
      {sub === "Cash removal" && transfer}
      {sub === "History" && <>{heading("Cash-up history")}{s.cash.filter((x) => x.type === "CASH UP").map((x) => <div key={x.id} className="money-audit"><span>{dt(x.at)}</span><span>{tr("Expected cash")} {money(x.expected ?? 0)}</span><span>{tr("Actual cash")} {money(x.counted ?? 0)}</span><b className={x.amount ? "text-warning" : "text-primary"}>{money(x.amount)}</b><span>{x.user}</span><span>{x.note}</span></div>)}</>}
    </>}
    {detail && <MoneyDetail row={detail} shop={acct.shopName} money={money} tr={tr} onClose={() => setDetail(null)} />}
  </div></ErpShell>;
}
