import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { saveLocation } from "@/lib/locations";
import { counterHardware, etimsCsv, locationsFromSheets, matchMpesa, mpesaFromSheets, saveCounterHardware, setupHistory } from "@/lib/setup-extras";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1" }));
  localStorage.setItem("shopbook.session", "1");
});
const sheet = (columns: string[], rows: Record<string, unknown>[]) => [{ file: "f.csv", sheet: "Sheet1", columns, rows }];

describe("setup extras", () => {
  it("1 and 4: a location keeps its own receipt details and usual warehouse", () => {
    const wh = saveLocation({ name: "Store", type: "store" });
    const shop = saveLocation({ name: "Town", type: "shop", connected: [wh.id], defaultWarehouse: wh.id, receiptHeader: "Town Branch", hours: "8-8", taxPin: "p051234567x" });
    expect(shop).toMatchObject({ receiptHeader: "Town Branch", hours: "8-8", taxPin: "P051234567X", defaultWarehouse: wh.id });
    expect(saveLocation({ id: shop.id, name: "Town", type: "shop" }).receiptHeader).toBe("Town Branch");
    expect(() => saveLocation({ id: shop.id, name: "Town", type: "shop", connected: [], defaultWarehouse: wh.id })).toThrow(/usual warehouse/);
  });
  it("3: reads locations from a sheet with any column order", () => {
    const { lines, skipped } = locationsFromSheets(sheet(["Name", "Type", "Phone", "Code", "Tills"], [{ Name: "Westlands", Type: "Shop", Phone: "0712", Code: "s-2", Tills: "3" }, { Name: "Depot", Type: "Warehouse" }, { Name: "" }]));
    expect(lines).toEqual([{ type: "shop", name: "Westlands", phone: "0712", code: "S-2", address: "", counters: 3 }, { type: "store", name: "Depot", phone: "", code: "", address: "" }]);
    expect(skipped).toBe(1);
  });
  it("5: keeps each counter's hardware on this device", () => {
    expect(counterHardware("loc-1", 2)).toEqual({ printer: "80mm", scanner: true, drawer: false });
    saveCounterHardware("loc-1", 2, { printer: "58mm", scanner: false, drawer: true });
    expect(counterHardware("loc-1", 2)).toEqual({ printer: "58mm", scanner: false, drawer: true });
  });
  it("6: lists setup changes only", () => {
    saveLocation({ name: "Town", type: "shop" });
    erp.addProduct({ name: "Soap", buy: 1, sell: 2, qty: 1, unit: "pcs" });
    expect(setupHistory(erp.load()).map((a) => a.action)).toEqual(["LOCATION CREATED"]);
  });
  it("8: matches M-Pesa payments to sales and flags the rest", () => {
    const at = Date.parse("2026-11-20T10:00:00");
    const s = { ...erp.empty(), sales: [{ id: "a", ref: "S-1", at, pay: { cash: 0, mpesa: 500, bank: 0, credit: 0 } }, { id: "b", ref: "S-2", at: at + 3600_000, pay: { cash: 0, mpesa: 300, bank: 0, credit: 0 } }] as unknown as erp.Sale[] };
    const lines = mpesaFromSheets(sheet(["Receipt No.", "Completion Time", "Details", "Paid In"], [
      { "Receipt No.": "qwe1", "Completion Time": "20/11/2026 10:05:00", Details: "John", "Paid In": "500.00" },
      { "Receipt No.": "qwe2", "Completion Time": "20/11/2026 12:00:00", Details: "Mary", "Paid In": "1,200" },
      { "Receipt No.": "qwe3", "Completion Time": "20/11/2026 12:10:00", Details: "Out", "Paid In": "" }]));
    expect(lines.map((l) => l.receipt)).toEqual(["QWE1", "QWE2"]);
    const r = matchMpesa(s, lines);
    expect(r.matched.map((m) => m.saleRef)).toEqual(["S-1"]);
    expect(r.unmatched.map((l) => l.receipt)).toEqual(["QWE2"]);
    expect(r.salesWithoutMoney.map((x) => x.ref)).toEqual(["S-2"]);
  });
  it("9: exports a month's sales line by line with the seller's PIN", () => {
    const s = { ...erp.empty(), sales: [{ id: "a", ref: "S-1", at: Date.parse("2026-11-05"), items: [{ name: "Soap", qty: 2, price: 50 }], total: 100, vat: 13.79 }] as unknown as erp.Sale[] };
    const csv = etimsCsv(s, "P051234567X", Date.parse("2026-11-01"), Date.parse("2026-12-01") - 1);
    expect(csv.split("\n")[1]).toBe('"S-1","2026-11-05","P051234567X","","Soap","2","50","100","13.79","100"');
  });
});
