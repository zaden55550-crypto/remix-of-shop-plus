// Business Setup extras (owner, 2026-11-23, suggestions 3, 5, 6, 8 and 9 from the ERP comparison):
//  3. many locations at once from a spreadsheet;  5. hardware for each counter (kept on this device);  6. a history of setup changes
//  from the audit log;  8. checking an M-Pesa statement against recorded sales (read-only, no Safaricom connection);
//  9. a sales export laid out for a tax agent preparing KRA eTIMS returns (not KRA's own upload format, which needs KRA's approval).
import type { ErpState, LocationType } from "@/lib/erp";
import type { Sheet } from "@/lib/opening-import";

const norm = (x: unknown) => String(x ?? "").trim();
const k = (x: unknown) => norm(x).toLowerCase().replace(/[^a-z0-9]/g, "");
const col = (cols: string[], names: string[]) => cols.find((c) => names.includes(k(c)));

/* ---------- 3. Locations from a spreadsheet ---------- */
export type LocationLine = { type: LocationType; name: string; phone: string; code: string; address: string; counters?: number | undefined };
/** Reads Type, Name, Phone, Number and Address columns (any order, common names). Rows without a name are skipped. */
export function locationsFromSheets(sheets: Sheet[]): { lines: LocationLine[]; skipped: number } {
  const lines: LocationLine[] = [];
  let skipped = 0;
  for (const sh of sheets) {
    const c = {
      type: col(sh.columns, ["type", "locationtype", "kind", "shopwarehouse"]),
      name: col(sh.columns, ["name", "locationname", "shopname", "warehousename", "branch", "branchname", "location"]),
      phone: col(sh.columns, ["phone", "phonenumber", "tel", "mobile", "telephone"]),
      code: col(sh.columns, ["number", "code", "locationnumber", "no", "shopno", "id"]),
      address: col(sh.columns, ["address", "street", "town", "area"]),
      counters: col(sh.columns, ["counters", "tills", "counter"]),
    };
    if (!c.name) { skipped += sh.rows.length; continue; }
    for (const row of sh.rows) {
      const name = norm(row[c.name]);
      if (!name) { skipped++; continue; }
      const t = k(c.type ? row[c.type] : "");
      const type: LocationType = /warehouse|store|stock|depot|godown/.test(t) ? "store" : "shop";
      const n = Number(norm(c.counters ? row[c.counters] : ""));
      lines.push({ type, name: name.slice(0, 80), phone: norm(c.phone ? row[c.phone] : ""), code: norm(c.code ? row[c.code] : "").toUpperCase().slice(0, 20), address: norm(c.address ? row[c.address] : "").slice(0, 160), ...(type === "shop" && Number.isInteger(n) && n > 1 ? { counters: n } : {}) });
    }
  }
  return { lines, skipped };
}
export const LOCATIONS_TEMPLATE = "Type,Name,Phone,Number,Address,Counters\nShop,Westlands Branch,0712345678,S002,Westlands Mall,2\nWarehouse,Industrial Area Store,0722000000,W001,Enterprise Road,\n";

/* ---------- 5. Hardware for each counter (this device) ---------- */
export type CounterHardware = { printer: "none" | "58mm" | "80mm" | "A4"; scanner: boolean; drawer: boolean };
const HW = "shopbook.counterHardware";
const hwAll = (): Record<string, CounterHardware> => { try { return JSON.parse(localStorage.getItem(HW) || "{}") ?? {}; } catch { return {}; } };
export const hardwareKey = (shop: string, counter: number) => `${shop}#${counter}`;
export const counterHardware = (shop: string, counter: number): CounterHardware => hwAll()[hardwareKey(shop, counter)] ?? { printer: "80mm", scanner: true, drawer: false };
export function saveCounterHardware(shop: string, counter: number, hw: CounterHardware) {
  const all = hwAll();
  all[hardwareKey(shop, counter)] = hw;
  try { localStorage.setItem(HW, JSON.stringify(all)); } catch { /* storage full: the choice lasts this session only */ }
}

/* ---------- 6. Setup history ---------- */
const SETUP_ACTIONS = /^(LOCATION|NUMBERING|STAFF PIN|OPENING|EMPLOYEE|TILL TURN|BUSINESS|SETUP|DEMO DATA|OPENING BALANCES)/;
/** The audit entries about the business's setup, newest first. */
export const setupHistory = (s: Pick<ErpState, "audit">, limit = 100) => s.audit.filter((a) => SETUP_ACTIONS.test(a.action)).slice(0, limit);

/* ---------- 8. M-Pesa statement check ---------- */
export type MpesaLine = { receipt: string; at: number; amount: number; details: string };
export type MpesaMatch = { line: MpesaLine; saleRef?: string | undefined };
const parseWhen = (x: unknown) => { const t = Date.parse(norm(x).replace(/^(\d{2})\/(\d{2})\/(\d{4})/, "$3-$2-$1")); return Number.isFinite(t) ? t : NaN; };
const amount = (x: unknown) => Number(norm(x).replace(/[,\s]|ksh|kes/gi, ""));
/** Reads a Safaricom M-Pesa statement (Receipt No., Completion Time, Details, Paid In). Only money received is kept. */
export function mpesaFromSheets(sheets: Sheet[]): MpesaLine[] {
  const out: MpesaLine[] = [];
  for (const sh of sheets) {
    const receipt = col(sh.columns, ["receiptno", "receipt", "receiptnumber", "transactionid", "code"]);
    const when = col(sh.columns, ["completiontime", "date", "time", "transactiontime", "initiationtime"]);
    const paidIn = col(sh.columns, ["paidin", "amount", "credit", "moneyin"]);
    const details = col(sh.columns, ["details", "description", "otherpartyinfo", "narration"]);
    if (!receipt || !when || !paidIn) continue;
    for (const row of sh.rows) {
      const a = amount(row[paidIn]), at = parseWhen(row[when]);
      if (!(a > 0) || !Number.isFinite(at)) continue;
      out.push({ receipt: norm(row[receipt]).toUpperCase(), at, amount: Math.round(a * 100) / 100, details: norm(details ? row[details] : "") });
    }
  }
  return out;
}
/** Matches each M-Pesa receipt to one sale paid by M-Pesa for the same amount within 30 minutes (closest first, each sale once).
 *  Read-only: nothing is recorded. Unmatched money may be a sale not recorded; unmatched sales may be M-Pesa that never arrived. */
export function matchMpesa(s: Pick<ErpState, "sales">, lines: MpesaLine[], windowMs = 30 * 60_000) {
  const sales = s.sales.filter((x) => (x.pay.mpesa ?? 0) > 0);
  const used = new Set<string>();
  const matched: MpesaMatch[] = [], unmatched: MpesaLine[] = [];
  for (const line of [...lines].sort((a, b) => a.at - b.at)) {
    const best = sales.filter((x) => !used.has(x.id) && Math.abs((x.pay.mpesa ?? 0) - line.amount) < 0.01 && Math.abs(x.at - line.at) <= windowMs)
      .sort((a, b) => Math.abs(a.at - line.at) - Math.abs(b.at - line.at))[0];
    if (best) { used.add(best.id); matched.push({ line, saleRef: best.ref }); } else unmatched.push(line);
  }
  const from = lines.length ? Math.min(...lines.map((l) => l.at)) - windowMs : 0, to = lines.length ? Math.max(...lines.map((l) => l.at)) + windowMs : 0;
  const salesWithoutMoney = sales.filter((x) => !used.has(x.id) && x.at >= from && x.at <= to);
  return { matched, unmatched, salesWithoutMoney };
}

/* ---------- 9. Sales export for eTIMS preparation ---------- */
const cell = (x: unknown) => `"${String(x ?? "").replaceAll('"', '""')}"`;
/** One line per item sold in the period, with the seller's PIN, the sale's VAT share and totals. For a tax agent; not KRA's format. */
export function etimsCsv(s: Pick<ErpState, "sales" | "customers">, sellerPin: string, from: number, to: number) {
  const head = ["Invoice No", "Date", "Seller PIN", "Customer", "Item", "Quantity", "Unit Price", "Line Total", "VAT on invoice", "Invoice Total"];
  const rows = s.sales.filter((x) => x.at >= from && x.at <= to).flatMap((x) => {
    const who = x.customerId ? s.customers.find((c) => c.id === x.customerId)?.name ?? "" : "";
    return x.items.map((i) => [x.ref, new Date(x.at).toISOString().slice(0, 10), sellerPin, who, i.name, i.qty, i.price, Math.round(i.qty * i.price * 100) / 100, x.vat ?? 0, x.total]);
  });
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
