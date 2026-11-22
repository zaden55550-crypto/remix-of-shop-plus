import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { empty, load, type ErpState } from "@/lib/erp";
import { applyOperation } from "@/lib/sync.functions";
import { HELD_ON_DEVICE, businessId, createOperation, getOutbox, pendingOperations, persistErp, retryDelay, updateOperation } from "@/lib/outbox";
import { getConnectivity, ACTIVE_CHECK_MS } from "@/lib/connectivity";
import { canRecord, store } from "@/lib/shopbook";

/** Live multi-phone sync of the whole ERP for one signed-in owner.
 * Records carry ids, so phones merge by id (union); for the same id the side doing the merge keeps its own copy. */
export type SyncState = { phase: "local" | "offline" | "syncing" | "live" | "failed"; at: number; pending?: number; error?: string | undefined };
let state: SyncState = { phase: "local", at: 0 };
/** Shown while changes made before the trial ended are waiting for a plan. */
export const HELD = "Your free trial has ended. Changes saved on this device before it ended are kept here and will be sent after you subscribe.";
const EVT = "shopbook-sync-status";
const publish = (s: SyncState) => { state = s; window.dispatchEvent(new Event(EVT)); };
export function useSyncStatus() { const [s, set] = useState(state); useEffect(() => { const f = () => set(state); f(); window.addEventListener(EVT, f); return () => window.removeEventListener(EVT, f); }, []); return s; }

export function mergeErp(mine: ErpState, theirs: ErpState): ErpState {
  const out = empty() as Record<string, unknown>;
  for (const key of Object.keys(out) as (keyof ErpState)[]) {
    if (key === "seq") { const seq: Record<string, number> = { ...theirs.seq }; for (const [k, v] of Object.entries(mine.seq ?? {})) seq[k] = Math.max(v, seq[k] ?? 0); out["seq"] = seq; continue; }
    // Reset markers: records older than the newest reset of this collection are dropped, so an old phone can't bring deleted data back.
    const mk = `__reset:${String(key)}`, mr = mine.seq?.[mk] ?? 0, tr = theirs.seq?.[mk] ?? 0, R = Math.max(mr, tr);
    const keep = (own: number) => (x: { at?: number; createdAt?: number }) => own >= R || (x.at ?? x.createdAt ?? 0) > R;
    const a = ((mine[key] ?? []) as { id: string; at?: number; createdAt?: number }[]).filter(keep(mr)), b = ((theirs[key] ?? []) as { id: string; at?: number; createdAt?: number }[]).filter(keep(tr));
    const seen = new Set(a.map((x) => x.id)), merged = [...a, ...b.filter((x) => !seen.has(x.id))];
    if (merged.some((x) => typeof x.at === "number")) merged.sort((x, y) => (y.at ?? 0) - (x.at ?? 0));
    out[key] = merged;
  }
  const s = out as ErpState;
  // Stock follows the newest recorded movement so both phones agree on quantity.
  const latest = new Map<string, number>(); for (const m of s.movements) if (!latest.has(m.productId)) latest.set(m.productId, m.next);
  s.products = s.products.map((p) => { const qty = latest.get(p.id); return qty === undefined ? p : { ...p, qty }; });
  return s;
}
/** Single coordinator; server applies each immutable operation exactly once. Conflicts stop dependencies. */
export function startShopSync() {
  let stopped = false, busy = false;
  const work = async () => {
    if (stopped || busy || document.visibilityState !== "visible") return;
    if (store.get()?.staff) { publish({ phase: "local", at: 0, pending: 0 }); return; }
    const pending = pendingOperations().length;
    if (!navigator.onLine || getConnectivity().backend !== "up") { publish({ phase: "offline", at: state.at, pending }); return; }
    if (localStorage.getItem("shopbook.session") !== "1") { publish({ phase: "local", at: 0, pending }); return; }
    busy = true;
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) { publish({ phase: "local", at: 0, pending, error: "Sign-in required to resume synchronization" }); return; }
      const owner = data.user.id, business = businessId();
      const binding = await supabase.from("shopbook_sync_business").select("business_id").eq("user_id", owner).maybeSingle();
      if (binding.error) throw new Error(binding.error.message);
      if (binding.data && binding.data.business_id !== business) throw new Error("SYNC_CONFLICT: these device records belong to a different business. Explicit linking is required.");
      const bound = localStorage.getItem("shopbook.syncOwner");
      if (bound && bound !== owner) throw new Error("This device's records belong to another owner. Sign in with the original account.");
      localStorage.setItem("shopbook.syncOwner", owner);
      const validIdentity = () => !stopped && localStorage.getItem("shopbook.session") === "1" && businessId() === business && localStorage.getItem("shopbook.syncOwner") === owner;
      // Recover legacy existing records only once. Never use snapshot merging to overwrite a pending financial operation.
      if (!getOutbox().length && !localStorage.getItem("shopbook.syncInitialized")) {
        const bootstrap = createOperation(empty(), load(), true);
        if (bootstrap) { bootstrap.owner = owner; persistErp(load(), [bootstrap]); }
        localStorage.setItem("shopbook.syncInitialized", "1");
      }
      // After the trial, changes saved on this device before it ended wait here, untouched: they are neither sent nor deleted until a plan is
      // paid for (the server would refuse them anyway). Whether such records should be accepted afterwards is the owner's decision to make.
      if (!canRecord(store.get()) && pendingOperations(owner).length) {
        publish({ phase: "failed", at: state.at, pending: pendingOperations(owner).length, error: HELD });
        return;
      }
      for (const op of pendingOperations(owner)) {
        if (!validIdentity()) return;
        if (op.phase === "conflict" || op.nextRetry > Date.now()) break;
        if (op.owner && op.owner !== owner) throw new Error("Operation belongs to another owner");
        updateOperation(op.id, { owner, attempts: op.attempts + 1 }, "Upload attempted");
        publish({ phase: "syncing", at: state.at, pending: pendingOperations(owner).length });
        try {
          let timeout: ReturnType<typeof setTimeout> | undefined;
          const result = await Promise.race([
            applyOperation({ data: { id: op.id, device: op.device, business: op.business, kind: op.kind, changes: op.changes, seq: op.seq } }),
            new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("Upload timed out; retry will use the same operation ID")), 12000); }),
          ]).finally(() => { if (timeout) clearTimeout(timeout); });
          if (!validIdentity()) return;
          if (result.operationId !== op.id) throw new Error("Server did not acknowledge this operation");
          const at = new Date(result.acknowledgedAt).getTime();
          updateOperation(op.id, { phase: "synced", error: undefined, acknowledgedAt: at, revision: result.revision, nextRetry: 0 }, "Server confirmed persistence");
          publish({ phase: "live", at, pending: pendingOperations(owner).length });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Synchronization failed";
          updateOperation(op.id, { phase: message.includes("SYNC_CONFLICT") ? "conflict" : "failed", error: message, nextRetry: Date.now() + retryDelay(op.attempts + 1) }, message);
          throw e;
        }
      }
      const remaining = pendingOperations(owner);
      if (remaining.length) { publish({ phase: "failed", at: state.at, pending: remaining.length, error: remaining[0]?.error }); return; }
      const r = await supabase.from("shopbook_shop_sync").select("payload,updated_at,revision").eq("user_id", owner).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      if (!validIdentity() || getOutbox().some((op) => op.phase !== "synced")) return;
      if (r.data) {
        // No unacknowledged changes: authoritative server projection is safe to adopt.
        const server = { ...empty(), ...(r.data.payload as unknown as ErpState) };
        // Collections the server doesn't hold yet stay as this device has them (HELD_ON_DEVICE, outbox.ts).
        const mine = load();
        for (const key of HELD_ON_DEVICE) if (!Array.isArray((r.data.payload as Record<string, unknown>)?.[key])) (server as Record<string, unknown>)[key] = (mine as Record<string, unknown>)[key] ?? [];
        for (const key of Object.keys(empty()) as (keyof ErpState)[]) if (Array.isArray(server[key])) (server[key] as { at?: number }[]).sort((a,b) => (b.at ?? 0) - (a.at ?? 0));
        persistErp(server);
        window.dispatchEvent(new Event("shopbook-erp-remote")); window.dispatchEvent(new Event("storage"));
      }
      const ack = getOutbox().reduce((at, op) => op.phase === "synced" ? Math.max(at, op.acknowledgedAt ?? 0) : at, 0);
      publish({ phase: "live", at: ack || (r.data ? new Date(r.data.updated_at).getTime() : 0), pending: 0 });
    } catch (e) { if (!stopped) publish({ phase: "failed", at: state.at, pending: pendingOperations().length, error: e instanceof Error ? e.message : "Synchronization failed" }); }
    finally { busy = false; }
  };
  const run = () => navigator.locks
    ? navigator.locks.request("shopbook-outbox", { ifAvailable: true }, async (lock) => { if (lock) await work(); })
    : work();
  const now = () => { void run(); };
  const retry = () => { for (const op of pendingOperations()) if (op.phase !== "conflict") updateOperation(op.id, { nextRetry: 0 }, "Manual retry requested"); now(); };
  const poll = setInterval(now, ACTIVE_CHECK_MS);
  const events = ["shopbook-erp", "shopbook-backend-ready", "online", "shopbook-session"];
  events.forEach((event) => window.addEventListener(event, now));
  window.addEventListener("shopbook-sync-now", retry);
  const visibility = () => { if (document.visibilityState === "visible") now(); };
  document.addEventListener("visibilitychange", visibility);
  const auth = supabase.auth.onAuthStateChange((_event, session) => {
    const bound = localStorage.getItem("shopbook.syncOwner");
    if (bound && session && session.user.id !== bound) {
      localStorage.removeItem("shopbook.session"); window.dispatchEvent(new Event("shopbook-session"));
      publish({ phase: "local", at: 0, pending: pendingOperations().length, error: "Sign in with the original owner to access this device's records" });
    } else setTimeout(now, 0);
  });
  now();
  return () => { stopped = true; clearInterval(poll); events.forEach((event) => window.removeEventListener(event, now)); window.removeEventListener("shopbook-sync-now", retry); document.removeEventListener("visibilitychange", visibility); auth.data.subscription.unsubscribe(); };
}
