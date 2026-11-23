import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_IDLE_MINUTES, idleLeft, idleMinutes, setIdleMinutes } from "@/components/shopbook/idle-logout";

describe("sign out after inactivity", () => {
  beforeEach(() => localStorage.clear());
  it("defaults to 10 minutes and counts down from the last activity", () => {
    expect(idleMinutes()).toBe(DEFAULT_IDLE_MINUTES);
    expect(idleLeft(1_000_000, 1_000_000 - 9 * 60_000, 10)).toBe(60_000);
    expect(idleLeft(1_000_000, 1_000_000 - 11 * 60_000, 10)).toBeLessThan(0);
  });
  it("can be changed or switched off per device", () => {
    setIdleMinutes(5); expect(idleMinutes()).toBe(5);
    setIdleMinutes(0); expect(idleLeft(1, 0, idleMinutes())).toBe(Infinity);
  });
});
