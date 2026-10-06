// Device backup file: a full copy of the ERP records that can be downloaded and restored.
import { commit, load, type ErpState } from "@/lib/erp";

const KEY = "shopbook.erp";
const LAST = "shopbook.lastBackup";
const ARRAYS: (keyof ErpState)[] = ["products", "categories", "brands", "movements", "transfers", "audit", "customers", "sales", "payments", "returns", "cash", "employees", "commissions", "payrolls", "payrollPayments"];

export function backupJson(shop: string) {
  const out = JSON.stringify({ app: "SHOPBOOK", version: 1, shop, at: Date.now(), data: load() });
  localStorage.setItem(LAST, String(Date.now()));
  return out;
}
export const lastBackup = () => Number(localStorage.getItem(LAST) || 0);

/** Validates the whole file before replacing anything; current records are kept if it is invalid. */
export function restoreJson(text: string) {
  let f: { app?: string; data?: Record<string, unknown> };
  try { f = JSON.parse(text); } catch { throw new Error("This is not a SHOPBOOK backup file"); }
  if (f?.app !== "SHOPBOOK" || !f.data || typeof f.data !== "object") throw new Error("This is not a SHOPBOOK backup file");
  const d = f.data;
  for (const k of ARRAYS) if (d[k] !== undefined && !Array.isArray(d[k])) throw new Error("Backup file is damaged");
  if (!Array.isArray(d["products"]) || !(d["products"] as { id?: unknown; qty?: unknown }[]).every((p) => typeof p.id === "string" && typeof p.qty === "number")) throw new Error("Backup file is damaged");
  const previous = localStorage.getItem(KEY);
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    commit((_s, c) => c.audit("BACKUP RESTORED", new Date().toISOString()));
  } catch (e) {
    if (previous === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, previous);
    throw e;
  }
}
