import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShopButton } from "@/components/ui/shop-button";
import { useErp, inputCls } from "@/components/shopbook/product-search";
import { AppShell, Empty, Title, dt, moneyFor, run, useAccount } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import { PERIODS, periodStart, type Period } from "@/lib/summary";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/expenses")({
  head: () => ({ meta: [
    { title: "Expenses — SHOPBOOK ERP" },
    { name: "description", content: "Record shop expenses by category and payment account." },
    { property: "og:title", content: "Expenses — SHOPBOOK ERP" },
    { property: "og:description", content: "Track rent, transport, bills and other shop costs." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Expenses,
});

const TABS = ["Add expense", "History", "Categories"];

function Expenses() {
  const acct = useAccount("plus");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState(TABS[0]!);
  const [period, setPeriod] = useState<Period>("Month");
  const [f, setF] = useState({ category: "Rent", amount: "", method: "cash" as erp.Method, note: "" });
  const [cat, setCat] = useState("");
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh");
  const from = periodStart(period);
  const list = s.expenses.filter((x) => x.at >= from);
  const total = list.reduce((a, x) => a + x.amount, 0);
  const byCat = new Map<string, number>(); list.forEach((x) => byCat.set(x.category, (byCat.get(x.category) ?? 0) + x.amount));
  const top = [...byCat].sort((a, b) => b[1] - a[1])[0];
  return (
    <AppShell title="Expenses" tabs={TABS} tab={tab} setTab={setTab}>
      <div className="mb-2 flex gap-1 overflow-x-auto [scrollbar-width:none]">{PERIODS.map((p) => <button key={p} onClick={() => setPeriod(p)} className={cn("shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold", period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{tr(p).toUpperCase()}</button>)}</div>
      <KpiRow>
        <Kpi label={tr("Expenses")} value={money(total)} />
        <Kpi label={tr("Entries")} value={list.length} />
        <Kpi label={tr("Top category")} value={top ? tr(top[0]) : "—"} />
        <Kpi label={tr("Cash")} value={money(list.filter((x) => x.method === "cash").reduce((a, x) => a + x.amount, 0))} />
      </KpiRow>
      <div className="mt-4">
        {tab === "Add expense" && <div className="grid gap-2">
          <select className={inputCls} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{fin.expenseCategories(s).map((c) => <option key={c} value={c}>{tr(c)}</option>)}</select>
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} inputMode="decimal" placeholder={tr("Amount")} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
            <select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as erp.Method })}>{fin.ACCOUNTS.map((m) => <option key={m} value={m}>{tr(erp.METHOD_LABEL[m])}</option>)}</select>
          </div>
          <input className={inputCls} placeholder={tr("Note (optional)")} maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <ShopButton onClick={() => run(() => fin.addExpense({ category: f.category, amount: +f.amount, method: f.method, note: f.note }), tr("Expense recorded")) !== undefined && setF({ ...f, amount: "", note: "" })}>{tr("Save expense")}</ShopButton>
          <Title>{tr("By category")}</Title>
          {byCat.size === 0 ? <Empty>{tr("No expenses yet")}</Empty> : [...byCat].map(([k, v]) => <div key={k} className="flex justify-between border-b border-border py-2 text-sm"><span>{tr(k)}</span><b>{money(v)}</b></div>)}
        </div>}
        {tab === "History" && (list.length === 0 ? <Empty>{tr("No expenses yet")}</Empty> : list.map((x) => (
          <div key={x.id} className="flex justify-between border-b border-border py-2.5 text-sm"><span><b>{x.ref} • {tr(x.category)}</b><span className="block text-[11px] text-muted-foreground">{dt(x.at)} • {tr(erp.METHOD_LABEL[x.method])}{x.note ? ` • ${x.note}` : ""}</span></span><span className="tabular-nums">{money(x.amount)}</span></div>
        )))}
        {tab === "Categories" && <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><input className={inputCls} placeholder={tr("New category")} value={cat} onChange={(e) => setCat(e.target.value)} /><ShopButton className="h-11 px-3 text-sm" onClick={() => run(() => fin.addExpenseCategory(cat), tr("Saved")) !== undefined && setCat("")}>{tr("Add")}</ShopButton></div>
          <Title>{tr("Categories")}</Title>
          {fin.expenseCategories(s).map((c) => <div key={c} className="border-b border-border py-2 text-sm">{tr(c)}</div>)}
        </>}
      </div>
    </AppShell>
  );
}
