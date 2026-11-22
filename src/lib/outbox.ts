import type { ErpState, StaffIntent } from "@/lib/erp";
import { randomUUID } from "@/lib/id";

export type Change = { collection: string; id: string; before: unknown; after: unknown };
export type Operation = { id: string; business: string; owner: string | null; device: string; kind: string; createdAt: number; changes: Change[]; seq: Record<string, number>; phase: "pending" | "failed" | "conflict" | "synced"; attempts: number; nextRetry: number; error?: string | undefined; acknowledgedAt?: number; revision?: number; history: { at: number; event: string }[];
  /** An employee's device sends what happened, and the server records it against the real records. */
  intent?: StaffIntent | undefined };
export const ERP_KEY = "shopbook.erp";
export function businessId(): string {
  const account = JSON.parse(localStorage.getItem("shopbook.account") || "null");
  return account?.businessId || `${account?.shopName ?? "device"}:${account?.phone ?? ""}`;
}
/** Collections a server without proposed 0021 refuses. Until the server says it takes them (its shopbook_sync_collections(),
 *  asked by shop-sync.ts), they stay on this device and in backups; their stock movements and payments sync as usual. */
export const TRADE_DOCS: readonly string[] = ["laybys", "quotations", "prescriptions"];
const SERVER_TAKES = "shopbook.serverTakesTradeDocs";
export function serverTakesTradeDocs() { try { return localStorage.getItem(SERVER_TAKES) === "1"; } catch { return false; } }
/** Records what the server said it accepts (or that it couldn't say: then everything new stays held). */
export function noteServerCollections(list: unknown) {
  const yes = Array.isArray(list) && TRADE_DOCS.every((c) => list.includes(c));
  try { if (yes) localStorage.setItem(SERVER_TAKES, "1"); else localStorage.removeItem(SERVER_TAKES); } catch { /* storage unavailable: stay held */ }
  return yes;
}
/** The collections kept on this device right now. */
export const heldOnDevice = (): readonly string[] => (serverTakesTradeDocs() ? [] : TRADE_DOCS);
export function diffRecords(before: ErpState, after: ErpState): Change[] {
  const changes: Change[] = [], held = heldOnDevice();
  for (const collection of Object.keys(after) as (keyof ErpState)[]) {
    if (collection === "seq" || held.includes(collection)) continue;
    const a = new Map(before[collection].map((r) => [r.id, r]));
    const b = new Map(after[collection].map((r) => [r.id, r]));
    for (const id of new Set([...a.keys(), ...b.keys()])) {
      const old = a.get(id) ?? null, next = b.get(id) ?? null;
      if (JSON.stringify(old) !== JSON.stringify(next)) changes.push({ collection, id, before: old, after: next });
    }
  }
  return changes;
}
export function getOutbox(): Operation[] {
  const raw = JSON.parse(localStorage.getItem(ERP_KEY) || "{}");
  return raw.__outbox ?? [];
}
export function createOperation(before: ErpState, after: ErpState, bootstrap = false): Operation | null {
  const changes = diffRecords(before, after);
  if (!changes.length && JSON.stringify(before.seq) === JSON.stringify(after.seq)) return null;
  let device = localStorage.getItem("shopbook.deviceId");
  if (!device) { device = randomUUID(); localStorage.setItem("shopbook.deviceId", device); }
  return { id: randomUUID(), business: businessId(), owner: localStorage.getItem("shopbook.syncOwner"), device, kind: bootstrap ? "EXISTING RECORDS" : after.audit.find((r) => !before.audit.some((old) => old.id === r.id))?.action ?? "ERP CHANGE", createdAt: Date.now(), changes, seq: after.seq, phase: "pending", attempts: 0, nextRetry: 0, history: [{ at: Date.now(), event: "Saved locally" }] };
}
/** ERP projection and pending operations share ONE atomic storage write. */
export function persistErp(snapshot: ErpState, outbox = getOutbox()) {
  const confirmed = outbox.filter((o) => o.phase === "synced").slice(-100).map((o) => ({ ...o, changes: [], seq: {}, history: o.history.slice(-1) }));
  localStorage.setItem(ERP_KEY, JSON.stringify({ ...snapshot, __outbox: [...confirmed, ...outbox.filter((o) => o.phase !== "synced")] }));
}
export function updateOperation(id: string, patch: Partial<Operation>, event: string) {
  const raw = JSON.parse(localStorage.getItem(ERP_KEY) || "{}");
  raw.__outbox = (raw.__outbox ?? []).map((op: Operation) => op.id === id ? { ...op, ...patch, history: [...op.history.slice(-19), { at: Date.now(), event }] } : op);
  localStorage.setItem(ERP_KEY, JSON.stringify(raw));
}
export function pendingOperations(owner?: string) {
  return getOutbox().filter((op) => op.business === businessId() && (!owner || !op.owner || op.owner === owner) && op.phase !== "synced");
}
export const retryDelay = (attempts: number) => Math.min(60000, 1000 * 2 ** Math.min(attempts, 6));