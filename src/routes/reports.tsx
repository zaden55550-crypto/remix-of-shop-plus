import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShopButton } from "@/components/ui/shop-button";
import { useErp, inputCls } from "@/components/shopbook/product-search";
import { AppShell, Empty, Title, moneyFor, useAccount } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import { buildReport, REPORT_TYPES, toCsv, type ReportType } from "@/lib/reports";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [
    { title: "Reports — SHOPBOOK ERP" },
    { name: "description", content: "Sales, inventory, returns and commission reports with a report builder and CSV export." },
    { property: "og:title", content: "Reports — SHOPBOOK ERP" },
    { property: "og:description", content: "Build, save and export reports from your recorded shop data." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Reports,
});

const TABS = ["Overview", "Sales", "Inventory", "Returns", "Commission", "Builder"];
const SAVED = "shopbook.savedReports";
type Saved = { name: string; type: ReportType; days: number };
const iso = (n: number) => new Date(n).toISOString().slice(0, 10);

function Reports() {
  const acct = useAccount("plus");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState("Overview");
  const [from, setFrom] = useState(iso(Date.now() - 29 * 864e5));
  const [to, setTo] = useState(iso(Date.now()));
  const [type, setType] = useState<ReportType>("Sales");
  const [saved, setSaved] = useState<Saved[]>([]);
  useEffect(() => { try { setSaved(JSON.parse(localStorage.getItem(SAVED) || "[]")); } catch { setSaved([]); } }, []);
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh");
  const range = { from: new Date(from).getTime(), to: new Date(to).getTime() + 86399999 };
  const active: ReportType = tab === "Builder" || tab === "Overview" ? type : (tab as ReportType);
  const rep = buildReport(s, tab === "Overview" ? "Overview" : active, range);
  const fmt = (v: number | string, money_: boolean) => (typeof v === "number" && money_ ? money(v) : String(v));
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(rep)], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = `shopbook-${rep.title.toLowerCase().replace(/\s+/g, "-")}-${from}-${to}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  const save = () => {
    const days = Math.max(1, Math.round((range.to - range.from) / 864e5));
    const next = [{ name: `${tr(type)} • ${days}d`, type, days }, ...saved.filter((x) => !(x.type === type && x.days === days))].slice(0, 10);
    setSaved(next); localStorage.setItem(SAVED, JSON.stringify(next));
  };
  return (
    <AppShell title="Reports" tabs={TABS} tab={tab} setTab={setTab}>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <input type="date" aria-label={tr("From")} className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" aria-label={tr("To")} className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {tab === "Builder" && <div className="mb-3 grid gap-2">
        <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as ReportType)}>{REPORT_TYPES.map((r) => <option key={r} value={r}>{tr(r)}</option>)}</select>
        <div className="grid grid-cols-2 gap-2"><ShopButton variant="outline" onClick={save}>{tr("Save report")}</ShopButton><ShopButton onClick={exportCsv}>{tr("Export CSV")}</ShopButton></div>
        {saved.length > 0 && <div className="flex gap-2 overflow-x-auto">{saved.map((x) => (
          <button key={x.name} className="shrink-0 rounded-full border border-border px-3 py-1 text-xs" onClick={() => { setType(x.type); setFrom(iso(Date.now() - x.days * 864e5)); setTo(iso(Date.now())); }}>{x.name}</button>
        ))}</div>}
      </div>}
      <KpiRow>{rep.kpis.map((k) => <Kpi key={k.label} label={tr(k.label)} value={k.value === null ? <span title={tr("Not available yet")}>—</span> : fmt(k.value, k.money)} />)}</KpiRow>
      <Title>{tr(rep.title)}</Title>
      {rep.rows.length === 0 ? <Empty>{tr("No records in this period")}</Empty> : rep.rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border py-2 text-sm">
          <span className="truncate">{r.label}{r.note && <span className="block text-[11px] text-muted-foreground">{tr(r.note)}</span>}</span>
          <b className="whitespace-nowrap tabular-nums">{fmt(r.value, rep.money)}</b>
        </div>
      ))}
      {tab !== "Builder" && rep.rows.length > 0 && <ShopButton variant="outline" className="mt-4" onClick={exportCsv}>{tr("Export CSV")}</ShopButton>}
    </AppShell>
  );
}
