import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardPaste, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { FULL_ORDER, fieldsFor, fullTemplate, importFull, pastedSheet, templateName, missing, planSheets, previewFull, suggestFor, type FullCat, type FullOptions, type Plan, type StageResult } from "@/lib/full-import";
import { issuesCsv, readSheets, type DateFmt, type ImportBatch } from "@/lib/opening-import";

import { download, openFile } from "@/lib/download";
import { cleanSheets, detectSource, expandZips, type CleanReport } from "@/lib/move-in";
type Stage = "upload" | "map" | "preview" | "done";
const STEPS = ["Upload", "Detect", "Map", "Validate", "Preview", "Confirm Import", "Reconcile"];

/** Full Business Import: Upload → Detect → Map → Validate → Preview → Confirm Import → Reconcile. */
export function FullImport({ tr, files }: { tr: (x: string) => string; files?: File[] | undefined }) {
  const ref = useRef<HTMLInputElement>(null);
  // Where the files came from and what clean-up did, shown above the preview (move-in.ts).
  const [source, setSource] = useState<string | undefined>(undefined);
  const [cleaned, setCleaned] = useState<CleanReport | null>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [fmt, setFmt] = useState<DateFmt>("auto");
  const [stock, setStock] = useState<FullOptions["stock"]>("update");
  const [results, setResults] = useState<StageResult[]>([]);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<"skip" | "update">("skip");
  const [tpl, setTpl] = useState<Blob | null>(null);
  // Build the template ahead of time so the tap saves it immediately (iPhone/iPad drop slow taps).
  const [tplCat, setTplCat] = useState<string>("");
  const [paste, setPaste] = useState<string | null>(null);
  useEffect(() => { setTpl(null); void fullTemplate((tplCat || undefined) as never).then(setTpl).catch(() => setTpl(null)); }, [tplCat]);
  const opts: FullOptions = { dateFmt: fmt, stock, existing };
  useEffect(() => { if (files?.length) void read(files); }, [files]); // eslint-disable-line react-hooks/exhaustive-deps
  const step = stage === "upload" ? 0 : stage === "map" ? 2 : stage === "preview" ? 4 : 6;
  const reset = () => { setStage("upload"); setPlans([]); setResults([]); setBatch(null); };
  const blocked = plans.filter((p) => p.cat !== "Skip" && missing(p).length);
  const active = plans.filter((p) => p.cat !== "Skip");

  const read = async (list: FileList | File[] | "paste") => {
    try {
      // Zip exports are opened, then every row is tidied (duplicates merged, phones in one format) before anything is planned.
      const raw = list === "paste" ? [pastedSheet(paste ?? "")] : await readSheets(await expandZips([...list]));
      const { sheets, report } = cleanSheets(raw), next = planSheets(sheets);
      setSource(detectSource(sheets)); setCleaned(report);
      setPaste(null);
      // Products listed with their current stock already count it, so past sales should not reduce it again.
      const nextStock: FullOptions["stock"] = next.some((p) => (p.cat === "Products" && p.map["qty"]) || p.cat === "Opening Stock") ? "record" : "update";
      setPlans(next); setStock(nextStock);
      toast.success(`${sheets.length} ${tr("worksheets detected")}`);
      // Fewer clicks (owner, 2026-11-23): when every sheet was recognised with all its needed columns, skip the matching step and
      // show the preview straight away. "Back to mapping" is still there to change anything.
      const ready = next.filter((p) => p.cat !== "Skip");
      if (ready.length && ready.every((p) => !missing(p).length)) validate(next, { ...opts, stock: nextStock });
      else setStage("map");
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("Files could not be read")); }
    if (ref.current) ref.current.value = "";
  };
  const update = (id: string, patch: Partial<Plan>) => setPlans(plans.map((p) => p.id === id ? { ...p, ...patch } : p));
  const validate = (list: Plan[] = plans, o: FullOptions = opts) => {
    setBusy(true);
    try {
      // Auto-correct: if rows are rejected, try other date formats and keep the reading with the fewest errors.
      const bad = (r: StageResult[]) => r.reduce((a, x) => a + x.rejected + (x.error ? 1000 : 0), 0);
      let best = previewFull(list, o), bestFmt = o.dateFmt;
      if (bad(best)) for (const f of (["auto", "DMY", "MDY", "YMD"] as DateFmt[]).filter((f) => f !== o.dateFmt)) {
        const r = previewFull(list, { ...o, dateFmt: f });
        if (bad(r) < bad(best)) { best = r; bestFmt = f; }
      }
      if (bestFmt !== o.dateFmt) { setFmt(bestFmt); toast.success(`${tr("Errors corrected automatically")}: ${tr("date format")} ${bestFmt === "auto" ? tr("Detect automatically") : bestFmt}`); }
      setResults(best); setStage("preview");
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("Validation failed")); } finally { setBusy(false); }
  };
  const run = () => {
    if (busy) return; setBusy(true);
    try { const r = importFull(plans, opts); setResults(r.results); setBatch(r.batch); setStage("done"); if (r.batch.created || r.batch.updated) toast.success(`${r.batch.created} ${tr("records created")}`); else toast.warning(tr("Nothing new was saved")); }
    catch (e) { toast.error(`${e instanceof Error ? e.message : ""} — ${tr("nothing was saved")}`); }
    finally { setBusy(false); }
  };
  const issues = results.flatMap((r) => r.issues), failed = results.filter((r) => r.error);
  const totals = (f: "created" | "updated" | "skipped" | "rejected") => results.reduce((a, r) => a + r[f], 0);

  return <div className="relative grid gap-2">
    {stage !== "upload" && (source || (cleaned && (cleaned.merged || cleaned.phones || cleaned.missingPrices))) ? <div className="import-found" role="status">
      {source && <p><b>{tr("This looks like an export from")} {source}.</b> {tr("Its columns were matched for you.")}</p>}
      {cleaned && (cleaned.merged > 0 || cleaned.phones > 0) && <p>{tr("Cleaned up before saving")}: {cleaned.merged > 0 && <>{cleaned.merged} {tr("duplicate products merged")} </>}{cleaned.phones > 0 && <>· {cleaned.phones} {tr("phone numbers written as +254")}</>}</p>}
      {cleaned && cleaned.missingPrices > 0 && <p className="import-warn">{cleaned.missingPrices} {tr("products have no selling price; add it after the import")}</p>}
    </div> : null}
    {stage !== "upload" && <ShopButton variant="bare" className="inventory-icon-button absolute right-0 top-0" aria-label={tr("Close import and return")} onClick={reset}><X className="h-4 w-4" /></ShopButton>}
    <ol className="flex flex-wrap gap-1 text-[10px]">{STEPS.map((x, i) => <li key={x} className={`rounded px-1.5 py-0.5 ${i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{i + 1}. {tr(x)}</li>)}</ol>
    {stage === "upload" && <>
      <p className="import-note">{tr("Upload one Excel workbook with many sheets, or several files together. Each sheet is detected automatically: products, stock, prices, customers, suppliers, contacts, employees, opening balances (Cash, M-Pesa, Bank, credit), sales, purchases with payments, returns, expenses, stock adjustments, stock transfers, float movements and payroll history. Accounting, float and commission totals are calculated from these records.")}</p>
      <input ref={ref} hidden multiple type="file" accept=".csv,.xlsx,.xls,.zip" onChange={(e) => e.target.files?.length && void read(e.target.files)} />
      <ShopButton className="inventory-save" onClick={() => ref.current?.click()}><Upload className="h-4 w-4" />{tr("Choose workbook or files")}</ShopButton>
      <ShopButton variant="outline" className="inventory-save" onClick={() => setPaste(paste === null ? "" : null)}><ClipboardPaste className="h-4 w-4" />{tr("Paste from Excel or Google Sheets")}</ShopButton>
      {paste !== null && <div className="relative grid gap-1"><ShopButton variant="bare" className="inventory-icon-button absolute right-1 top-1" aria-label={tr("Close")} onClick={() => setPaste(null)}><X className="h-4 w-4" /></ShopButton><textarea className="inventory-input min-h-32 pr-8 font-mono text-[11px]" placeholder={tr("Copy cells including the header row, then paste here")} value={paste} onChange={(e) => setPaste(e.target.value)} /><ShopButton className="inventory-save" disabled={!paste.trim()} onClick={() => void read("paste")}>{tr("Read pasted data")}</ShopButton></div>}
      <label className="inventory-field"><span>{tr("Template")}</span><select className="inventory-input" value={tplCat} onChange={(e) => setTplCat(e.target.value)}><option value="">{tr("Complete Business (all sheets)")}</option>{FULL_ORDER.map((c) => <option key={c} value={c}>{tr(c)}</option>)}</select></label>
      <ShopButton variant="outline" className="inventory-save" disabled={!tpl} onClick={() => { if (tpl) void openFile(tpl, templateName(tplCat || undefined)).then((r) => toast.success(tr(r === "shared" ? "Choose Excel, Numbers or Sheets to open the template" : "Template downloaded and opened"))); }}><Download className="h-4 w-4" />{tpl ? tr("Download template") : tr("Preparing template…")}</ShopButton>
    </>}
    {stage === "map" && <>
      {plans.map((p) => { const miss = missing(p); return <div key={p.id} className="import-history" style={{ padding: 8 }}>
        <p className="text-[11px] font-semibold">{p.sheet.file} • {p.sheet.sheet} • {p.sheet.rows.length} {tr("rows")}</p>
        <p className="import-note">{tr("Detected")}: {tr(p.reason)}</p>
        <label className="inventory-field"><span>{tr("Import as")}</span><select className="inventory-input" value={p.cat} onChange={(e) => { const cat = e.target.value as FullCat; update(p.id, { cat, map: suggestFor(cat, p.sheet.columns) }); }}><option value="Skip">{tr("Skip this sheet")}</option>{FULL_ORDER.map((c) => <option key={c} value={c}>{tr(c)}</option>)}</select></label>
        {p.cat !== "Skip" && <details open={miss.length > 0}><summary className="text-[11px]">{tr("Field mapping")}{miss.length ? ` — ${miss.length} ${tr("required missing")}` : " ✓"}</summary><div className="import-map">{fieldsFor(p.cat).map((f) => <div className="contents" key={f.key}><span>{tr(f.label)}{f.required ? " *" : ""}</span><select className="inventory-input" value={p.map[f.key] ?? ""} onChange={(e) => update(p.id, { map: { ...p.map, [f.key]: e.target.value || undefined } })}><option value="">{tr("Not in file")}</option>{p.sheet.columns.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>)}</div></details>}
        {miss.length > 0 && p.cat !== "Skip" && <p className="import-note text-destructive">{tr("Map")}: {miss.join(", ")} — {tr("or skip this sheet")}</p>}
      </div>; })}
      <label className="inventory-field"><span>{tr("Date format in file")}</span><select className="inventory-input" value={fmt} onChange={(e) => setFmt(e.target.value as DateFmt)}><option value="auto">{tr("Detect automatically")}</option><option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option><option value="YMD">YYYY-MM-DD</option></select></label>
      <label className="inventory-field"><span>{tr("Past sales & purchases")}</span><select className="inventory-input" value={stock} onChange={(e) => setStock(e.target.value as FullOptions["stock"])}><option value="update">{tr("Update stock quantities")}</option><option value="record">{tr("Record history only (stock already counted)")}</option></select></label>
      <label className="inventory-field"><span>{tr("Records already in the shop")}</span><select className="inventory-input" value={existing} onChange={(e) => setExisting(e.target.value as "skip" | "update")}><option value="skip">{tr("Skip them")}</option><option value="update">{tr("Update their details and prices")}</option></select></label>
      <p className="import-note">{tr("Opening Stock and Product Prices sheets always update matching products; repeating the same file sets the same values, never adds stock twice.")}</p>
      <ShopButton variant="outline" className="inventory-save" onClick={reset}>{tr("Cancel")}</ShopButton>
      <ShopButton className="inventory-save" disabled={!active.length || blocked.length > 0 || busy} onClick={() => validate()}>{busy ? tr("Processing…") : tr("Validate & preview")}</ShopButton>
    </>}
    {(stage === "preview" || stage === "done") && <>
      {stage === "done" && batch && <div className="import-done"><FileSpreadsheet className="h-8 w-8 text-primary" /><b>{tr(batch.status)}</b><span>{batch.id}</span></div>}
      <div className="import-summary"><span>{tr("New")}<b>{totals("created")}</b></span><span>{tr("Updated")}<b>{totals("updated")}</b></span><span>{tr("Skipped")}<b>{totals("skipped")}</b></span><span>{tr("Errors")}<b>{totals("rejected")}</b></span></div>
      <div className="import-preview">{results.map((r) => <div key={r.cat}><span><b>{tr(r.cat)}</b> • {r.sheets.join(", ")}</span><b className={r.error ? "import-invalid" : "import-new"}>{r.error ? tr("FAILED") : `${r.created} ${tr("new")}`}</b><small>{r.total} {tr("rows")} • {r.updated} {tr("updated")} • {r.skipped} {tr("skipped (already in shop)")} • {r.rejected} {tr("rejected")}</small>{r.error && <small className="text-destructive">{r.error}</small>}{r.issues.slice(0, 3).map((i) => <small key={`${i.sheet}${i.row}${i.field}`}>#{i.row} {i.field}: {i.problem} → {i.suggestion}</small>)}</div>)}</div>
      {issues.length > 0 && <ShopButton variant="outline" className="inventory-save" onClick={() => download("zakrio-systems-full-import-errors.csv", issuesCsv(issues))}><Download className="h-4 w-4" />{tr("Download error report")}</ShopButton>}
      {stage === "preview" && <>
        <p className="import-note">{tr("This preview was checked against your real shop data. Nothing is saved until you confirm. Fix rows in your file or change the mapping, then validate again.")}</p>
        {failed.length > 0 && <p className="import-note text-destructive">{tr("Fix or skip the failed sheets before importing.")}</p>}
        <ShopButton variant="outline" className="inventory-save" onClick={() => setStage("map")}>{tr("Back to mapping")}</ShopButton>
        <ShopButton className="inventory-save" disabled={busy || failed.length > 0 || !(totals("created") + totals("updated"))} onClick={run}>{busy ? tr("Processing…") : `${tr("Confirm Import")} (${totals("created") + totals("updated")})`}</ShopButton>
      </>}
      {stage === "done" && <>
        <p className="import-note">{tr("Reconcile: compare your Cash, M-Pesa, Bank, customer and supplier balances with your records, and match any outside statements in Reconciliation.")}</p>
        <Link to="/reconciliation" className="inventory-save inline-flex items-center justify-center rounded border border-border text-[11px]">{tr("Open Reconciliation")}</Link>
        <ShopButton className="inventory-save" onClick={reset}>{tr("New import")}</ShopButton>
      </>}
    </>}
  </div>;
}
