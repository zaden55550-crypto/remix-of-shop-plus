import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useErp } from "@/components/shopbook/product-search";
import { AppShell, Empty, Title, dt, moneyFor, useAccount } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import { ACCOUNT_INFO, balanceSheet, balances, journal, profitAndLoss, type AccountId } from "@/lib/accounting";
import { PERIODS, periodStart, type Period } from "@/lib/summary";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounting")({
  head: () => ({ meta: [
    { title: "Accounting — SHOPBOOK ERP" },
    { name: "description", content: "Automatic journal, profit and loss, balance sheet and trial balance." },
    { property: "og:title", content: "Accounting — SHOPBOOK ERP" },
    { property: "og:description", content: "Books that write themselves from every SHOPBOOK transaction." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Accounting,
});

const TABS = ["Profit & loss", "Balance sheet", "Trial balance", "Journal"];
const Row = ({ l, v, b }: { l: string; v: string; b?: boolean }) => <div className={cn("flex justify-between border-b border-border py-2 text-sm", b && "font-bold")}><span>{l}</span><span className="tabular-nums">{v}</span></div>;

function Accounting() {
  const acct = useAccount("plus");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState(TABS[0]!);
  const [period, setPeriod] = useState<Period>("Month");
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh");
  const pl = profitAndLoss(s, periodStart(period));
  const bs = balanceSheet(s);
  const j = journal(s);
  const tb = balances(j);
  const an = (id: AccountId) => tr(ACCOUNT_INFO[id].name);
  return (
    <AppShell title="Accounting" tabs={TABS} tab={tab} setTab={setTab}>
      <KpiRow>
        <Kpi label={tr("Net profit")} value={money(pl.net)} tone={pl.net < 0 ? "bad" : undefined} />
        <Kpi label={tr("Assets")} value={money(bs.totalAssets)} />
        <Kpi label={tr("Liabilities")} value={money(bs.totalLiab)} />
        <Kpi label={tr("Entries")} value={j.length} />
      </KpiRow>
      <div className="mt-4">
        {tab === "Profit & loss" && <>
          <div className="mb-3 flex gap-1 overflow-x-auto [scrollbar-width:none]">{PERIODS.map((p) => <button key={p} onClick={() => setPeriod(p)} className={cn("shrink-0 rounded-md px-2.5 py-1 text-[11px] font-bold", period === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{tr(p).toUpperCase()}</button>)}</div>
          <Row l={tr("Sales")} v={money(pl.sales)} />
          <Row l={tr("Sales returns")} v={money(-pl.returns)} />
          <Row l={tr("Cost of goods sold")} v={money(-pl.cogs)} />
          <Row l={tr("Gross profit")} v={money(pl.gross)} b />
          <Row l={tr("Expenses")} v={money(-pl.expenses)} />
          <Row l={tr("Salaries & commission")} v={money(-pl.salaries)} />
          <Row l={tr("Stock adjustments")} v={money(-pl.stockAdj)} />
          <Row l={tr("Net profit")} v={money(pl.net)} b />
        </>}
        {tab === "Balance sheet" && <>
          <Title>{tr("Assets")}</Title>
          {bs.assets.map((a) => <Row key={a.id} l={an(a.id)} v={money(a.value)} />)}
          <Row l={tr("Total")} v={money(bs.totalAssets)} b />
          <Title>{tr("Liabilities")}</Title>
          {bs.liabilities.map((a) => <Row key={a.id} l={an(a.id)} v={money(a.value)} />)}
          <Title>{tr("Equity")}</Title>
          <Row l={tr("Owner equity")} v={money(bs.equity)} />
          <Row l={tr("Retained profit")} v={money(bs.profit)} />
          <Row l={tr("Total")} v={money(bs.totalLiab + bs.equity + bs.profit)} b />
          <p className={cn("mt-2 text-xs", bs.balanced ? "text-primary" : "text-destructive")}>{tr(bs.balanced ? "Books balance" : "Books do not balance")}</p>
        </>}
        {tab === "Trial balance" && <>
          {(Object.keys(ACCOUNT_INFO) as AccountId[]).filter((k) => tb[k].debit || tb[k].credit).map((k) => (
            <div key={k} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b border-border py-2 text-sm"><span className="truncate">{an(k)}</span><span className="tabular-nums">{tb[k].net > 0 ? money(tb[k].net) : ""}</span><span className="tabular-nums text-muted-foreground">{tb[k].net < 0 ? money(-tb[k].net) : ""}</span></div>
          ))}
          {j.length === 0 && <Empty>{tr("No records yet")}</Empty>}
        </>}
        {tab === "Journal" && (j.length === 0 ? <Empty>{tr("No records yet")}</Empty> : j.slice(0, 100).map((e, i) => (
          <div key={i} className="border-b border-border py-2 text-sm">
            <p className="font-semibold">{e.ref} • {tr(e.memo.split(" • ")[0]!)}<span className="ms-2 text-[11px] font-normal text-muted-foreground">{dt(e.at)}</span></p>
            {e.lines.map((l, k) => <div key={k} className="flex justify-between text-[12px]"><span className={l.credit ? "ps-4 text-muted-foreground" : ""}>{an(l.account)}</span><span className="tabular-nums">{l.debit ? money(l.debit) : `(${money(l.credit)})`}</span></div>)}
          </div>
        )))}
      </div>
    </AppShell>
  );
}
