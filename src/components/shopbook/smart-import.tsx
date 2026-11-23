// Smart Import (owner, 2026-11-23): bringing a business over in plain steps. 1. Say where you are coming from (and see exactly what
// to export there). 2. Drop the files. 3. The system checks everything by itself: recognises each sheet, removes duplicates and
// empty rows, fixes phone numbers and dates, and runs the real import as a test. 4. One report in plain words (what was found, what
// was fixed, what needs attention) and one Import button; rows with problems are simply left out and listed. Undo for 24 hours.
// The detailed screen (FullImport: column matching, options) stays one tap away under "Advanced".
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { FullImport } from "@/components/shopbook/full-import";
import { MOVE_GUIDES } from "@/components/shopbook/ready-to-sell";
import { download } from "@/lib/download";
import { FULL_ORDER, analyzeFull, importFull, missing, planSheets, stockAlreadyCounted, suggestFor, type FullCat, type FullOptions, type Plan, type StageResult } from "@/lib/full-import";
import { cleanSheets, detectSource, expandZips, type CleanReport } from "@/lib/move-in";
import { issuesCsv, readSheets } from "@/lib/opening-import";
import { cn } from "@/lib/utils";

type Tr = (x: string) => string;
/** A sheet's name as the owner knows it: the file for CSV files (their one sheet is just "Sheet1"), else file › sheet. */
const place = (x: { file: string; sheet: string }) => (/^sheets*1$/i.test(x.sheet) || x.file.toLowerCase().endsWith(".csv") ? x.file : `${x.file} › ${x.sheet}`);
type Stage = "pick" | "checking" | "report" | "saving" | "done";
/** What to export from each system, in words a shop owner can follow. */
const WHAT: Record<string, string[]> = {
  Odoo: ["Products (with stock and prices)", "Customers", "Suppliers", "What customers owe and what you owe"],
  QuickBooks: ["Products and services", "Customers", "Vendors (suppliers)", "Receivables and payables aging"],
  "Zoho Inventory / Books": ["Items", "Customers", "Vendors", "Receivables and payables aging"],
  Loyverse: ["Items (with stock and prices)", "Customers"],
  "Excel or another system": ["Products", "Customers", "Suppliers", "Opening balances"],
};

export function SmartImport({ tr, files: given }: { tr: Tr; files?: File[] | undefined }) {
  const input = useRef<HTMLInputElement>(null);
  const [system, setSystem] = useState<string>(MOVE_GUIDES[0]!.system);
  const [stage, setStage] = useState<Stage>("pick");
  const [files, setFiles] = useState<File[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [results, setResults] = useState<StageResult[]>([]);
  const [cleaned, setCleaned] = useState<CleanReport | null>(null);
  const [source, setSource] = useState<string | undefined>();
  const [opts, setOpts] = useState<FullOptions>({ dateFmt: "auto", stock: "update", existing: "skip" });
  const [advanced, setAdvanced] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const guide = MOVE_GUIDES.find((g) => g.system === system)!;

  const check = (next: Plan[], o: FullOptions) => {
    // Let the "Checking…" screen paint before the heavy work.
    setStage("checking");
    window.setTimeout(() => {
      try {
        let list = next, a = analyzeFull(list, o);
        // A sheet whose every row fails was guessed wrong: ask what it is instead of listing every row as a problem.
        const failedRows = new Map<string, Set<number>>();
        for (const i of a.results.flatMap((x) => x.issues)) { const k = `${i.file}::${i.sheet}`; if (!failedRows.has(k)) failedRows.set(k, new Set()); failedRows.get(k)!.add(i.row); }
        const wrong = (p: Plan) => p.cat !== "Skip" && p.sheet.rows.length > 0 && (failedRows.get(`${p.sheet.file}::${p.sheet.sheet}`)?.size ?? 0) >= p.sheet.rows.length;
        if (list.some(wrong)) { list = list.map((p) => (wrong(p) ? { ...p, cat: "Skip" as FullCat } : p)); a = analyzeFull(list, o); }
        setResults(a.results); setOpts({ ...o, dateFmt: a.dateFmt }); setPlans(list); setStage("report");
      }
      catch (e) { toast.error(e instanceof Error ? e.message : tr("Files could not be read")); setStage("pick"); }
    }, 60);
  };
  const start = async (list: File[]) => {
    if (!list.length) return;
    setFiles(list); setStage("checking"); setAdvanced(false);
    try {
      const raw = await readSheets(await expandZips(list));
      const { sheets, report } = cleanSheets(raw), next = planSheets(sheets);
      setCleaned(report); setSource(detectSource(sheets));
      check(next, { dateFmt: "auto", stock: stockAlreadyCounted(next) ? "record" : "update", existing: opts.existing ?? "skip" });
    } catch (e) { toast.error(e instanceof Error ? e.message : tr("Files could not be read")); setStage("pick"); }
  };
  // Files dropped on Business Setup arrive here already chosen.
  useEffect(() => { if (given?.length) void start(given); }, [given]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCat = (id: string, cat: FullCat) => check(plans.map((p) => (p.id === id ? { ...p, cat, map: suggestFor(cat, p.sheet.columns) } : p)), opts);
  const sum = (f: "created" | "updated" | "skipped" | "rejected") => results.reduce((a, r) => a + r[f], 0);
  const issues = results.flatMap((r) => r.issues), failed = results.filter((r) => r.error);
  const unknown = plans.filter((p) => p.cat === "Skip"), incomplete = plans.filter((p) => p.cat !== "Skip" && missing(p).length);
  const toSave = sum("created") + sum("updated");
  const fixedCount = cleaned ? cleaned.merged + cleaned.contacts + cleaned.repeated + cleaned.empty + cleaned.phones : 0;
  const save = () => {
    setStage("saving");
    window.setTimeout(() => {
      try { const r = importFull(plans, opts); setResults(r.results); setDoneCount(r.batch.created + r.batch.updated); setStage("done"); toast.success(tr("Import finished")); }
      catch (e) { toast.error(`${e instanceof Error ? e.message : ""} — ${tr("nothing was saved")}`); setStage("report"); }
    }, 60);
  };
  const again = () => { setStage("pick"); setFiles([]); setPlans([]); setResults([]); setCleaned(null); setSource(undefined); };

  if (advanced && files.length) return <div className="smart-import">
    <button type="button" className="smart-link" onClick={() => setAdvanced(false)}>← {tr("Back to the simple import")}</button>
    <FullImport tr={tr} files={files} />
  </div>;

  return <div className="smart-import">
    <ol className="smart-steps" aria-label={tr("Steps")}>
      {["Where from", "Your files", "Check", "Import"].map((x, i) => { const at = stage === "pick" ? 0 : stage === "checking" ? 2 : stage === "report" ? 2 : 3;
        return <li key={x} className={cn(i < at && "is-done", i === at && "is-now")}>{i < at ? <CheckCircle2 aria-hidden /> : <span>{i + 1}</span>} {tr(x)}</li>; })}
    </ol>

    {stage === "pick" && <div className="smart-pick">
      <section>
        <h4>1. {tr("Where are you coming from?")}</h4>
        <div className="smart-systems" role="radiogroup">{MOVE_GUIDES.map((g) => <button key={g.system} type="button" role="radio" aria-checked={system === g.system} className={cn(system === g.system && "is-on")} onClick={() => setSystem(g.system)}>{tr(g.system)}</button>)}</div>
        <p className="smart-what"><b>{tr("Export these")}:</b> {(WHAT[system] ?? []).map((x) => tr(x)).join(" · ")}</p>
        <ol className="smart-guide">{guide.steps.map((x) => <li key={x}>{x}</li>)}</ol>
        <p className="settings-note">{tr("Excel, CSV or a zip of them. Any column order and any names: the system works out what each column is.")}</p>
      </section>
      <section>
        <h4>2. {tr("Drop your files")}</h4>
        <button type="button" className="movein-drop smart-drop" onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void start([...e.dataTransfer.files]); }}>
          <Upload aria-hidden /><b>{tr("Drop all your files here, or tap to choose")}</b><small>{tr("You can choose several files at once")}</small>
        </button>
        <input ref={input} hidden multiple type="file" accept=".csv,.xlsx,.xls,.zip" onChange={(e) => { void start([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </section>
    </div>}

    {(stage === "checking" || stage === "saving") && <div className="smart-busy" role="status">
      <Loader2 aria-hidden className="animate-spin" />
      <b>{tr(stage === "checking" ? "Checking your files…" : "Importing…")}</b>
      <span>{tr(stage === "checking" ? "Reading every sheet, removing duplicates and testing the import. Nothing is saved yet." : "Saving everything in one go.")}</span>
    </div>}

    {stage === "report" && <div className="smart-report">
      <p className="smart-head"><FileSpreadsheet aria-hidden /> {files.length} {tr(files.length === 1 ? "file checked" : "files checked")}{source ? ` · ${tr("from")} ${source}` : ""}</p>
      <div className="smart-cols">
        <section className="smart-card is-found">
          <h4><CheckCircle2 aria-hidden /> {tr("Ready to import")}</h4>
          {results.length ? <ul>{results.map((r) => <li key={r.cat}><b>{tr(r.cat)}</b><span>{r.created} {tr("new")}{r.updated ? ` · ${r.updated} ${tr("updated")}` : ""}{r.skipped ? ` · ${r.skipped} ${tr("already in your shop")}` : ""}</span></li>)}</ul> : <p>{tr("Nothing we could import yet.")}</p>}
          <label className="smart-existing"><span>{tr("Already in your shop")}:</span>
            <select className="inventory-input" value={opts.existing} onChange={(e) => check(plans, { ...opts, existing: e.target.value as "skip" | "update" })}><option value="skip">{tr("Keep mine")}</option><option value="update">{tr("Update from the file")}</option></select>
          </label>
        </section>
        <section className="smart-card is-fixed">
          <h4><Sparkles aria-hidden /> {tr("We fixed for you")}</h4>
          {fixedCount === 0 && opts.dateFmt === "auto" ? <p>{tr("Nothing needed fixing.")}</p> : <ul>
            {!!cleaned?.merged && <li>{cleaned.merged} {tr("duplicate products merged (stock added together)")}</li>}
            {!!cleaned?.contacts && <li>{cleaned.contacts} {tr("duplicate customers or suppliers removed")}</li>}
            {!!cleaned?.repeated && <li>{cleaned.repeated} {tr("repeated rows removed")}</li>}
            {!!cleaned?.empty && <li>{cleaned.empty} {tr("empty rows removed")}</li>}
            {!!cleaned?.phones && <li>{cleaned.phones} {tr("phone numbers written the local way (07…)")}</li>}
            {opts.dateFmt !== "auto" && <li>{tr("Dates read as")} {opts.dateFmt}</li>}
          </ul>}
          {!!cleaned?.examples.length && <p className="smart-examples">{tr("Duplicates")}: {cleaned.examples.join(", ")}</p>}
        </section>
        <section className={cn("smart-card", (unknown.length || incomplete.length || issues.length || failed.length || cleaned?.missingPrices) ? "is-warn" : "is-ok")}>
          <h4><AlertTriangle aria-hidden /> {tr("Needs your attention")}</h4>
          {!(unknown.length || incomplete.length || issues.length || failed.length || cleaned?.missingPrices) && <p>{tr("Nothing. You are good to go.")}</p>}
          {unknown.map((p) => <div key={p.id} className="smart-unknown"><span>{tr("What is")} “{place(p.sheet)}” ({p.sheet.rows.length} {tr("rows")})?</span>
            <select className="inventory-input" value="Skip" onChange={(e) => setCat(p.id, e.target.value as FullCat)}><option value="Skip">{tr("Leave it out")}</option>{FULL_ORDER.map((c) => <option key={c} value={c}>{tr(c)}</option>)}</select></div>)}
          {incomplete.map((p) => <p key={p.id}>“{place(p.sheet)}”: {tr("needs")} {missing(p).map((x) => tr(x)).join(", ")}. <button type="button" className="smart-link" onClick={() => setAdvanced(true)}>{tr("Match the columns")}</button></p>)}
          {failed.map((r) => <p key={r.cat} className="is-bad">{tr(r.cat)}: {r.error}</p>)}
          {!!cleaned?.missingPrices && <p>{cleaned.missingPrices} {tr("products have no selling price")}</p>}
          {issues.length > 0 && <>
            <p><b>{issues.length}</b> {tr(issues.length === 1 ? "row will be left out:" : "rows will be left out:")}</p>
            <ul className="smart-issues">{issues.slice(0, 6).map((i) => <li key={`${i.file}${i.sheet}${i.row}${i.field}`}>{place(i)}, {tr("row")} {i.row}{i.field ? ` · ${i.field}` : ""}: {i.problem}</li>)}</ul>
            <button type="button" className="smart-link" onClick={() => download("zakrio-systems-import-problems.csv", issuesCsv(issues))}><Download aria-hidden /> {tr("Download the list to fix them")}</button>
          </>}
        </section>
      </div>
      <div className="smart-actions">
        <ShopButton variant="outline" onClick={again}><RotateCcw aria-hidden /> {tr("Choose other files")}</ShopButton>
        <button type="button" className="smart-link" onClick={() => setAdvanced(true)}>{tr("Advanced")}</button>
        <ShopButton className="smart-go" disabled={!toSave || failed.length > 0} onClick={save}>{toSave ? `${tr("Import")} ${toSave} ${tr("records")}` : tr("Nothing to import")}</ShopButton>
      </div>
      <p className="settings-note">{tr("Everything is saved together or not at all, and you can undo it for 24 hours.")}</p>
    </div>}

    {stage === "done" && <div className="smart-done">
      <CheckCircle2 aria-hidden />
      <b>{tr("Done!")} {doneCount} {tr("records brought over")}</b>
      <ul>{results.map((r) => <li key={r.cat}>{tr(r.cat)}: {r.created} {tr("new")}{r.updated ? `, ${r.updated} ${tr("updated")}` : ""}</li>)}</ul>
      <p className="settings-note">{tr("Not right? Use Undo last import below within 24 hours, before recording anything else.")}</p>
      <ShopButton variant="outline" onClick={again}>{tr("Import more files")}</ShopButton>
    </div>}
  </div>;
}
