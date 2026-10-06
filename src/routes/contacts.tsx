import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShopButton } from "@/components/ui/shop-button";
import { useErp, inputCls } from "@/components/shopbook/product-search";
import { AppShell, Empty, Title, dt, moneyFor, run, useAccount, type Tr } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import { SupplierList } from "@/routes/purchases";

export const Route = createFileRoute("/contacts")({
  head: () => ({ meta: [
    { title: "Contacts — SHOPBOOK ERP" },
    { name: "description", content: "Customers and suppliers with balances, statements and payments." },
    { property: "og:title", content: "Contacts — SHOPBOOK ERP" },
    { property: "og:description", content: "One list of customers and suppliers shared by every SHOPBOOK app." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Contacts,
});

const TABS = ["Customers", "Suppliers", "Statements"];
type P = { s: erp.ErpState; money: (n: number) => string; tr: Tr };

function Contacts() {
  const acct = useAccount("plus");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState(TABS[0]!);
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh");
  const recv = s.customers.reduce((a, c) => a + Math.max(0, c.balance), 0);
  return (
    <AppShell title="Contacts" tabs={TABS} tab={tab} setTab={setTab}>
      <KpiRow>
        <Kpi label={tr("Customers")} value={s.customers.length} />
        <Kpi label={tr("Suppliers")} value={s.suppliers.length} />
        <Kpi label={tr("Receivables")} value={money(recv)} tone={recv > 0 ? "warn" : undefined} />
        <Kpi label={tr("Payables")} value={money(fin.purchaseTotals(s).payables)} />
      </KpiRow>
      <div className="mt-4">
        {tab === "Customers" && <Customers s={s} money={money} tr={tr} />}
        {tab === "Suppliers" && <SupplierList s={s} money={money} tr={tr} />}
        {tab === "Statements" && <Statements s={s} money={money} tr={tr} />}
      </div>
    </AppShell>
  );
}

function Customers({ s, money, tr }: P) {
  const [f, setF] = useState({ name: "", phone: "" });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [m, setM] = useState<erp.Method>("cash");
  const [amt, setAmt] = useState("");
  return (<>
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
      <input className={inputCls} placeholder={tr("Customer name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <input className={inputCls} placeholder={tr("Phone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <ShopButton className="h-11 px-3 text-sm" onClick={() => run(() => erp.addCustomer(f.name, f.phone), tr("Customer added")) && setF({ name: "", phone: "" })}>{tr("Add")}</ShopButton>
    </div>
    <Title>{tr("Customers")}</Title>
    {s.customers.length === 0 ? <Empty>{tr("No customers yet")}</Empty> : s.customers.map((c) => (
      <div key={c.id} className="border-b border-border py-2.5 text-sm">
        <div className="flex justify-between"><span><b>{c.name}</b>{c.phone && <span className="block text-[11px] text-muted-foreground">{c.phone}</span>}</span><span className={c.balance > 0 ? "text-warning" : ""}>{money(c.balance)}</span></div>
        {c.balance > 0.001 && (payFor === c.id ? <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
          <select className={inputCls} value={m} onChange={(e) => setM(e.target.value as erp.Method)}>{fin.ACCOUNTS.map((k) => <option key={k} value={k}>{tr(erp.METHOD_LABEL[k])}</option>)}</select>
          <input className={inputCls} inputMode="decimal" placeholder={tr("Amount")} value={amt} onChange={(e) => setAmt(e.target.value)} />
          <ShopButton className="h-11 px-3 text-sm" onClick={() => { if (run(() => erp.receiveDebt(c.id, +amt, m), tr("Payment recorded")) !== undefined) { setPayFor(null); setAmt(""); } }}>{tr("Receive")}</ShopButton>
        </div> : <ShopButton variant="outline" className="mt-2 h-9 text-sm" onClick={() => setPayFor(c.id)}>{tr("Receive payment")}</ShopButton>)}
      </div>
    ))}
  </>);
}

function Statements({ s, money, tr }: P) {
  const [id, setId] = useState("");
  const [kind, id2] = id.split(":");
  const rows: { at: number; label: string; amount: number }[] = [];
  if (kind === "c") {
    const cu = s.customers.find((x) => x.id === id2);
    s.sales.filter((x) => x.customerId === id2).forEach((x) => rows.push({ at: x.at, label: `${x.ref} • ${tr("Sale")}`, amount: x.pay.credit }));
    s.payments.filter((p) => p.customerId === id2 && p.kind === "DEBT").forEach((p) => rows.push({ at: p.at, label: `${p.ref} • ${tr("Payment")}`, amount: -p.amount }));
    s.returns.filter((r) => r.refund === "credit" && s.sales.find((x) => x.id === r.saleId)?.customerId === id2).forEach((r) => rows.push({ at: r.at, label: `${r.ref} • ${tr("Return")}`, amount: -r.amount }));
    void cu;
  } else if (kind === "s") {
    s.purchases.filter((x) => x.supplierId === id2).forEach((x) => rows.push({ at: x.at, label: `${x.ref} • ${tr("Purchase")}`, amount: x.pay.credit }));
    const n = s.suppliers.find((x) => x.id === id2)?.name;
    s.payments.filter((p) => p.kind === "SUPPLIER PAYMENT" && p.source === n).forEach((p) => rows.push({ at: p.at, label: `${p.ref} • ${tr("Payment")}`, amount: p.amount }));
    s.purchaseReturns.filter((r) => r.refund === "credit" && s.purchases.find((x) => x.id === r.purchaseId)?.supplierId === id2).forEach((r) => rows.push({ at: r.at, label: `${r.ref} • ${tr("Return")}`, amount: -r.amount }));
  }
  rows.sort((a, b) => a.at - b.at);
  let bal = 0;
  return (<>
    <select className={inputCls} value={id} onChange={(e) => setId(e.target.value)}>
      <option value="">{tr("Choose contact")}</option>
      <optgroup label={tr("Customers")}>{s.customers.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}</optgroup>
      <optgroup label={tr("Suppliers")}>{s.suppliers.map((c) => <option key={c.id} value={`s:${c.id}`}>{c.name}</option>)}</optgroup>
    </select>
    <Title>{tr("Statement")}</Title>
    {!id ? null : rows.filter((r) => r.amount).length === 0 ? <Empty>{tr("No records yet")}</Empty> : rows.filter((r) => r.amount).map((r, i) => { bal += r.amount; return (
      <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-border py-2 text-sm"><span className="truncate">{r.label}<span className="block text-[11px] text-muted-foreground">{dt(r.at)}</span></span><span className="tabular-nums">{money(r.amount)}</span><b className="tabular-nums">{money(bal)}</b></div>
    ); })}
  </>);
}
