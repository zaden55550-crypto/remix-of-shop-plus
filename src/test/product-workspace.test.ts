import { beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import * as erp from "@/lib/erp";
import { csvText, exportTable, statusLabel, xlsxBytes } from "@/lib/product-export";
import { tablePdf } from "@/lib/simple-pdf";
import { applyImport, previewRows, suggestMapping, template } from "@/lib/import-center";

const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

describe("All Products rules", () => {
  beforeEach(() => localStorage.clear());

  it("saves the new fields and rejects an impossible Pieces value", () => {
    const p = erp.addProduct({ name: "Oil", buy: 10, sell: 20, qty: 0, pieces: 12, description: "1L bottles", reorderLevel: 3 });
    expect(erp.load().products[0]).toMatchObject({ pieces: 12, description: "1L bottles", reorderLevel: 3 });
    expect(() => erp.updateProduct(p.id, { pieces: 0 })).toThrow(/whole number/);
    expect(() => erp.updateProduct(p.id, { pieces: 1.5 })).toThrow(/whole number/);
  });

  it("editing never changes quantity or past records", () => {
    const p = erp.addProduct({ name: "Oil", buy: 10, sell: 20, qty: 5 });
    const moves = erp.load().movements.length;
    erp.updateProduct(p.id, { name: "Oil 1L", description: "x", unit: "Box" });
    const s = erp.load();
    expect(s.products[0]).toMatchObject({ name: "Oil 1L", qty: 5 });
    expect(s.movements).toHaveLength(moves);
  });

  it("SKU and barcode stay unique on add and edit", () => {
    const a = erp.addProduct({ name: "A", buy: 1, sell: 1, qty: 0, sku: "S1", barcode: "111" });
    erp.addProduct({ name: "B", buy: 1, sell: 1, qty: 0, sku: "S2", barcode: "222" });
    expect(() => erp.addProduct({ name: "C", buy: 1, sell: 1, qty: 0, sku: "s1" })).toThrow(/SKU/);
    expect(() => erp.addProduct({ name: "C", buy: 1, sell: 1, qty: 0, barcode: "222" })).toThrow(/Barcode/);
    expect(() => erp.updateProduct(a.id, { sku: "S2" })).toThrow(/SKU/);
  });

  it("a product with history can't be deleted, only archived", () => {
    const p = erp.addProduct({ name: "Used", buy: 1, sell: 2, qty: 2 });
    erp.stockOut(p.id, 2, "Damaged");
    expect(erp.productHistory(erp.load(), p.id)).toBeGreaterThan(0);
    expect(() => erp.deleteProduct(p.id)).toThrow(/Archive it instead/);
    erp.archiveProduct(p.id);
    const s = erp.load();
    expect(s.products[0]?.archived).toBe(true);
    expect(s.movements.some((m) => m.productId === p.id)).toBe(true); // history stays
    expect(s.audit[0]?.action).toBe("PRODUCT ARCHIVED");
  });

  it("a product with no history is deleted; opening stock alone doesn't count as history", () => {
    const p = erp.addProduct({ name: "Clean", buy: 1, sell: 2, qty: 0 });
    expect(erp.productHistory(erp.load(), p.id)).toBe(0);
    erp.deleteProduct(p.id);
    expect(erp.load().products).toHaveLength(0);
  });

  it("a product holding stock can't be archived", () => {
    const p = erp.addProduct({ name: "Full", buy: 1, sell: 2, qty: 3 });
    expect(() => erp.archiveProduct(p.id)).toThrow(/still has 3 in stock/);
  });

  it("an archived product leaves selling screens and stock alerts, and can be restored", () => {
    const p = erp.addProduct({ name: "Gone", buy: 1, sell: 2, qty: 1, barcode: "555" });
    erp.stockOut(p.id, 1, "Damaged");
    expect(erp.stockStatus(erp.load().products[0]!)).toBe("OUT");
    erp.archiveProduct(p.id);
    let s = erp.load();
    expect(erp.searchProducts(s, "Gone")).toHaveLength(0);
    expect(erp.searchProducts(s, "")).toHaveLength(0);
    expect(erp.findByCode(s, "555")).toBeUndefined();
    expect(erp.stockStatus(s.products[0]!)).toBe("OK");
    expect(statusLabel(s.products[0]!)).toBe("Archived");
    erp.restoreProduct(p.id);
    s = erp.load();
    expect(erp.searchProducts(s, "Gone")).toHaveLength(1);
    expect(erp.stockStatus(s.products[0]!)).toBe("OUT");
  });
});

describe("All Products import", () => {
  beforeEach(() => localStorage.clear());
  const preview = (rows: Record<string, unknown>[]) => {
    const columns = Object.keys(rows[0] ?? {});
    const mapping = suggestMapping(columns, "Products");
    return { mapping, rows: previewRows(erp.load(), rows, "Products", mapping, new Set(Object.values(mapping).filter(Boolean))) };
  };
  const row = (over: Record<string, unknown> = {}) => ({ "Product Name": "Tea", SKU: "T-1", "Buying Price": 10, "Selling Price": 20, Pieces: 12, Details: "Green", ...over });

  it("flags a price that isn't a number instead of saving it as 0", () => {
    const { rows } = preview([row({ "Buying Price": "abc" })]);
    expect(rows[0]?.status).toBe("INVALID");
    expect(rows[0]?.issues[0]?.field).toBe("buy");
  });

  it("an empty optional column is not an error", () => {
    expect(preview([row({ Quantity: "" })]).rows[0]?.status).toBe("NEW");
  });

  it("starts product templates with blank category, brand, SKU and barcode", () => {
    const [headerLine, valueLine] = template("Products").split("\n");
    const headers = [...(headerLine ?? "").matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    const values = [...(valueLine ?? "").matchAll(/"([^"]*)"/g)].map((m) => m[1]);
    for (const field of ["Category", "Brand", "SKU", "Barcode"]) {
      expect(values[headers.indexOf(field)]).toBe("");
    }
  });

  it("saves the new fields", () => {
    const { rows, mapping } = preview([row()]);
    applyImport("Products", "f.csv", rows, mapping, "skip");
    expect(erp.load().products[0]).toMatchObject({ name: "Tea", pieces: 12, description: "Green" });
  });

  it("skipping a duplicate SKU leaves the existing product and its stock alone", () => {
    erp.addProduct({ name: "Old Tea", buy: 1, sell: 2, qty: 9, sku: "T-1" });
    const { rows, mapping } = preview([row({ Quantity: 100 })]);
    const result = applyImport("Products", "f.csv", rows, mapping, "skip");
    expect(result.skipped).toBe(1);
    expect(erp.load().products[0]).toMatchObject({ name: "Old Tea", qty: 9 });
  });

  it("keeps existing optional metadata when an import leaves it blank", () => {
    const category = erp.addNamed("categories", "Pantry");
    const brand = erp.addNamed("brands", "Acme");
    const existing = erp.addProduct({ name: "Tea", buy: 10, sell: 20, qty: 0, sku: "T-1", barcode: "12345", categoryId: category.id, brandId: brand.id });
    const { rows, mapping } = preview([row({ SKU: "", Barcode: "", Category: "", Brand: "", "Selling Price": 25 })]);
    applyImport("Products", "f.csv", rows, mapping, "update");
    const saved = erp.load().products.find((p) => p.id === existing.id)!;
    expect(saved).toMatchObject({ sku: "T-1", barcode: "12345", categoryId: category.id, brandId: brand.id, sell: 25 });
  });

  it("updating stock from a file goes through a recorded movement", () => {
    erp.addProduct({ name: "Old Tea", buy: 1, sell: 2, qty: 9, sku: "T-1" });
    const { rows, mapping } = preview([row({ Quantity: 15 })]);
    applyImport("Products", "f.csv", rows, mapping, "update");
    const s = erp.load();
    expect(s.products[0]?.qty).toBe(15);
    expect(s.movements[0]).toMatchObject({ type: "ADJUSTMENT", qty: 6, reason: "Catalogue import" });
  });
});

describe("All Products export", () => {
  beforeEach(() => localStorage.clear());
  const seed = () => {
    erp.addNamed("categories", "Groceries");
    const s = erp.load();
    erp.addProduct({ name: 'Sugar "2kg"', buy: 180, sell: 220, qty: 50, sku: "SUG-1", barcode: "616", categoryId: s.categories[0]?.id, unit: "Piece", pieces: 1 });
    erp.addProduct({ name: "=cmd()", buy: 1, sell: 2, qty: 0 });
    return erp.load();
  };

  it("exports only the chosen fields, from real records", () => {
    const s = seed();
    const t = exportTable(s, s.products, ["name", "category", "qty"]);
    expect(t.head).toEqual(["Product Name", "Category", "Current Stock"]);
    expect(t.rows).toContainEqual(['Sugar "2kg"', "Groceries", 50]);
  });

  it("CSV escapes quotes and stops spreadsheet formulas", () => {
    const s = seed();
    const t = exportTable(s, s.products, ["name", "qty"]);
    const csv = csvText(t.head, t.rows);
    expect(csv).toContain('"Sugar ""2kg"""');
    expect(csv).toContain(`"'=cmd()"`);
  });

  it("the Excel file opens back with the same rows", () => {
    const s = seed();
    const t = exportTable(s, s.products, ["name", "sell"]);
    const book = XLSX.read(new Uint8Array(xlsxBytes(XLSX, t.head, t.rows)), { type: "array" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets["Products"]!);
    expect(rows).toHaveLength(2);
    expect(rows).toContainEqual({ "Product Name": 'Sugar "2kg"', "Selling Price": 220 });
  });

  it("the PDF is a well-formed file with a correct cross-reference table", () => {
    const pdf = text(tablePdf("Shop - Products", "2 products", ["Name", "Stock"], [["Sugar (2kg)", "50"], ["Café 中", "1"]]));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf).toContain("Sugar \\(2kg\\)"); // brackets are escaped
    const start = Number(/startxref\n(\d+)/.exec(pdf)?.[1]);
    expect(pdf.slice(start, start + 4)).toBe("xref");
    const offsets = [...pdf.slice(start).matchAll(/^(\d{10}) 00000 n /gm)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(4);
    offsets.forEach((o, i) => expect(pdf.slice(o).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });

  it("long lists run across PDF pages", () => {
    const rows = Array.from({ length: 200 }, (_, i) => [`Product ${i}`, String(i)]);
    const pdf = text(tablePdf("T", "S", ["Name", "Stock"], rows));
    expect((pdf.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(3);
  });
});

describe("deleting a product with a reason", () => {
  it("keeps the reason in the audit trail, for a delete and for an archive", () => {
    localStorage.clear();
    const a = erp.addProduct({ name: "Reason A", buy: 1, sell: 2, qty: 0 });
    erp.deleteProduct(a.id, "Added by mistake: typed twice");
    expect(erp.load().audit.find((x) => x.action === "PRODUCT DELETED")?.detail).toContain("Reason: Added by mistake: typed twice");
    const b = erp.addProduct({ name: "Reason B", buy: 1, sell: 2, qty: 1 });
    erp.adjustStock(b.id, 0, "Count");
    erp.archiveProduct(b.id, "No longer sold: range ended");
    expect(erp.load().audit.find((x) => x.action === "PRODUCT ARCHIVED")?.detail).toContain("Reason: No longer sold: range ended");
  });
});
