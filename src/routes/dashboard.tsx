import { createFileRoute } from "@tanstack/react-router";
import { AppShell, Empty, Title, moneyFor, useAccount } from "@/components/shopbook/selling";
import { useErp } from "@/components/shopbook/product-search";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import { dashboardTotals } from "@/lib/dashboard";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — SHOPBOOK ERP" },
    { name: "description", content: "Your SHOPBOOK sales, purchases, expenses, profit and stock overview." },
    { property: "og:title", content: "Dashboard — SHOPBOOK ERP" },
    { property: "og:description", content: "A compact overview of your shop’s financial and inventory totals." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

function Dashboard() {
  const account = useAccount("basic");
  const s = useErp();
  const { tr } = useLanguage();
  if (!account) return <main className="app-screen" />;
  const totals = dashboardTotals(s);
  const money = moneyFor(account.currency || "KSh");
  const metrics = [
    ["Sales", totals.sales], ["Purchases", totals.purchases],
    ["Expenses", totals.expenses], ["Profit", totals.profit], ["Stock", totals.stock],
  ] as const;
  return (
    <AppShell title="Dashboard" tabs={["Overview"]} tab="Overview" setTab={() => {}}>
      <p className="mb-2 text-xs text-muted-foreground">{tr("All time")}</p>
      <KpiRow>
        {metrics.map(([label, value]) => <Kpi key={label} label={tr(label)} value={value === null ? <span title={tr("Not available yet")}>—</span> : money(value)} />)}
      </KpiRow>
      <Title>{tr("Recent sales")}</Title>
      {s.sales.length === 0 ? <Empty>{tr("No sales yet")}</Empty> : s.sales.slice(0, 5).map(sale => (
        <div key={sale.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3 text-sm">
          <div className="min-w-0"><p className="truncate font-semibold">{sale.ref}</p><p className="text-xs text-muted-foreground">{new Date(sale.at).toLocaleDateString()}</p></div>
          <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{money(sale.total)}</span>
        </div>
      ))}
    </AppShell>
  );
}