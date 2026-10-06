import { purchaseTotals } from "@/lib/finance";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useErp } from "@/components/shopbook/product-search";
import { AppShell, Empty, Title, moneyFor, useAccount } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { MethodPie, NeedsAttention, TrendBars } from "@/components/shopbook/charts";
import { useLanguage } from "@/hooks/use-language";
import { PERIODS, performance, periodStart, position, trend, type Period } from "@/lib/summary";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/summary")({
  head: () => ({ meta: [
    { title: "Summary — SHOPBOOK ERP" },
    { name: "description", content: "Business performance, sales, inventory, financial position and trends for your shop." },
    { property: "og:title", content: "Summary — SHOPBOOK ERP" },
    { property: "og:description", content: "See how your shop is performing over any period." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Summary,
});

const TABS = ["Business performance", "Sales performance", "Inventory", "Financial position", "Trends"];

function Summary() {
  const acct = useAccount("business");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState(TABS[0] ?? "");
  const [period, setPeriod] = useState<Period>("Month");
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh");
  const p = performance(s, periodStart(period));
  const pos = position(s);
  return (
    <AppShell title="Summary" tabs={TABS} tab={tab} setTab={setTab}>
      {(tab === TABS[0] || tab === TABS[1]) && <div className="mb-3 flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {PERIODS.map((x) => <button key={x} onClick={() => setPeriod(x)} className={cn("shrink-0 rounded-full border border-border px-3 py-1 text-xs font-semibold", period === x && "border-primary bg-primary text-primary-foreground")}>{tr(x).toUpperCase()}</button>)}
      </div>}
      {tab === TABS[0] && <>
        <KpiRow>
          <Kpi label={tr("Sales")} value={money(p.sales)} /><Kpi label={tr("Purchases")} value={money(purchaseTotals(s, periodStart(period)).purchases)} /><Kpi label={tr("Expenses")} value={money(purchaseTotals(s, periodStart(period)).expenses)} />
          <Kpi label={tr("Gross profit")} value={money(p.grossProfit)} /><Kpi label={tr("Stock")} value={money(pos.stock)} />
        </KpiRow>
        <NeedsAttention pos={pos} money={money} tr={tr} />
        <Title>{tr("Business insights")}</Title>
        {p.transactions === 0 ? <Empty>{tr("No sales in this period")}</Empty> : <ul className="space-y-1 text-sm">
          {p.top[0] && <li>{tr("Best seller")}: <b>{p.top[0].name}</b> ({money(p.top[0].value)})</li>}
          <li>{tr("Average sale")}: <b>{money(p.total / p.transactions)}</b></li>
          {p.credit > 0 && <li>{tr("Credit sales")}: <b>{money(p.credit)}</b></li>}
        </ul>}
      </>}
      {tab === TABS[1] && <>
        <KpiRow><Kpi label={tr("Total")} value={money(p.total)} /><Kpi label={tr("Paid")} value={money(p.paid)} /><Kpi label={tr("Credit")} value={money(p.credit)} /><Kpi label={tr("Returns")} value={money(p.returned)} /></KpiRow>
        <Title>{tr("By payment")}</Title><MethodPie by={p.byMethod} money={money} tr={tr} />
        <Title>{tr("Top products")}</Title>
        {p.top.length === 0 ? <Empty>{tr("No sales in this period")}</Empty> : p.top.map((t) => <Row key={t.name} l={`${t.name} × ${t.qty}`} r={money(t.value)} />)}
        <Title>{tr("Sales by seller")}</Title>
        {p.bySeller.map((x) => <Row key={x.name} l={tr(x.name)} r={money(x.value)} />)}
      </>}
      {tab === TABS[2] && <>
        <KpiRow><Kpi label={tr("Products")} value={s.products.length} /><Kpi label={tr("Stock value")} value={money(pos.stock)} /><Kpi label={tr("Low stock")} value={pos.low} tone={pos.low ? "warn" : undefined} /><Kpi label={tr("Out of stock")} value={pos.out} tone={pos.out ? "bad" : undefined} /></KpiRow>
        <Title>{tr("Retail value")}</Title><Row l={tr("At selling price")} r={money(pos.retail)} />
      </>}
      {tab === TABS[3] && <>
        <KpiRow><Kpi label={tr("Stock")} value={money(pos.stock)} /><Kpi label={tr("Receivables")} value={money(pos.receivables)} /><Kpi label={tr("Payables")} value={money(pos.payables)} /><Kpi label={tr("Payroll due")} value={money(pos.payroll)} /></KpiRow>
        <Title>{tr("Customer credit")}</Title><Row l={tr("Owed to customers")} r={money(pos.customerCredit)} />
      </>}
      {tab === TABS[4] && <>
        <Title>{tr("Last 14 days")}</Title><TrendBars data={trend(s, 14)} money={money} />
      </>}
    </AppShell>
  );
}

const Row = ({ l, r }: { l: string; r: string }) => <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border py-2 text-sm"><span className="truncate">{l}</span><b className="tabular-nums">{r}</b></div>;

