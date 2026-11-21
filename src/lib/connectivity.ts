import { useSyncExternalStore } from "react";

export const ACTIVE_CHECK_MS = 5000;
/** `failures`: server checks failed in a row (internet on). One miss can be a slow moment, so the screen says offline from two. */
export type Connectivity = { internet: boolean; backend: "unknown" | "up" | "down"; checking: boolean; lastOk: number; failures?: number };
export type VisibleConnection = "online" | "connecting" | "offline" | "syncing";
const initial: Connectivity = { internet: true, backend: "unknown", checking: false, lastOk: 0, failures: 0 };
let state = initial;
const listeners = new Set<() => void>();
let retry: () => Promise<void> = async () => {};
export const getConnectivity = () => state;
const publish = (patch: Partial<Connectivity>) => { state = { ...state, ...patch }; listeners.forEach((f) => f()); };
/** Why the app is offline, for the words on screen: no internet at all, or internet but the server isn't answering. */
export function offlineReason(s: Connectivity): "internet" | "server" | null {
  if (!s.internet) return "internet";
  return s.backend === "down" && (s.failures ?? 2) >= 2 ? "server" : null;
}
export function connectionLabel(s: Connectivity, syncing: boolean): VisibleConnection {
  if (offlineReason(s)) return "offline";
  if (s.backend === "down") return "connecting";
  if (s.backend === "unknown") return "connecting";
  return syncing ? "syncing" : "online";
}
export function useConnectivity() {
  const value = useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, getConnectivity, () => initial);
  return { ...value, retry: () => retry() };
}
/** One root-owned monitor. Successful probes test auth AND the application database. */
export function startConnectivity(probe?: (signal: AbortSignal) => Promise<boolean>) {
  let stopped = false, running: Promise<void> | undefined, controller: AbortController | undefined, generation = 0;
  const test = probe ?? (async (signal: AbortSignal) => {
    const url = import.meta.env["VITE_SUPABASE_URL"], key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return false;
    const headers = { apikey: key };
    const results = await Promise.all([
      fetch(`${url}/auth/v1/health`, { headers, signal, cache: "no-store" }),
      fetch(`${url}/rest/v1/rpc/shopbook_health`, { method: "POST", headers, signal, cache: "no-store" }),
    ]);
    return results.every((r) => r.ok);
  });
  const check = (): Promise<void> => {
    if (running) return running;
    if (stopped || document.visibilityState !== "visible") return Promise.resolve();
    if (!navigator.onLine) { publish({ internet: false, backend: "down", checking: false }); return Promise.resolve(); }
    const id = ++generation;
    controller = new AbortController();
    const signal = controller.signal;
    const timeout = setTimeout(() => controller?.abort(), 4000);
    publish({ internet: true, checking: true });
    running = (async () => {
      let ok = false;
      try { ok = await test(signal); } catch { /* Timeout and transport failure are offline, not transaction errors. */ }
      finally {
        clearTimeout(timeout);
        if (!stopped && id === generation) {
          publish({ internet: navigator.onLine, checking: false, backend: ok && navigator.onLine ? "up" : "down", failures: ok ? 0 : (state.failures ?? 0) + 1, ...(ok && navigator.onLine ? { lastOk: Date.now() } : {}) });
          window.dispatchEvent(new Event(ok ? "shopbook-backend-ready" : "shopbook-backend-down"));
        }
        running = undefined;
      }
    })();
    return running;
  };
  const offline = () => { generation++; controller?.abort(); publish({ internet: false, backend: "down", checking: false }); };
  const foreground = () => { if (document.visibilityState === "visible") void check(); };
  const interval = setInterval(() => { void check(); }, ACTIVE_CHECK_MS);
  retry = async () => { await check(); window.dispatchEvent(new Event("shopbook-sync-now")); };
  window.addEventListener("offline", offline); window.addEventListener("online", check); document.addEventListener("visibilitychange", foreground);
  void check();
  return () => { stopped = true; generation++; controller?.abort(); clearInterval(interval); window.removeEventListener("offline", offline); window.removeEventListener("online", check); document.removeEventListener("visibilitychange", foreground); retry = async () => {}; };
}