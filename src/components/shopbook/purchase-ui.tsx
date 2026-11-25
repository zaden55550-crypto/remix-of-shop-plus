// The Purchases app's list screen: toolbar (search, filters, calendar icon, main action, share) over a compact table.
// Everything a list shows, exports and prints comes from one set of columns, so the three can't disagree.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarDays, Check, Download, FileSpreadsheet, FileText, MessageCircle, Printer, ScanLine, Search, Share2, SlidersHorizontal, Upload } from "lucide-react";
import { toast } from "sonner";
import { Empty, type Tr } from "@/components/shopbook/erp-shell";
import { PrintPreview, sharePdfTable } from "@/components/shopbook/print";
import { downloadBlob } from "@/lib/download";
import { ANALYTICS_PERIODS, usePeriod, type HeaderPeriod } from "@/lib/period";
import { csvText, xlsxBytes } from "@/lib/product-export";
import { tablePdf } from "@/lib/simple-pdf";
import { cn } from "@/lib/utils";

export type Cell = string | number;
export type Col<T> = { label: string; value: (x: T) => Cell; money?: boolean; end?: boolean; render?: (x: T) => ReactNode };
export type Filter<T> = { label: string; get: (x: T) => string; options?: readonly string[] };
export const dayText = (at?: number) => (at ? new Date(at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");
export const isoDay = (at?: number) => { if (!at) return ""; const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const dayMs = (iso: string) => { const n = new Date(`${iso}T00:00:00`).getTime(); return Number.isFinite(n) ? n : undefined; };

function Pop({ open, setOpen, button, children }: { open: boolean; setOpen: (v: boolean) => void; button: ReactNode; children: ReactNode }) {
  return <span className="pm-pop-wrap">{button}{open && <><span className="pm-away" onClick={() => setOpen(false)} /><span className="pm-pop glass-card">{children}</span></>}</span>;
}

/** Icon only: it opens the date choices, and a chosen period lights it. */
export function CalendarIcon({ period, tr }: { period: HeaderPeriod; tr: Tr }) {
  const [open, setOpen] = useState(false);
  const label = period.period ? `${tr("Period")}: ${tr(period.period)}` : tr("Period");
  return <Pop open={open} setOpen={setOpen} button={<button type="button" className={cn("pw-btn pm-icon", period.period && "is-on")} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(!open)}><CalendarDays /></button>}>
    {ANALYTICS_PERIODS.map((p) => <button key={p} type="button" className="pm-pop-row" onClick={() => { period.setPeriod(period.period === p && p !== "Custom" ? null : p); if (p !== "Custom") setOpen(false); }}><span>{tr(p)}</span>{period.period === p && <Check />}</button>)}
    {period.period === "Custom" && <span className="pm-pop-dates">
      <label>{tr("From")}<input type="date" className="inventory-input" value={period.custom[0]} max={period.custom[1]} onChange={(e) => period.setCustom([e.target.value, period.custom[1]])} /></label>
      <label>{tr("To")}<input type="date" className="inventory-input" value={period.custom[1]} min={period.custom[0]} onChange={(e) => period.setCustom([period.custom[0], e.target.value])} /></label>
    </span>}
    {period.period && <button type="button" className="pm-pop-row pm-pop-clear" onClick={() => { period.setPeriod(null); setOpen(false); }}>{tr("All dates")}</button>}
  </Pop>;
}

export function ShareMenu({ title, shop, head, rows, tr, print }: { title: string; shop: string; head: string[]; rows: Cell[][]; tr: Tr; print?: () => void }) {
  const [open, setOpen] = useState(false);
  const [xlsx, setXlsx] = useState<typeof import("xlsx")>();
  // Loaded when the menu opens: phones only allow a download during the tap itself.
  useEffect(() => { if (open && !xlsx) void import("xlsx").then(setXlsx); }, [open, xlsx]);
  const name = (ext: string) => `dataquill-solutions-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.${ext}`;
  const done = (fn: () => void) => { try { fn(); setOpen(false); } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Export failed")); } };
  const excel = () => done(() => { if (!xlsx) throw new Error("Excel export is still loading"); downloadBlob(new Blob([xlsxBytes(xlsx, head, rows)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), name("xlsx")); });
  const pdf = () => done(() => { const bytes = tablePdf(`${shop || "DATAQUILL SOLUTIONS"} - ${title}`, `${rows.length} ${tr("records")} - ${new Date().toISOString().slice(0, 10)}`, head, rows.map((r) => r.map(String))); downloadBlob(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }), name("pdf")); });
  const csv = () => done(() => downloadBlob(new Blob([`﻿${csvText(head, rows)}`], { type: "text/csv;charset=utf-8" }), name("csv")));
  const whatsapp = () => {
    setOpen(false);
    void sharePdfTable(`${shop || "DATAQUILL SOLUTIONS"} - ${title}`, `${rows.length} ${tr("records")} - ${new Date().toISOString().slice(0, 10)}`, head, rows.map((r) => r.map(String)));
  };
  return <Pop open={open} setOpen={setOpen} button={<button type="button" className="pw-btn" aria-expanded={open} onClick={() => setOpen(!open)}><Share2 /><span>{tr("Share")}</span></button>}>
    <button type="button" className="pm-pop-row" disabled={!rows.length} onClick={excel}><span><FileSpreadsheet />{tr("Excel")}</span></button>
    <button type="button" className="pm-pop-row" disabled={!rows.length} onClick={pdf}><span><FileText />{tr("PDF")}</span></button>
    <button type="button" className="pm-pop-row" disabled={!rows.length} onClick={csv}><span><Download />{tr("CSV")}</span></button>
    {print && <button type="button" className="pm-pop-row" disabled={!rows.length} onClick={() => { setOpen(false); print(); }}><span><Printer />{tr("Print")}</span></button>}
    <button type="button" className="pm-pop-row" disabled={!rows.length} onClick={whatsapp}><span><MessageCircle />{tr("WhatsApp")}</span></button>
  </Pop>;
}

export function DataTable<T>({ rows, columns, idOf, money, actions, tr, actionLabel = "Actions" }: { rows: T[]; columns: Col<T>[]; idOf: (x: T) => string; money: (n: number) => string; actions?: ((x: T) => ReactNode) | undefined; tr: Tr; actionLabel?: string }) {
  return <div className="pm-table-wrap"><table className="pm-table">
    <thead><tr>{columns.map((c) => <th key={c.label} className={cn((c.money || c.end) && "is-end")}>{tr(c.label)}</th>)}{actions && <th>{tr(actionLabel)}</th>}</tr></thead>
    <tbody>{rows.map((x) => <tr key={idOf(x)}>
      {columns.map((c) => { const v = c.value(x); return <td key={c.label} data-label={tr(c.label)} className={cn((c.money || c.end) && "is-end")}>{c.render ? c.render(x) : c.money && typeof v === "number" ? money(v) : v === "" ? "—" : v}</td>; })}
      {actions && <td className="pm-actions">{actions(x)}</td>}
    </tr>)}</tbody>
  </table></div>;
}
export const Act = ({ children, onClick, label }: { children: ReactNode; onClick: () => void; label?: string }) => <button type="button" className="pw-btn ps-act" aria-label={label} onClick={onClick}>{children}</button>;

/** A whole list screen. `when` gives the calendar a date to filter on; without it there is no date on the row to filter by. */
export function ListScreen<T>({ title, shop, items, columns, idOf, text, when, filters = [], scanAction, primary, importAction, actions, money, tr, empty, summary, ph = "Search..." }: {
  title: string; shop: string; items: T[]; columns: Col<T>[]; idOf: (x: T) => string; text: (x: T) => string; when?: (x: T) => number; filters?: Filter<T>[];
  scanAction?: { label: string; onClick: () => void } | undefined; primary?: { label: string; icon?: ReactNode; onClick: () => void } | undefined; importAction?: { label: string; icon?: ReactNode; onClick: () => void } | undefined; actions?: ((x: T) => ReactNode) | undefined; money: (n: number) => string; tr: Tr; empty: string; summary?: ((rows: T[]) => [string, string][]) | undefined; ph?: string;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const period = usePeriod(null);
  const { from, to } = period.range;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((x) => (!term || text(x).toLowerCase().includes(term)) && (!when || (when(x) >= from && when(x) <= to)) && filters.every((f) => !picked[f.label] || f.get(x) === picked[f.label]));
  }, [items, q, picked, from, to]); // eslint-disable-line react-hooks/exhaustive-deps -- text, when and filters are fixed per screen
  const head = columns.map((c) => tr(c.label)), table = shown.map((x) => columns.map((c) => c.value(x)));
  const active = Object.values(picked).filter(Boolean).length;
  return <div className="pm-screen">
    <div className="pm-toolbar">
      <label className="pm-search"><Search /><input className="inventory-input" aria-label={tr(ph)} placeholder={tr(ph)} value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {scanAction && <button type="button" className="pw-btn" onClick={scanAction.onClick}><ScanLine /><span>{tr(scanAction.label)}</span></button>}
      {filters.length > 0 && <Pop open={filtersOpen} setOpen={setFiltersOpen} button={<button type="button" className={cn("pw-btn", active > 0 && "is-on")} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal /><span>{tr("Filters")}{active > 0 && ` (${active})`}</span></button>}>
        {filters.map((f) => <label key={f.label} className="pm-pop-field"><span>{tr(f.label)}</span>
          <select className="inventory-input" aria-label={tr(f.label)} value={picked[f.label] ?? ""} onChange={(e) => setPicked({ ...picked, [f.label]: e.target.value })}>
            <option value="">{tr("All")}</option>
            {(f.options ?? [...new Set(items.map(f.get))].filter(Boolean).sort()).map((o) => <option key={o} value={o}>{tr(o)}</option>)}
          </select></label>)}
        {active > 0 && <button type="button" className="pm-pop-row pm-pop-clear" onClick={() => setPicked({})}>{tr("Clear filters")}</button>}
      </Pop>}
      {when && <CalendarIcon period={period} tr={tr} />}
      {primary && <button type="button" className="pw-btn is-primary" onClick={primary.onClick}>{primary.icon}<span>{tr(primary.label)}</span></button>}
      {importAction && <button type="button" className="pw-btn" onClick={importAction.onClick}>{importAction.icon ?? <Upload />}<span>{tr(importAction.label)}</span></button>}
      <ShareMenu title={tr(title)} shop={shop} head={head} rows={table} tr={tr} print={() => setPrinting(true)} />
    </div>
    {summary && <dl className="pm-summary">{summary(shown).map(([k, v]) => <div key={k}><dt>{tr(k)}</dt><dd>{v}</dd></div>)}</dl>}
    <div className="inventory-box dash-panel pm-card">
      {shown.length ? <DataTable rows={shown} columns={columns} idOf={idOf} money={money} actions={actions} tr={tr} /> : <Empty>{tr(items.length ? "Nothing matches your search" : empty)}</Empty>}
    </div>
    {printing && <PrintPreview title={tr(title)} onClose={() => setPrinting(false)}><div><p className="text-center text-sm font-extrabold uppercase">{shop}</p><p className="text-center">{tr(title)}</p><table className="pm-print"><thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead><tbody>{shown.map((x, i) => <tr key={idOf(x)}>{(table[i] ?? []).map((v, j) => <td key={j}>{columns[j]?.money && typeof v === "number" ? money(v) : v}</td>)}</tr>)}</tbody></table></div></PrintPreview>}
  </div>;
}
