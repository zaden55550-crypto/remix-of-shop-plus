import { describe, expect, it } from "vitest";
import { ANALYTICS_PERIODS, analyticsRange, scopeToPeriod, type HeaderPeriod } from "@/lib/period";
import type { ErpState } from "@/lib/erp";

const DAY = 864e5;
const state = (ages: number[]) => {
  const rows = ages.map((age, i) => ({ id: String(i), at: Date.now() - age * DAY }));
  return { sales: rows, purchases: rows, expenses: rows, payrolls: rows, commissions: rows, movements: rows, payments: rows, returns: rows } as unknown as ErpState;
};
const period = (p: HeaderPeriod["period"], custom: [string, string] = ["2020-01-01", "2020-01-31"]): HeaderPeriod => ({
  period: p, custom, setPeriod: () => {}, setCustom: () => {}, clearable: true,
  range: p ? analyticsRange(p, custom) : { from: 0, to: Date.now() },
});

describe("header period", () => {
  it("lists Custom first, then Today to This Year", () => {
    expect(ANALYTICS_PERIODS).toEqual(["Custom", "Today", "This Week", "This Month", "This Year"]);
  });

  it("no chosen period leaves the records exactly as they are", () => {
    const s = state([0, 400]);
    expect(scopeToPeriod(s, period(null))).toBe(s);
  });

  it("narrows documents to the period", () => {
    const s = scopeToPeriod(state([0, 400]), period("Today"));
    expect(s.sales).toHaveLength(1);
    expect(s.purchases).toHaveLength(1);
    expect(s.expenses).toHaveLength(1);
  });

  it("keeps payments and returns whole, because balances and statuses come from them", () => {
    const s = scopeToPeriod(state([0, 400]), period("Today"));
    expect(s.payments).toHaveLength(2);
    expect(s.returns).toHaveLength(2);
  });

  it("does not change the original records", () => {
    const s = state([0, 400]);
    scopeToPeriod(s, period("Today"));
    expect(s.sales).toHaveLength(2);
  });

  it("custom dates cover both whole days", () => {
    const r = analyticsRange("Custom", ["2026-01-05", "2026-01-06"]);
    expect(r.from).toBe(new Date("2026-01-05T00:00:00").getTime());
    expect(r.to).toBe(new Date("2026-01-06T23:59:59.999").getTime());
  });

  it("an unfinished custom date falls back rather than breaking the page", () => {
    const r = analyticsRange("Custom", ["", ""]);
    expect(Number.isFinite(r.from)).toBe(true);
    expect(Number.isFinite(r.to)).toBe(true);
  });
});
