import type { ErpState } from "@/lib/erp";

export type Change = { collection: string; id: string; before: unknown; after: unknown };
export type Operation = { id: string; business: string; owner: string | null; device: string; kind: string; createdAt: number; changes: Change[]; seq: Record<string, number>; phase: "pending" | "failed" | "conflict" | "synced"; attempts: number; nextRetry: number; error?: string | undefined; acknowledgedAt?: number; revision?: number; history: { at: number; event: string }[] };
export const ERP_KEY = "shopbook.erp";
export function businessId(): string {
  const account = JSON.parse(localStorage.getItem("shopbook.account") || "null");
  return account?.businessId || `${account?.shopName ?? "device"}:${account?.phone ?? ""}`;
}
export function diffRecords(before: ErpState, after: ErpState): Change[] {
  const changes: Change[] = [];
  for (const collection of Object.keys(after) as (keyof ErpState)[]) {
    if (collection === "seq") continue;
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
  if (!device) { device = crypto.randomUUID(); localStorage.setItem("shopbook.deviceId", device); }
  return { id: crypto.randomUUID(), business: businessId(), owner: localStorage.getItem("shopbook.syncOwner"), device, kind: bootstrap ? "EXISTING RECORDS" : after.audit.find((r) => !before.audit.some((old) => old.id === r.id))?.action ?? "ERP CHANGE", createdAt: Date.now(), changes, seq: after.seq, phase: "pending", attempts: 0, nextRetry: 0, history: [{ at: Date.now(), event: "Saved locally" }] };
}
/** ERP projection and pending operations share ONE atomic storage write. */
export function persistErp(snapshot: ErpState, outbox = getOutbox()) {
  localStorage.setItem(ERP_KEY, JSON.stringify({ ...snapshot, __outbox: outbox }));
}
export function updateOperation(id: string, patch: Partial<Operation>, event: string) {
  const raw = JSON.parse(localStorage.getItem(ERP_KEY) || "{}");
  raw.__outbox = (raw.__outbox ?? []).map((op: Operation) => op.id === id ? { ...op, ...patch, history: [...op.history, { at: Date.now(), event }] } : op);
  localStorage.setItem(ERP_KEY, JSON.stringify(raw));
}
export function pendingOperations(owner?: string) {
  return getOutbox().filter((op) => op.business === businessId() && (!owner || !op.owner || op.owner === owner) && op.phase !== "synced");
}
export const retryDelay = (attempts: number) => Math.min(60000, 1000 * 2 ** Math.min(attempts, 6));