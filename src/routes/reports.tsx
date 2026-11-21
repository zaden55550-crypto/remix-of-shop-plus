import { createFileRoute } from "@tanstack/react-router";
import { startView, viewSearch } from "@/lib/deep-link";
import { useEffect, useState } from "react";
import { Download, Printer, Save, Share2 } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useShopErp } from "@/components/shopbook/product-search";
import { moneyFor, useAccount } from "@/components/shopbook/selling";
import { ErpShell, Tabs } from "@/components/shopbook/erp-shell";
import { Kpi, KpiRow, kpiTone } from "@/components/shopbook/kpi";
import { CompactGraph, ModuleCharts } from "@/components/shopbook/analytics-charts";
import { analyticsRange, localIso, usePeriod, type AnalyticsPeriod } from "@/lib/period";
import { DocHead, DocLine, PrintPreview, sharePdfTable } from "@/components/shopbook/print";
import { useLanguage } from "@/hooks/use-language";
import { usePrefs } from "@/lib/prefs";
import { toCsv } from "@/lib/reports";
import { detailedReport, REPORT_MENUS, reportModule } from "@/lib/analytics-reports";
import { chartSeries } from "@/lib/chart-data";

export const Route = createFileRoute("/reports")({ head: () => ({ meta: [
  { title: "Reports & Charts — Zakrio Systems" }, { name: "description", content: "Compact real-data sales, purchases, stock, expenses, financial, contacts, returns and commission reports with charts and exports." },
  { property: "og:title", content: "Reports & Charts — Zakrio Systems" }, { property: "og:description", content: "Build visual reports from shared Zakrio Systems records." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }), validateSearch: viewSearch, component: Reports });
type Saved = { name: string; menu?: string; sub?: string; type?: string; days?: number };
function Reports() {
  const acct = useAccount("growth"), s = useShopErp(), { tr } = useLanguage(), prefs = usePrefs();
  // A Dashboard link may name the starting report (?menu=…&sub=…).
  const search = Route.useSearch();
  const [start] = useState(() => startView(REPORT_MENUS, search, "Sales", "Sales Report"));
  const [menu, setMenu] = useState(start[0]), [sub, setSub] = useState(start[1]);
  const per = usePeriod("This Month", false), { setPeriod, setCustom } = per, period = per.period ?? "This Month", custom = per.custom;
  const [saved, setSaved] = useState<Saved[]>([]), [builder, setBuilder] = useState("Sales"), [view, setView] = useState("Preview"), [chart, setChart] = useState<"line" | "bar">("line");
  const [showCharts, setShowCharts] = useState(true), [showRows, setShowRows] = useState(true), [showTotals, setShowTotals] = useState(true), [print, setPrint] = useState(false);
  useEffect(() => { try { const value = JSON.parse(localStorage.getItem("shopbook.savedReports") || "[]"); setSaved(Array.isArray(value) ? value : []); } catch { setSaved([]); } }, []);
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh"), range = analyticsRange(period, custom);
  const active = menu === "Builder" ? builder : menu;
  const activeSub = menu === "Builder" ? REPORT_MENUS[builder]?.[0] ?? "Sales Report" : sub;
  const rep = detailedReport(s, active, activeSub, range);
  const menus: Record<string, readonly string[]> = { ...REPORT_MENUS, Financial: (REPORT_MENUS["Financial"] ?? []).filter((x) => x !== "VAT" || prefs.tax.on) };
  const go = (m: string) => { setMenu(m); setSub(menus[m]?.[0] ?? ""); setView("Preview"); };
  const exportCsv = () => { const url = URL.createObjectURL(new Blob([toCsv(rep)], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = `zakrio-systems-${active.toLowerCase()}-${localIso(new Date(range.from))}.csv`; a.click(); URL.revokeObjectURL(url); };
  const shareReport = () => {
    const rows = [
      ...rep.kpis.map((k) => [tr(k.label), k.value === null ? "—" : k.money ? money(k.value) : String(k.value), ""]),
      ...rep.rows.map((r) => [tr(r.label), typeof r.value === "number" && rep.money ? money(r.value) : String(r.value), r.note ? tr(r.note) : ""]),
    ];
    void sharePdfTable(`${acct.shopName} - ${tr(rep.title)}`, `${localIso(new Date(range.from))} – ${localIso(new Date(range.to))}`, [tr("Item"), tr("Value"), tr("Notes")], rows);
  };
  const save = () => { const next = [{ name: `${tr(builder)} · ${tr(period)}`, menu: builder, sub: activeSub }, ...saved].slice(0, 20); setSaved(next); localStorage.setItem("shopbook.savedReports", JSON.stringify(next)); };
  const values = rep.rows.filter((r): r is typeof r & { value: number } => typeof r.value === "number").map((r) => ({ label: r.label, value: r.value }));
  return <ErpShell period={per} title="Reports" shop={acct.shopName} menus={menus} menu={menu} sub={sub} onMenu={go} onSub={setSub} deps={s}>
    {menu === "Builder" && <>
      {sub === "Saved Reports" ? <div>{saved.map((x, i) => <ShopButton key={`${x.name}-${i}`} variant="bare" className="money-record" onClick={() => { const chosen = x.menu ?? x.type ?? "Sales"; setBuilder(REPORT_MENUS[chosen] ? chosen : "Sales"); setSub("Report Builder"); if (x.days) { setPeriod("Custom"); setCustom([localIso(new Date(Date.now() - x.days * 864e5)), localIso(new Date())]); } }}>{x.name} ›</ShopButton>)}</div> : <>
        <div className="shop-chart-filters"><select className="inventory-input" aria-label={tr("Report type")} value={builder} onChange={(e) => setBuilder(e.target.value)}>{Object.keys(REPORT_MENUS).filter((x) => x !== "Builder").map((x) => <option key={x}>{x}</option>)}</select><select className="inventory-input" aria-label={tr("Chart type")} value={chart} onChange={(e) => setChart(e.target.value as "line" | "bar")}><option value="line">{tr("Line chart")}</option><option value="bar">{tr("Bar chart")}</option></select></div>
        <div className="shop-chart-filters">{[["Charts", showCharts, setShowCharts], ["Transactions", showRows, setShowRows], ["Totals", showTotals, setShowTotals]].map(([label, value, setter]) => <label key={String(label)} className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={Boolean(value)} onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)} />{tr(String(label))}</label>)}<ShopButton variant="outline" className="h-7 text-[11px]" onClick={save}><Save className="h-3 w-3" />{tr("Save report")}</ShopButton></div>
      </>}
    </>}
    <Tabs small items={["Preview", "Table", "Chart"]} value={view} onChange={setView} tr={tr} />
    {showTotals && view !== "Chart" && <KpiRow>{rep.kpis.map((k) => <Kpi key={k.label} tone={kpiTone(k.label)} label={tr(k.label)} value={k.value === null ? "—" : k.money ? money(k.value) : String(k.value)} />)}</KpiRow>}
    {showCharts && view !== "Table" && (menu === "Builder" ? <CompactGraph title={`${active} trend`} points={chartSeries(s, reportModule(active), range)} kind={chart} money={money} tr={tr} labels={active === "Financial" ? ["Revenue", "Expenses", "Profit"] : undefined} /> : <><ModuleCharts s={s} module={reportModule(active)} money={money} tr={tr} from={range.from} to={range.to} single={!["Sales Report", "Purchase Report", "Expense Report", "Stock Report", "Profit & Loss"].includes(sub)} />{["Product Sales", "Customer Sales", "Seller Performance", "Supplier Report", "By Employee", "By Product", "By Sale", "Top Expenses", "Receivables", "Payables"].includes(sub) && <CompactGraph title={sub} points={values} money={money} tr={tr} kind="ranking" />}</>)}
    {showRows && view !== "Chart" && <><h2 className="money-heading">{tr(rep.title)}</h2><div className="overflow-x-auto">{rep.rows.length ? rep.rows.map((r, i) => <div className="shop-report-row" key={i}><span className="truncate">{r.label}</span><b className="tabular-nums">{typeof r.value === "number" && rep.money ? money(r.value) : String(r.value)}</b><span className="text-muted-foreground">{r.note ? tr(r.note) : ""}</span></div>) : <p className="shop-chart-empty">{tr("No records in this period")}</p>}</div></>}
    <div className="shop-chart-filters"><ShopButton variant="outline" className="h-7 text-[11px]" onClick={exportCsv}><Download className="h-3 w-3" />CSV</ShopButton><ShopButton variant="outline" className="h-7 text-[11px]" onClick={shareReport}><Share2 className="h-3 w-3" />{tr("Share")}</ShopButton><ShopButton variant="outline" className="h-7 text-[11px]" onClick={() => setPrint(true)}><Printer className="h-3 w-3" />{tr("Print")}</ShopButton></div>
    {print && <PrintPreview title="Report" onClose={() => setPrint(false)}><DocHead shop={acct.shopName} title={rep.title} /><p>{localIso(new Date(range.from))} – {localIso(new Date(range.to))}</p>{rep.kpis.map((k) => <DocLine key={k.label} k={tr(k.label)} v={k.value === null ? "—" : k.money ? money(k.value) : String(k.value)} />)}{rep.rows.map((r, i) => <DocLine key={i} k={r.label} v={typeof r.value === "number" && rep.money ? money(r.value) : String(r.value)} />)}</PrintPreview>}
  </ErpShell>;
}
