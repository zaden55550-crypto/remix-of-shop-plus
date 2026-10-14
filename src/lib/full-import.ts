// Full Business Import: one workbook (or many files) → detect each sheet's category, map, validate,
// preview and import in dependency order, reusing the existing category importers so every rule
// (importKeys, duplicate checks, opening-balance separation) stays in one place.
// The whole run is all-or-nothing: if any stage fails, shop data and history are restored.
import { load } from "@/lib/erp";
import { applyImport, detectType, FIELDS, previewRows, suggestMapping, type ImportType } from "@/lib/import-center";
import { applyOB, looksLikeOpening, OB_FIELDS, previewOB, saveBatch, suggestOB, type DateFmt, type ImportBatch, type OBIssue, type OBMapping, type Sheet } from "@/lib/opening-import";
import { applyTX, looksLikeTransactions, previewTX, suggestTX, TX_FIELDS, type TXMapping, type TXOptions } from "@/lib/transaction-import";
import { applyRT, previewRT, RT_FIELDS, suggestRT, type RTMapping } from "@/lib/return-import";

type RecordCat = Exclude<ImportType, "Product Images">;
export type FullCat = RecordCat | "Opening Balances" | "Sales & Purchases" | "Returns" | "Skip";
/** Import order: masters first so later sheets can link to them. */
export const FULL_ORDER: Exclude<FullCat, "Skip">[] = ["Categories", "Brands", "Products", "Customers", "Suppliers", "Other Contacts", "Employees", "Opening Stock", "Product Prices", "Opening Balances", "Sales & Purchases", "Returns", "Expenses"];
export type Field = { key: string; label: string; required?: boolean };
export const fieldsFor = (c: FullCat): readonly Field[] => c === "Skip" ? [] : c === "Opening Balances" ? OB_FIELDS : c === "Sales & Purchases" ? TX_FIELDS : c === "Returns" ? RT_FIELDS : FIELDS[c];
/** field key → column name */
export type FieldMap = Record<string, string | undefined>;
export type Plan = { id: string; sheet: Sheet; cat: FullCat; map: FieldMap; reason: string };
export type StageResult = { cat: Exclude<FullCat, "Skip">; sheets: string[]; total: number; created: number; updated: number; skipped: number; rejected: number; issues: OBIssue[]; error?: string };
export type FullOptions = { dateFmt: DateFmt; stock: TXOptions["stock"] };

const NAME_HINTS: [RegExp, FullCat][] = [[/opening|balance/, "Opening Balances"], [/return|refund|credit ?note/, "Returns"], [/sale|purchase|invoice|receipt|transaction/, "Sales & Purchases"], [/product|item|inventory|stock ?list/, "Products"], [/customer|client|debtor/, "Customers"], [/supplier|vendor|creditor/, "Suppliers"], [/employee|staff|payroll/, "Employees"], [/expense/, "Expenses"], [/categor/, "Categories"], [/brand/, "Brands"], [/price/, "Product Prices"]];

export function suggestFor(cat: FullCat, cols: string[]): FieldMap {
  if (cat === "Skip") return {};
  if (cat === "Opening Balances") return suggestOB(cols);
  if (cat === "Sales & Purchases") return suggestTX(cols);
  if (cat === "Returns") return suggestRT(cols);
  const m = suggestMapping(cols, cat), out: FieldMap = {};
  for (const [col, f] of Object.entries(m)) if (f) out[f] = col;
  return out;
}
export const missing = (p: Plan) => fieldsFor(p.cat).filter((f) => f.required && !p.map[f.key]).map((f) => f.label);

/** Detects a sheet's category from its columns first, then the sheet/file name. */
export function detect(sheet: Sheet): { cat: FullCat; reason: string } {
  const cols = sheet.columns, name = `${sheet.sheet} ${sheet.file}`.toLowerCase();
  const rt = suggestRT(cols), hinted = NAME_HINTS.find(([r]) => r.test(name))?.[1];
  const ok = (c: FullCat) => missing({ id: "", sheet, cat: c, map: suggestFor(c, cols), reason: "" }).length === 0;
  if (hinted && ok(hinted)) return { cat: hinted, reason: `Sheet name “${sheet.sheet}”` };
  if (rt.ref && rt.original && cols.some((c) => /return/i.test(c)) && ok("Returns")) return { cat: "Returns", reason: "Return columns" };
  if (looksLikeOpening(cols)) return { cat: "Opening Balances", reason: "Opening balance columns" };
  if (looksLikeTransactions(cols) && ok("Sales & Purchases")) return { cat: "Sales & Purchases", reason: "Receipt, product and quantity columns" };
  const t = detectType(cols);
  if (t) return { cat: t, reason: "Matching column names" };
  return { cat: hinted ?? "Skip", reason: hinted ? `Sheet name “${sheet.sheet}” (needs mapping)` : "Not recognised" };
}
export const planSheets = (sheets: Sheet[]): Plan[] => sheets.map((sheet) => { const d = detect(sheet); return { id: `${sheet.file}::${sheet.sheet}`, sheet, cat: d.cat, map: suggestFor(d.cat, sheet.columns), reason: d.reason }; });

const KEYS = ["shopbook.erp", "shopbook.importBatches", "shopbook.importHistory"];
const snapshot = () => KEYS.map((key) => [key, localStorage.getItem(key)] as const);
const restore = (snap: ReturnType<typeof snapshot>) => { for (const [key, v] of snap) v === null ? localStorage.removeItem(key) : localStorage.setItem(key, v); window.dispatchEvent(new Event("shopbook-erp")); window.dispatchEvent(new Event("shopbook-prefs")); };

function runStage(cat: Exclude<FullCat, "Skip">, plans: Plan[], o: FullOptions): StageResult {
  const sheets = plans.map((p) => `${p.sheet.file} • ${p.sheet.sheet}`), base: StageResult = { cat, sheets, total: 0, created: 0, updated: 0, skipped: 0, rejected: 0, issues: [] };
  if (cat === "Opening Balances") {
    const rows = previewOB(load(), plans.map((p) => ({ sheet: p.sheet, mapping: p.map as OBMapping })), o.dateFmt);
    const b = applyOB(rows, [...new Set(plans.map((p) => p.sheet.file))]);
    return { ...base, total: rows.length, created: b.created, skipped: b.skipped, rejected: b.rejected, issues: rows.flatMap((r) => r.issues) };
  }
  if (cat === "Sales & Purchases") {
    const opt: TXOptions = { stock: o.stock, createProducts: true, dateFmt: o.dateFmt };
    const groups = previewTX(load(), plans.map((p) => ({ sheet: p.sheet, mapping: p.map as TXMapping })), opt);
    const r = applyTX(groups, opt);
    return { ...base, total: groups.length, created: r.sales + r.purchases, skipped: r.skipped, rejected: r.rejected, issues: groups.flatMap((g) => g.issues) };
  }
  if (cat === "Returns") {
    const groups = previewRT(load(), plans.map((p) => ({ sheet: p.sheet, mapping: p.map as RTMapping })));
    const r = applyRT(groups);
    return { ...base, total: groups.length, created: r.sales + r.purchases, skipped: r.skipped, rejected: r.rejected, issues: groups.flatMap((g) => g.issues) };
  }
  for (const p of plans) {
    const colMap: Record<string, string> = {}; for (const [f, c] of Object.entries(p.map)) if (c) colMap[c] = f;
    const rows = previewRows(load(), p.sheet.rows, cat, colMap, new Set(Object.keys(p.map).filter((f) => p.map[f])));
    const h = applyImport(cat, p.sheet.file, rows, colMap, "skip");
    base.total += h.total; base.created += h.imported; base.updated += h.updated; base.skipped += h.skipped; base.rejected += h.failed;
    base.issues.push(...h.errors.map((e) => ({ ...e, file: p.sheet.file, sheet: p.sheet.sheet })));
  }
  return base;
}

function runAll(plans: Plan[], o: FullOptions, stopOnError: boolean): StageResult[] {
  const out: StageResult[] = [];
  for (const cat of FULL_ORDER) {
    const group = plans.filter((p) => p.cat === cat); if (!group.length) continue;
    try { out.push(runStage(cat, group, o)); }
    catch (e) { const msg = e instanceof Error ? e.message : String(e); if (stopOnError) throw Object.assign(new Error(`${cat}: ${msg}`), { results: out }); out.push({ cat, sheets: group.map((p) => p.sheet.sheet), total: 0, created: 0, updated: 0, skipped: 0, rejected: 0, issues: [], error: msg }); }
  }
  return out;
}
const usable = (plans: Plan[]) => plans.filter((p) => p.cat !== "Skip" && !missing(p).length);

/** Validates by really running every stage in order on the current shop data, then restoring it.
 * Later sheets see records created by earlier ones, so results match the real import exactly. */
export function previewFull(plans: Plan[], o: FullOptions): StageResult[] {
  const snap = snapshot();
  try { return runAll(usable(plans), o, false); } finally { restore(snap); }
}

/** All-or-nothing import. Records one combined batch in Import History. */
export function importFull(plans: Plan[], o: FullOptions): { results: StageResult[]; batch: ImportBatch } {
  const snap = snapshot(), go = usable(plans);
  let results: StageResult[];
  try { results = runAll(go, o, true); }
  catch (e) { restore(snap); throw e; }
  // Replace the per-stage history entries with one combined Full Business Import entry.
  for (const [key, v] of snap) if (key !== "shopbook.erp") v === null ? localStorage.removeItem(key) : localStorage.setItem(key, v);
  const sum = (f: "created" | "updated" | "skipped" | "rejected") => results.reduce((a, r) => a + r[f], 0);
  const batch: ImportBatch = { id: `IMP-${Date.now().toString().slice(-6)}`, at: Date.now(), user: "Admin", files: [...new Set(go.map((p) => p.sheet.file))], categories: ["Full Business Import", ...results.map((r) => r.cat)], status: sum("rejected") ? "Completed with Errors" : "Completed", created: sum("created"), updated: sum("updated"), skipped: sum("skipped"), rejected: sum("rejected"), reconciliation: results.map((r) => `${r.cat}: ${r.created} new, ${r.updated} updated, ${r.skipped} skipped, ${r.rejected} rejected`), errors: results.flatMap((r) => r.issues) } as ImportBatch;
  saveBatch(batch);
  return { results, batch };
}

/** Blank Full Business Import workbook: one sheet per category, headers = field labels (* = required). Empty sheets are ignored on upload. */
export async function fullTemplate(): Promise<Blob> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const help = [["SHOPBOOK Full Business Import template"], ["Fill one row per record in each sheet. Columns marked * are required. Leave sheets you don't need empty — they are skipped."], ["Dates: YYYY-MM-DD. Amounts: numbers only. Sales & Purchases / Returns: one item per row; rows sharing a receipt number become one transaction."], ["Import order is automatic: " + FULL_ORDER.join(" → ")]];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(help), "Instructions");
  for (const c of FULL_ORDER) {
    const heads = fieldsFor(c).map((f) => f.label + (f.required ? " *" : ""));
    const ws = XLSX.utils.aoa_to_sheet([heads]);
    ws["!cols"] = heads.map((h) => ({ wch: Math.max(12, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, c.replace(/[\\/?*[\]:&]/g, "-").slice(0, 31));
  }
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
