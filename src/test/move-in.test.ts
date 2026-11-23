import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { cleanSheets, detectSource, rememberImport, tidyPhone, undoLastImport, undoState } from "@/lib/move-in";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1" }));
  localStorage.setItem("shopbook.session", "1");
});
const sheet = (columns: string[], rows: Record<string, unknown>[]) => ({ file: "f.csv", sheet: "S", columns, rows });

describe("moving in", () => {
  it("recognises the system an export came from", () => {
    expect(detectSource([sheet(["Name", "Internal Reference", "Quantity On Hand", "Sales Price"], [])])).toBe("Odoo");
    expect(detectSource([sheet(["Product/Service Name", "Sales Price / Rate", "Purchase Cost"], [])])).toBe("QuickBooks");
    expect(detectSource([sheet(["Item Name", "SKU", "Stock On Hand", "Selling Price"], [])])).toBe("Zoho Inventory / Books");
    expect(detectSource([sheet(["Product", "Price", "Qty"], [])])).toBeUndefined();
  });
  it("writes Kenyan phone numbers the local way (07…, 01…)", () => {
    expect(["0712 345 678", "712345678", "254712345678", "+254 712 345 678", "+254110123456"].map(tidyPhone)).toEqual(["0712345678", "0712345678", "0712345678", "0712345678", "0110123456"]);
    expect(tidyPhone("+1 555 0100")).toBe("+1 555 0100");
  });
  it("merges duplicate products, adds up their stock and counts missing prices", () => {
    const { sheets, report } = cleanSheets([sheet(["Name", "SKU", "Price", "Qty"], [
      { Name: "Sugar", SKU: "SUG", Price: "180", Qty: "10" }, { Name: "Sugar 1kg", SKU: "sug", Price: "", Qty: "5" }, { Name: "Soap", SKU: "", Price: "", Qty: "2" }])]);
    expect(sheets[0]!.rows).toEqual([{ Name: "Sugar 1kg", SKU: "sug", Price: "180", Qty: "15" }, { Name: "Soap", SKU: "", Price: "", Qty: "2" }]);
    expect(report).toEqual({ merged: 1, phones: 0, missingPrices: 1 });
  });
  it("undoes the last import while nothing else was saved, reversing its stock", () => {
    const old = erp.addProduct({ name: "Old", buy: 1, sell: 2, qty: 3, unit: "pcs" });
    const before = erp.load();
    erp.addProduct({ name: "Imported", buy: 10, sell: 20, qty: 7, unit: "pcs" });
    erp.addCustomer("Asha", "0711000000");
    rememberImport(before, erp.load(), "IMP-1");
    expect(undoState()?.ok).toBe(true);
    undoLastImport();
    const s = erp.load();
    expect(s.customers).toHaveLength(0);
    const imported = s.products.find((p) => p.name === "Imported")!;
    expect(imported).toMatchObject({ archived: true, qty: 0 });
    expect(s.products.find((p) => p.id === old.id)!.qty).toBe(3);
    expect(s.movements.some((m) => m.reason === "Import undone" && m.qty === -7)).toBe(true);
    expect(undoState()).toBeNull();
  });
  it("refuses to undo once something else was recorded", () => {
    const before = erp.load();
    erp.addCustomer("Asha", "0711000000");
    rememberImport(before, erp.load(), "IMP-2");
    erp.addCustomer("Baraka", "0722000000");
    expect(undoState()?.ok).toBe(false);
    expect(() => undoLastImport()).toThrow(/Other records were saved/);
  });
});

describe("local phone numbers", () => {
  it("shows a number the way it is dialled at home", async () => {
    const { localPhone } = await import("@/lib/dial-codes");
    expect(localPhone("+254 722 569460", "KEN")).toBe("0722569460");
    expect(localPhone("+254722569460", "KEN")).toBe("0722569460");
    expect(localPhone("0722569460", "KEN")).toBe("0722569460");
    expect(localPhone("+256 772 000000", "KEN")).toBe("+256 772 000000");
  });
});
