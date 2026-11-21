// Dashboard links name a starting tab; only real tabs of the target app are honoured.
import { describe, expect, it } from "vitest";
import { startView, viewSearch } from "@/lib/deep-link";
import { REPORT_MENUS } from "@/lib/analytics-reports";

const MENUS = { Overview: [], Sales: ["All Sales", "Completed"], Expenses: [] } as const;

describe("dashboard deep links", () => {
  it("opens the linked menu and sub-tab", () => {
    expect(startView(MENUS, { menu: "Sales", sub: "Completed" }, "Overview")).toEqual(["Sales", "Completed"]);
    expect(startView(REPORT_MENUS, { menu: "Financial", sub: "Profit & Loss" }, "Sales", "Sales Report")).toEqual(["Financial", "Profit & Loss"]);
    expect(startView(REPORT_MENUS, { menu: "Inventory", sub: "Valuation" }, "Sales")).toEqual(["Inventory", "Valuation"]);
  });

  it("uses the menu's first tab when the sub-tab is missing or unknown", () => {
    expect(startView(MENUS, { menu: "Sales" }, "Overview")).toEqual(["Sales", "All Sales"]);
    expect(startView(MENUS, { menu: "Sales", sub: "Nope" }, "Overview")).toEqual(["Sales", "All Sales"]);
    expect(startView(MENUS, { menu: "Expenses" }, "Overview")).toEqual(["Expenses", ""]);
  });

  it("falls back to the app's usual start for unknown or absent links", () => {
    expect(startView(MENUS, {}, "Overview")).toEqual(["Overview", ""]);
    expect(startView(MENUS, { menu: "toString" }, "Overview")).toEqual(["Overview", ""]);
    expect(startView(REPORT_MENUS, { menu: "Bogus" }, "Sales", "Sales Report")).toEqual(["Sales", "Sales Report"]);
  });

  it("keeps only short string values from the URL", () => {
    expect(viewSearch({ menu: "Sales", sub: 5, filter: "x".repeat(100), extra: "y" })).toEqual({ menu: "Sales", sub: undefined, filter: undefined });
  });
});
