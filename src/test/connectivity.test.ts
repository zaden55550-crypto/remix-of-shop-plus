import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVE_CHECK_MS, connectionLabel, getConnectivity, offlineReason, startConnectivity } from "../lib/connectivity";
describe("authoritative connectivity", () => {
  let stop: (() => void) | undefined;
  beforeEach(() => { vi.useFakeTimers(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); Object.defineProperty(navigator, "onLine", { configurable: true, value: true }); });
  afterEach(() => { stop?.(); vi.useRealTimers(); });
  it("checks every 5000ms without outage backoff", async () => {
    const probe = vi.fn().mockResolvedValue(false); stop = startConnectivity(probe);
    await vi.advanceTimersByTimeAsync(20000);
    expect(ACTIVE_CHECK_MS).toBe(5000); expect(probe).toHaveBeenCalledTimes(5); expect(getConnectivity().backend).toBe("down");
  });
  it("immediately checks on return and foreground; suspends while hidden", async () => {
    const probe = vi.fn().mockResolvedValue(true); stop = startConnectivity(probe); await vi.advanceTimersByTimeAsync(0);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await vi.advanceTimersByTimeAsync(15000); expect(probe).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); expect(probe).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event("online")); await vi.advanceTimersByTimeAsync(0); expect(probe).toHaveBeenCalledTimes(3);
  });
  it("does not overlap slow checks or accept a stale success after going offline", async () => {
    let resolve: ((v: boolean) => void) | undefined;
    const probe = vi.fn(() => new Promise<boolean>((r) => { resolve = r; })); stop = startConnectivity(probe);
    await vi.advanceTimersByTimeAsync(10000); expect(probe).toHaveBeenCalledTimes(1);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); window.dispatchEvent(new Event("offline")); resolve?.(true); await vi.advanceTimersByTimeAsync(0);
    expect(getConnectivity().backend).toBe("down"); expect(getConnectivity().internet).toBe(false);
  });
  it("uses one visible state; a transaction error is not a network outage", () => {
    const up = { internet: true, backend: "up" as const, checking: false, lastOk: 1 };
    expect(connectionLabel(up, false)).toBe("online"); expect(connectionLabel(up, true)).toBe("syncing");
    expect(connectionLabel({ ...up, backend: "unknown" }, false)).toBe("connecting");
    expect(connectionLabel({ ...up, backend: "down" }, true)).toBe("offline");
  });
  it("says offline only after two missed server checks, and tells no internet from no server", async () => {
    const probe = vi.fn().mockResolvedValue(false); stop = startConnectivity(probe);
    await vi.advanceTimersByTimeAsync(0);
    expect(getConnectivity().backend).toBe("down"); expect(connectionLabel(getConnectivity(), false)).toBe("connecting"); expect(offlineReason(getConnectivity())).toBeNull();
    await vi.advanceTimersByTimeAsync(ACTIVE_CHECK_MS);
    expect(connectionLabel(getConnectivity(), false)).toBe("offline"); expect(offlineReason(getConnectivity())).toBe("server");
    probe.mockResolvedValue(true); await vi.advanceTimersByTimeAsync(ACTIVE_CHECK_MS);
    expect(getConnectivity().failures).toBe(0); expect(offlineReason(getConnectivity())).toBeNull();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false }); window.dispatchEvent(new Event("offline"));
    expect(offlineReason(getConnectivity())).toBe("internet");
  });
});
