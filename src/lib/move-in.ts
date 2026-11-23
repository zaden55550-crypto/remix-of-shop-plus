// Moving in from another system (owner, 2026-11-23): recognise where a file came from, open zip exports, clean the rows up before
// they are saved (merge duplicate products, Kenyan phone numbers in one format, missing prices flagged), and undo the last import
// for 24 hours. The import itself stays full-import.ts (preview first, then one all-or-nothing confirm).
import { commit, ErpError, load, type ErpState } from "@/lib/erp";
import type { Sheet } from "@/lib/opening-import";

const norm = (x: unknown) => String(x ?? "").trim();
const key = (x: unknown) => norm(x).toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------- Which system the files came from ---------- */
const SIGNS: [string, string[]][] = [
  ["Odoo", ["internalreference", "quantityonhand", "productcategory", "salesprice", "displayname"]],
  ["QuickBooks", ["productservicename", "salespricerate", "purchasecost", "qtyonhand", "customerdisplayname"]],
  ["Zoho Inventory / Books", ["itemname", "stockonhand", "openingstock", "categoryname", "purchaseprice", "sellingprice"]],
  ["Loyverse", ["handle", "instock", "soldbyweight", "trackstock", "defaultpricing"]],
  ["Sage", ["stockcode", "qtyinstock", "salesprice1", "accountref"]],
];
/** The most likely source system for these sheets, or undefined when they look like a plain spreadsheet. */
export function detectSource(sheets: Pick<Sheet, "columns">[]): string | undefined {
  const cols = new Set(sheets.flatMap((s) => s.columns.map((c) => key(c).replace(/^(price|instock)[a-z0-9]+$/, "$1"))));
  let best: string | undefined, score = 1;
  for (const [name, marks] of SIGNS) {
    const hit = marks.filter((m) => cols.has(m)).length;
    if (hit > score) { best = name; score = hit; }
  }
  return best;
}

/* ---------- Zip exports ---------- */
/** Opens any .zip files into the CSV and Excel files inside them; other files pass through. */
export async function expandZips(files: File[]): Promise<File[]> {
  const out: File[] = [];
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) { out.push(f); continue; }
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await f.arrayBuffer());
    for (const entry of Object.values(zip.files)) {
      if (entry.dir || !/\.(csv|xlsx|xls)$/i.test(entry.name) || /(^|\/)(__MACOSX|\.)/.test(entry.name)) continue;
      out.push(new File([await entry.async("blob")], entry.name.split("/").pop() ?? entry.name));
    }
  }
  return out;
}

/* ---------- Clean-up before saving ---------- */
export type CleanReport = { merged: number; phones: number; missingPrices: number };
const has = (cols: string[], names: string[]) => cols.find((c) => names.includes(key(c)));
/** A Kenyan mobile or landline written the local way, 07… or 01… (owner, 2026-11-23), whatever way it was typed (+254…, 254…, 7…,
 *  with spaces). Others are left as typed. */
export function tidyPhone(v: string): string {
  const d = v.replace(/[\s\-().]/g, "");
  if (/^\+?254[17]\d{8}$/.test(d)) return `0${d.replace(/^\+?254/, "")}`;
  if (/^0[17]\d{8}$/.test(d)) return d;
  if (/^[17]\d{8}$/.test(d)) return `0${d}`;
  return v.trim();
}
/** Merges product rows that share a code, barcode or name (stock added up, the last non-empty value kept for the rest), writes phone
 *  numbers in one format, and counts products without a selling price. The sheets themselves are not changed. */
export function cleanSheets(sheets: Sheet[]): { sheets: Sheet[]; report: CleanReport } {
  const report: CleanReport = { merged: 0, phones: 0, missingPrices: 0 };
  const out = sheets.map((sh) => {
    const c = sh.columns;
    const phoneCols = c.filter((x) => /phone|mobile|tel/i.test(x));
    let rows = sh.rows.map((r) => {
      const next = { ...r };
      for (const p of phoneCols) { const was = norm(r[p]); if (!was) continue; const now = tidyPhone(was); if (now !== was) { next[p] = now; report.phones++; } }
      return next;
    });
    const name = has(c, ["name", "productname", "itemname", "productservicename", "product", "item", "description"]);
    const code = has(c, ["sku", "internalreference", "itemcode", "productcode", "code", "handle", "stockcode"]);
    const bar = has(c, ["barcode", "ean", "upc", "gtin", "ean13"]);
    const qty = has(c, ["qty", "quantity", "quantityonhand", "qtyonhand", "stockonhand", "stock", "instock", "openingstock", "onhand"]);
    const price = has(c, ["sell", "sellingprice", "salesprice", "price", "salespricerate", "retailprice", "unitprice", "listprice"]);
    const productLike = !!name && !!(price || qty || code || bar) && !c.some((x) => /customer|supplier|vendor|invoice|receipt/i.test(x));
    if (!productLike) return { ...sh, rows };
    const seen = new Map<string, Record<string, unknown>>();
    const merged: Record<string, unknown>[] = [];
    for (const r of rows) {
      const id = (code && key(r[code])) || (bar && key(r[bar])) || key(r[name!]);
      if (!id) { merged.push(r); continue; }
      const first = seen.get(id);
      if (!first) { seen.set(id, r); merged.push(r); continue; }
      report.merged++;
      for (const col of c) {
        if (col === qty) { const a = Number(norm(first[col]).replace(/,/g, "")) || 0, b = Number(norm(r[col]).replace(/,/g, "")) || 0; first[col] = String(Math.round((a + b) * 1000) / 1000); }
        else if (norm(r[col])) first[col] = r[col];
      }
    }
    rows = merged;
    if (price) report.missingPrices += rows.filter((r) => !(Number(norm(r[price]).replace(/,/g, "")) > 0)).length;
    return { ...sh, rows };
  });
  return { sheets: out, report };
}

/* ---------- Undo the last import (24 hours) ---------- */
const UNDO = "shopbook.lastImportUndo";
export const UNDO_HOURS = 24;
type Rec = { id: string };
type UndoRecord = { batchId: string; at: number; head: string | undefined; created: Record<string, string[]>; changed: Record<string, Rec[]> };
/** Remembers what an import created and what it changed (the earlier versions), so it can be taken back. */
export function rememberImport(before: ErpState, after: ErpState, batchId: string) {
  const created: Record<string, string[]> = {}, changed: Record<string, Rec[]> = {};
  for (const k of Object.keys(after) as (keyof ErpState)[]) {
    if (k === "seq" || k === "audit" || !Array.isArray(after[k])) continue;
    const old = new Map((before[k] as Rec[]).map((r) => [r.id, r]));
    for (const r of after[k] as Rec[]) {
      const was = old.get(r.id);
      if (!was) (created[k] ??= []).push(r.id);
      else if (JSON.stringify(was) !== JSON.stringify(r)) (changed[k] ??= []).push(was);
    }
  }
  const record: UndoRecord = { batchId, at: Date.now(), head: after.audit[0]?.id, created, changed };
  try { localStorage.setItem(UNDO, JSON.stringify(record)); } catch { /* too large to keep: this import can't be undone */ localStorage.removeItem(UNDO); }
}
const readUndo = (): UndoRecord | null => { try { return JSON.parse(localStorage.getItem(UNDO) || "null"); } catch { return null; } };
/** Whether the last import can still be undone, and why not. */
export function undoState(s: Pick<ErpState, "audit"> = load()): { batchId: string; at: number; ok: boolean; why?: string } | null {
  const u = readUndo();
  if (!u) return null;
  if (Date.now() - u.at > UNDO_HOURS * 3600_000) return { batchId: u.batchId, at: u.at, ok: false, why: "More than 24 hours have passed" };
  if (s.audit[0]?.id !== u.head) return { batchId: u.batchId, at: u.at, ok: false, why: "Other records were saved after the import" };
  return { batchId: u.batchId, at: u.at, ok: true };
}
/** Takes the last import back: records it created are removed (products are archived), records it changed get their earlier
 *  version, and every stock change is reversed by an audited adjustment, so stock history stays whole. Only while nothing else has
 *  been recorded since and within 24 hours. */
export const undoLastImport = () => commit((s, c) => {
  const u = readUndo(), st = undoState(s);
  if (!u || !st) throw new ErpError("There is no import to undo");
  if (!st.ok) throw new ErpError(`${st.why}, so the import can't be undone`);
  const createdMoves = new Set(u.created["movements"] ?? []);
  for (const m of s.movements.filter((x) => createdMoves.has(x.id))) if (m.qty) c.move(m.productId, "ADJUSTMENT", -m.qty, "Import undone", u.batchId, m.locationId);
  const st2 = s as unknown as Record<string, Rec[]>;
  for (const [k, ids] of Object.entries(u.created)) {
    if (k === "movements") continue;
    const gone = new Set(ids);
    if (k === "products") st2[k] = st2[k]!.map((p) => (gone.has(p.id) ? { ...p, archived: true } : p));
    else st2[k] = (st2[k] ?? []).filter((r) => !gone.has(r.id));
  }
  for (const [k, prev] of Object.entries(u.changed)) {
    if (k === "movements") continue;
    const old = new Map(prev.map((r) => [r.id, r]));
    st2[k] = (st2[k] ?? []).map((r) => { const was = old.get(r.id); if (!was) return r; return k === "products" ? { ...was, qty: (r as Rec & { qty: number }).qty } as Rec : was; });
  }
  c.audit("IMPORT UNDONE", u.batchId);
  localStorage.removeItem(UNDO);
});
