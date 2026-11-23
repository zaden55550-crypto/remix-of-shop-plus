import { beforeEach, describe, expect, it } from "vitest";
import { DATA_EPOCH, freshStart } from "@/lib/fresh-start";

describe("fresh start", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it("removes every Zakrio Systems key once, keeps other sites' keys, and never wipes again on the same epoch", () => {
    localStorage.setItem("shopbook.erp", "{}"); localStorage.setItem("shopbook.account", "{}"); localStorage.setItem("sb-abc-auth-token", "x");
    localStorage.setItem("zakrio.something", "1"); localStorage.setItem("other-app", "keep"); sessionStorage.setItem("shopbook.session", "1");
    expect(freshStart()).toBe(true);
    expect(Object.keys(localStorage).sort()).toEqual(["other-app", "zakrio.dataEpoch"]);
    expect(localStorage.getItem("zakrio.dataEpoch")).toBe(DATA_EPOCH);
    expect(sessionStorage.length).toBe(0);
    localStorage.setItem("shopbook.erp", "{\"new\":true}");
    expect(freshStart()).toBe(false);
    expect(localStorage.getItem("shopbook.erp")).toBe("{\"new\":true}");
  });
  it("on a new device only marks the epoch", () => {
    expect(freshStart()).toBe(false);
    expect(localStorage.getItem("zakrio.dataEpoch")).toBe(DATA_EPOCH);
  });
});
