import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShopButton } from "@/components/ui/shop-button";
import { useErp, inputCls } from "@/components/shopbook/product-search";
import { AppShell, Empty, Title, dt, moneyFor, run, useAccount } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";

export const Route = createFileRoute("/float")({
  head: () => ({ meta: [
    { title: "Float — SHOPBOOK ERP" },
    { name: "description", content: "Live Cash, M-Pesa and Bank balances from every sale, purchase and expense." },
    { property: "og:title", content: "Float — SHOPBOOK ERP" },
    { property: "og:description", content: "See where your money is and move it between accounts." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Float,
});

const TABS = ["Overview", "Move money", "History"];

function Float() {
  const acct = useAccount("plus");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState(TABS[0]!);
  const [dep, setDep] = useState({ kind: "DEPOSIT" as "DEPOSIT" | "WITHDRAWAL", method: "mpesa" as erp.Method, amount: "", note: "" });
  const [tf, setTf] = useState({ from: "cash" as erp.Method, to: "bank" as erp.Method, amount: "" });
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh");
  const b = fin.floatBalances(s);
  const moves = s.payments.filter((p) => p.method !== "credit");
  return (
    <AppShell title="Float" tabs={TABS} tab={tab} setTab={setTab}>
      <KpiRow>
        <Kpi label={tr("Cash")} value={money(b.cash)} tone={b.cash < 0 ? "bad" : undefined} />
        <Kpi label={tr("M-Pesa")} value={money(b.mpesa)} tone={b.mpesa < 0 ? "bad" : undefined} />
        <Kpi label={tr("Bank")} value={money(b.bank)} tone={b.bank < 0 ? "bad" : undefined} />
        <Kpi label={tr("Total")} value={money(b.cash + b.mpesa + b.bank)} />
      </KpiRow>
      <div className="mt-4">
        {tab === "Overview" && <>
          <Title>{tr("Money in and out")}</Title>
          {fin.ACCOUNTS.map((m) => {
            const rows = moves.filter((p) => p.method === m);
            const inn = rows.filter((p) => p.amount > 0).reduce((a, p) => a + p.amount, 0);
            const out = -rows.filter((p) => p.amount < 0).reduce((a, p) => a + p.amount, 0) + s.payrollPayments.filter((p) => p.method === m).reduce((a, p) => a + p.amount, 0);
            return <div key={m} className="flex justify-between border-b border-border py-2 text-sm"><b>{tr(erp.METHOD_LABEL[m])}</b><span className="text-[12px] text-muted-foreground">{tr("In")} {money(inn)} • {tr("Out")} {money(out)}</span></div>;
          })}
          <p className="mt-3 text-[11px] text-muted-foreground">{tr("Balances update automatically from sales, debt payments, purchases, expenses, payroll and returns.")}</p>
        </>}
        {tab === "Move money" && <div className="grid gap-2">
          <Title>{tr("Deposit or withdraw")}</Title>
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} value={dep.kind} onChange={(e) => setDep({ ...dep, kind: e.target.value as "DEPOSIT" })}><option value="DEPOSIT">{tr("Deposit")}</option><option value="WITHDRAWAL">{tr("Withdrawal")}</option></select>
            <select className={inputCls} value={dep.method} onChange={(e) => setDep({ ...dep, method: e.target.value as erp.Method })}>{fin.ACCOUNTS.map((m) => <option key={m} value={m}>{tr(erp.METHOD_LABEL[m])}</option>)}</select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} inputMode="decimal" placeholder={tr("Amount")} value={dep.amount} onChange={(e) => setDep({ ...dep, amount: e.target.value })} />
            <input className={inputCls} placeholder={tr("Note (optional)")} maxLength={120} value={dep.note} onChange={(e) => setDep({ ...dep, note: e.target.value })} />
          </div>
          <ShopButton onClick={() => run(() => fin.floatDeposit(dep.method, +dep.amount, dep.kind, dep.note), tr("Saved")) !== undefined && setDep({ ...dep, amount: "", note: "" })}>{tr("Save")}</ShopButton>
          <Title>{tr("Transfer between accounts")}</Title>
          <div className="grid grid-cols-3 gap-2">
            <select className={inputCls} value={tf.from} onChange={(e) => setTf({ ...tf, from: e.target.value as erp.Method })}>{fin.ACCOUNTS.map((m) => <option key={m} value={m}>{tr(erp.METHOD_LABEL[m])}</option>)}</select>
            <select className={inputCls} value={tf.to} onChange={(e) => setTf({ ...tf, to: e.target.value as erp.Method })}>{fin.ACCOUNTS.map((m) => <option key={m} value={m}>{tr(erp.METHOD_LABEL[m])}</option>)}</select>
            <input className={inputCls} inputMode="decimal" placeholder={tr("Amount")} value={tf.amount} onChange={(e) => setTf({ ...tf, amount: e.target.value })} />
          </div>
          <ShopButton onClick={() => run(() => fin.floatTransfer(tf.from, tf.to, +tf.amount), tr("Transfer recorded")) !== undefined && setTf({ ...tf, amount: "" })}>{tr("Transfer")}</ShopButton>
        </div>}
        {tab === "History" && (moves.length === 0 ? <Empty>{tr("No records yet")}</Empty> : moves.slice(0, 100).map((p) => (
          <div key={p.id} className="flex justify-between border-b border-border py-2 text-sm"><span><b>{tr(p.kind)}</b><span className="block text-[11px] text-muted-foreground">{p.ref} • {p.source} • {dt(p.at)}</span></span><span className={p.amount < 0 ? "text-destructive tabular-nums" : "tabular-nums"}>{tr(erp.METHOD_LABEL[p.method])} {money(p.amount)}</span></div>
        )))}
      </div>
    </AppShell>
  );
}
