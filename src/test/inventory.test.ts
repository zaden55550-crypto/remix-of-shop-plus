// Inventory engine: products, stock movements, transfers, returns, valuation and their ERP integrations.
// Runs on jsdom's isolated localStorage, so no real shop records are touched.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { balanceSheet, balances, journal } from "@/lib/accounting";
import { addSupplier, confirmPurchase, floatBalances, returnPurchase } from "@/lib/finance";
import { inventoryProducts } from "@/components/shopbook/inventory-controls";
import { buildReport } from "@/lib/reports";
import { position } from "@/lib/summary";
import { dashboardTotals } from "@/lib/dashboard";

beforeEach(() => localStorage.clear());

const pay = (cash = 0, credit = 0) => ({ cash, mpesa: 0, bank: 0, credit });
const add = (p: Partial<erp.NewProduct> = {}) => erp.addProduct({ name: "Soap", buy: 50, sell: 100, qty: 10, ...p });
const get = (id: string) => erp.load().products.find((p) => p.id === id)!;
const moves = (id: string) => erp.load().movements.filter((m) => m.productId === id);

describe("product management", () => {
  it("creates a product that survives a reload, with opening stock recorded once as a movement", () => {
    const p = add({ name: "  Milk 1L  ", barcode: " 600123 " });
    const raw = JSON.parse(localStorage.getItem("shopbook.erp")!);
    expect(raw.products[0]).toMatchObject({ name: "Milk 1L", barcode: "600123", qty: 10 });
    expect(get(p.id).qty).toBe(10);
    expect(moves(p.id)).toEqual([expect.objectContaining({ type: "OPENING", qty: 10, prev: 0, next: 10 })]);
    expect(erp.load().audit[0]?.action).toBe("PRODUCT CREATED");
  });

  it("validates name, prices and quantity", () => {
    expect(() => add({ name: "   " })).toThrow(/name is required/);
    expect(() => add({ buy: -1 })).toThrow(/can't be negative/);
    expect(() => add({ sell: Number.NaN })).toThrow(/can't be negative/);
    expect(() => add({ qty: -2 })).toThrow(/can't be negative/);
    expect(erp.load().products).toHaveLength(0);
  });

  it("prevents duplicate barcodes and SKUs (SKU ignores case and spaces)", () => {
    add({ barcode: "111", sku: "ABC-1" });
    expect(() => add({ name: "B", barcode: " 111 " })).toThrow(/Barcode already used/);
    expect(() => add({ name: "C", sku: "abc-1 " })).toThrow(/SKU already used/);
    expect(erp.load().products).toHaveLength(1);
  });

  it("leaves optional category, brand, SKU and barcode blank unless supplied", () => {
    const blank = add({ name: "Unspecified details" });
    expect(blank).toMatchObject({ name: "Unspecified details" });
    expect(blank.categoryId).toBeUndefined();
    expect(blank.brandId).toBeUndefined();
    expect(blank.sku).toBeUndefined();
    expect(blank.barcode).toBeUndefined();
    const supplied = add({ name: "Coded", sku: "SKU-01", barcode: "12345" });
    expect(supplied).toMatchObject({ sku: "SKU-01", barcode: "12345" });
  });

  it("edits details, audits price changes and never lets quantity be patched", () => {
    const p = add();
    erp.updateProduct(p.id, { name: "Bar Soap", buy: 55, sell: 120, qty: 999 } as never);
    expect(get(p.id)).toMatchObject({ name: "Bar Soap", buy: 55, sell: 120, qty: 10 });
    expect(erp.load().audit[0]?.detail).toMatch(/Buying price 50 → 55 • Selling price 100 → 120/);
    expect(() => erp.updateProduct(p.id, { name: " " })).toThrow(/name is required/);
    expect(() => erp.updateProduct(p.id, { sell: -5 })).toThrow(/Prices can't be negative/);
  });

  it("blocks editing a barcode/SKU into another product's code but keeps its own", () => {
    const a = add({ barcode: "111", sku: "A1" });
    const b = add({ name: "B", barcode: "222", sku: "B1" });
    expect(() => erp.updateProduct(b.id, { barcode: "111" })).toThrow(/Barcode already used/);
    expect(() => erp.updateProduct(b.id, { sku: "a1" })).toThrow(/SKU already used/);
    expect(() => erp.updateProduct(a.id, { barcode: "111", sku: "A1", sell: 90 })).not.toThrow();
    expect(get(b.id).barcode).toBe("222");
  });

  it("refuses to delete a product that still holds stock", () => {
    const p = add({ qty: 3 });
    expect(() => erp.deleteProduct(p.id)).toThrow(/still has 3 in stock/);
    expect(erp.load().products).toHaveLength(1);
  });

  it("archives, rather than deletes, a zero-stock product that has history", () => {
    const p = add({ qty: 2 });
    erp.stockOut(p.id, 2, "Expired");
    expect(() => erp.deleteProduct(p.id)).toThrow(/Archive it instead/);
    erp.archiveProduct(p.id);
    expect(erp.load().products[0]?.archived).toBe(true);
    expect(erp.load().movements).toHaveLength(2);
    expect(erp.load().audit[0]?.action).toBe("PRODUCT ARCHIVED");
  });

  it("deletes a product that has no history", () => {
    const p = add({ qty: 0 });
    erp.deleteProduct(p.id);
    expect(erp.load().products).toHaveLength(0);
    expect(erp.load().audit[0]?.action).toBe("PRODUCT DELETED");
  });

  it("refuses to delete a product with an open transfer", () => {
    const p = add({ qty: 5 });
    erp.createTransfer(p.id, 5, "Branch", "Main");
    erp.commit((s) => { s.products[0]!.qty = 0; }); // simulate stock already gone
    expect(() => erp.deleteProduct(p.id)).toThrow(/open transfer/);
  });

  it("searches by name, SKU, barcode, category and brand", () => {
    const cat = erp.addNamed("categories", "Drinks"), brand = erp.addNamed("brands", "Acme");
    add({ name: "Juice", sku: "J-1", barcode: "999", categoryId: cat.id, brandId: brand.id });
    add({ name: "Bread", sku: "B-1" });
    const s = erp.load();
    for (const q of ["juice", " J-1 ", "999", "drinks", "ACME"]) expect(inventoryProducts(s, q).map((p) => p.name)).toEqual(["Juice"]);
    expect(erp.findByCode(s, "j-1")?.name).toBe("Juice");
  });

  it("manages categories and brands with duplicate checks and audit", () => {
    const c = erp.addNamed("categories", "Drinks");
    expect(() => erp.addNamed("categories", " drinks ")).toThrow(/Already exists/);
    const other = erp.addNamed("categories", "Food");
    expect(() => erp.renameNamed("categories", other.id, "DRINKS")).toThrow(/Already exists/);
    const p = add({ categoryId: c.id });
    erp.renameNamed("categories", c.id, "Beverages");
    expect(() => erp.removeNamed("categories", c.id)).toThrow(/used by 1 product/); // deactivate instead
    expect(get(p.id).categoryId).toBe(c.id);
    erp.commit((st) => { st.products[0]!.categoryId = undefined; });
    erp.removeNamed("categories", c.id);
    expect(erp.load().audit.map((a) => a.action).slice(0, 2)).toEqual(["CATEGORY DELETED", "CATEGORY RENAMED"]);
  });
});

describe("variants", () => {
  const sizes = (q: number[]) => q.map((qty, i) => ({ id: String(i), name: `Size ${40 + i}`, qty }));

  it("stores variants whose total matches the opening stock", () => {
    const p = add({ qty: 5, variants: sizes([2, 3]) });
    expect(get(p.id).variants?.map((v) => v.qty)).toEqual([2, 3]);
    expect(get(p.id).qty).toBe(5);
  });

  it("rejects duplicate or blank variant names, negative variant stock and mismatched totals", () => {
    expect(() => add({ qty: 2, variants: [{ id: "a", name: "M", qty: 1 }, { id: "b", name: " m ", qty: 1 }] })).toThrow(/must be different/);
    expect(() => add({ qty: 1, variants: [{ id: "a", name: " ", qty: 1 }] })).toThrow(/needs a name/);
    expect(() => add({ qty: 4, variants: sizes([2, 3]) })).toThrow(/equal the total/);
    expect(() => add({ qty: 0, variants: sizes([2, -2]) })).toThrow(/can't be negative/);
    expect(erp.load().products).toHaveLength(0);
  });

  it("does not let an edit rewrite variant quantities outside stock movements", () => {
    const p = add({ qty: 5, variants: sizes([2, 3]) });
    expect(() => erp.updateProduct(p.id, { variants: sizes([5, 5]) })).toThrow(/change through stock movements/);
    erp.updateProduct(p.id, { variants: sizes([2, 3]).map((v) => ({ ...v, sell: 150 })) });
    expect(get(p.id).variants?.[0]?.sell).toBe(150);
  });
});

describe("stock movements", () => {
  it("Stock In adds stock, records prev/next and can update the buying price", () => {
    const p = add();
    erp.stockIn(p.id, 5, "Supplier X", 60);
    expect(get(p.id)).toMatchObject({ qty: 15, buy: 60 });
    expect(moves(p.id)[0]).toMatchObject({ type: "STOCK IN", qty: 5, prev: 10, next: 15 });
    expect(erp.load().audit.map((a) => a.action)).toContain("COST UPDATED");
    erp.stockIn(p.id, 1, "No cost");
    expect(get(p.id).buy).toBe(60);
  });

  it("rejects zero, negative, NaN and fractional-piece quantities and bad costs", () => {
    const p = add();
    for (const q of [0, -1, Number.NaN, Infinity, 1.5]) expect(() => erp.stockIn(p.id, q, "x")).toThrow();
    expect(() => erp.stockIn(p.id, 1, "x", -3)).toThrow(/valid cost/);
    expect(get(p.id)).toMatchObject({ qty: 10, buy: 50 });
  });

  it("allows fractions for weight/volume units and keeps 3 decimals", () => {
    const p = add({ name: "Sugar", unit: "Kg", qty: 0 });
    erp.stockIn(p.id, 2.5, "x");
    erp.stockOut(p.id, 0.1, "Spilled");
    erp.adjustStock(p.id, 2.3, "Count");
    expect(get(p.id).qty).toBe(2.3);
    expect(moves(p.id)[0]?.qty).toBe(-0.1); // 2.3 - 2.4, rounded rather than -0.0999999…
  });

  it("Stock Out removes stock without creating a sale or moving money", () => {
    const p = add();
    const money = floatBalances(erp.load());
    erp.stockOut(p.id, 4, "Damaged");
    const s = erp.load();
    expect(get(p.id).qty).toBe(6);
    expect(s.sales).toHaveLength(0);
    expect(s.payments).toHaveLength(0);
    expect(floatBalances(s)).toEqual(money);
    expect(() => erp.stockOut(p.id, 7, "Lost")).toThrow(/Not enough stock/);
  });

  it("adjustments need a reason, a different count and a non-negative whole count for pieces", () => {
    const p = add();
    expect(() => erp.adjustStock(p.id, 8, " ")).toThrow(/reason/);
    expect(() => erp.adjustStock(p.id, 10, "Count")).toThrow(/matches/);
    expect(() => erp.adjustStock(p.id, -1, "Count")).toThrow(/negative/);
    expect(() => erp.adjustStock(p.id, 8.5, "Count")).toThrow(/whole/);
    erp.adjustStock(p.id, 8, "Count");
    expect(moves(p.id)[0]).toMatchObject({ type: "ADJUSTMENT", qty: -2, prev: 10, next: 8 });
    expect(erp.load().audit[0]?.detail).toMatch(/Previous 10 • Adjustment -2 • New 8/);
  });

  it("every balance equals the sum of its movements (one audited source of truth)", () => {
    const p = add();
    erp.stockIn(p.id, 5, "x"); erp.stockOut(p.id, 2, "y"); erp.adjustStock(p.id, 11, "z");
    erp.confirmSale({ cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: pay(300), channel: "POS" });
    const total = moves(p.id).reduce((a, m) => a + m.qty, 0);
    expect(get(p.id).qty).toBe(8);
    expect(total).toBe(8);
    for (const m of moves(p.id)) expect(m.next).toBe(erp.roundQty(m.prev + m.qty));
  });

  it("refuses a save when another window changed the records first", () => {
    const p = add();
    expect(() => erp.commit((s, c) => {
      localStorage.setItem("shopbook.erp", JSON.stringify({ ...erp.empty(), products: [] }));
      c.move(p.id, "STOCK IN", 1);
    })).toThrow(/another window/);
  });
});

describe("transfers", () => {
  it("validates stock, destination and whole units at creation", () => {
    const p = add({ qty: 5 });
    expect(() => erp.createTransfer(p.id, 6, "Branch", "Main")).toThrow(/Not enough stock/);
    expect(() => erp.createTransfer(p.id, 1, " main ", "Main")).toThrow(/different location/);
    expect(() => erp.createTransfer(p.id, 1.5, "Branch", "Main")).toThrow(/whole/);
    expect(() => erp.createTransfer("missing", 1, "Branch", "Main")).toThrow(/not found/);
  });

  it("stock leaves once on send, comes back once on cancel and can't be received twice", () => {
    const p = add({ qty: 5 });
    const t = erp.createTransfer(p.id, 2, "Branch", "Main", "Van 1");
    expect(get(p.id).qty).toBe(5);
    erp.sendTransfer(t.id);
    expect(get(p.id).qty).toBe(3);
    expect(() => erp.sendTransfer(t.id)).toThrow();
    erp.cancelTransfer(t.id);
    expect(get(p.id).qty).toBe(5);
    expect(() => erp.cancelTransfer(t.id)).toThrow();
    const t2 = erp.createTransfer(p.id, 1, "Branch", "Main");
    erp.sendTransfer(t2.id); erp.receiveTransfer(t2.id);
    expect(() => erp.receiveTransfer(t2.id)).toThrow(/Already received/);
    expect(() => erp.cancelTransfer(t2.id)).toThrow();
    // Stock is one total until it is tracked per location, so goods received at another branch count again.
    expect(get(p.id).qty).toBe(5);
    expect(erp.load().transfers.find((x) => x.id === t.id)?.note).toBe("Van 1");
  });

  it("create-and-send runs as one atomic step", () => {
    const p = add({ qty: 5 });
    erp.runErpTransaction(() => { const t = erp.createTransfer(p.id, 2, "Branch", "Main"); erp.sendTransfer(t.id); });
    expect(get(p.id).qty).toBe(3);
    expect(erp.load().transfers[0]?.status).toBe("SENT");
  });
});

describe("returns", () => {
  it("customer returns restock once and can't exceed what was sold", () => {
    const p = add();
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: pay(300), channel: "Sales" });
    erp.returnSale(sale.id, [{ productId: p.id, qty: 2 }], "cash");
    expect(get(p.id).qty).toBe(9);
    expect(() => erp.returnSale(sale.id, [{ productId: p.id, qty: 2 }], "cash")).toThrow(/Only 1/);
    expect(get(p.id).qty).toBe(9);
  });

  it("allows fractional returns of weighed goods but not of pieces", () => {
    const kg = add({ name: "Rice", unit: "Kg", qty: 5 });
    const pc = add({ name: "Cup", qty: 5 });
    const sale = erp.confirmSale({ cart: [{ productId: kg.id, qty: 1.5 }, { productId: pc.id, qty: 2 }], discount: 0, pay: pay(350), channel: "POS" });
    erp.returnSale(sale.id, [{ productId: kg.id, qty: 0.5 }], "cash");
    expect(get(kg.id).qty).toBe(4);
    expect(() => erp.returnSale(sale.id, [{ productId: pc.id, qty: 0.5 }], "cash")).toThrow(/whole/);
  });

  it("a not-resaleable linked return refunds, then writes the stock off, atomically", () => {
    const p = add();
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: pay(200), channel: "POS" });
    erp.runErpTransaction(() => { erp.returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash"); erp.stockOut(p.id, 1, "Returned not resaleable"); });
    expect(get(p.id).qty).toBe(8);
    expect(erp.load().payments.find((x) => x.kind === "REFUND")?.amount).toBe(-100);
    const before = localStorage.getItem("shopbook.erp");
    expect(() => erp.runErpTransaction(() => { erp.returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash"); erp.stockOut(p.id, 99, "x"); })).toThrow();
    expect(localStorage.getItem("shopbook.erp")).toBe(before);
  });

  it("supplier returns reduce stock and the supplier balance together", () => {
    const p = add({ qty: 0 });
    const sup = addSupplier("Kamau");
    const pur = confirmPurchase({ lines: [{ productId: p.id, qty: 10, cost: 40 }], pay: pay(0, 400), supplierId: sup.id, updateCost: true });
    expect(get(p.id)).toMatchObject({ qty: 10, buy: 40 });
    returnPurchase(pur.id, [{ productId: p.id, qty: 3 }], "credit", "Damaged");
    expect(get(p.id).qty).toBe(7);
    expect(erp.load().suppliers[0]?.balance).toBe(280);
    expect(() => returnPurchase(pur.id, [{ productId: p.id, qty: 8 }], "credit")).toThrow(/Only 7/);
  });
});

describe("valuation, alerts and ERP integration", () => {
  it("uses one low/out-of-stock definition in Inventory, Dashboard and Reports", () => {
    add({ name: "Low default", qty: 3 }); // no own reorder level → default 5
    add({ name: "Low own", qty: 8, minStock: 10 });
    add({ name: "OK", qty: 20 });
    add({ name: "Zero level", qty: 1, minStock: 0 });
    add({ name: "Out", qty: 0 });
    const s = erp.load();
    const statuses = s.products.map(erp.stockStatus);
    expect(statuses.filter((x) => x === "LOW")).toHaveLength(2);
    expect(statuses.filter((x) => x === "OUT")).toHaveLength(1);
    expect(position(s)).toMatchObject({ low: 2, out: 1 });
    const kpi = Object.fromEntries(buildReport(s, "Inventory", { from: 0, to: Date.now() }).kpis.map((k) => [k.label, k.value]));
    expect(kpi).toMatchObject({ "Low stock": 2, "Out of stock": 1 });
  });

  it("stock value is quantity × buying price everywhere", () => {
    add({ qty: 4, buy: 25 }); add({ name: "B", qty: 2, buy: 100.5 });
    const s = erp.load();
    expect(position(s).stock).toBe(301);
    expect(dashboardTotals(s).stock).toBe(301);
    expect(buildReport(s, "Inventory", { from: 0, to: Date.now() }).kpis.find((k) => k.label === "Stock value")?.value).toBe(301);
  });

  it("sales and purchases change stock exactly once", () => {
    const p = add({ qty: 0 });
    const sup = addSupplier("Kamau");
    confirmPurchase({ lines: [{ productId: p.id, qty: 6, cost: 50 }], pay: pay(0, 300), supplierId: sup.id, updateCost: false });
    expect(get(p.id).qty).toBe(6);
    erp.confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: pay(200), channel: "POS" });
    expect(get(p.id).qty).toBe(4);
    expect(moves(p.id).map((m) => m.type)).toEqual(["SALE", "PURCHASE"]);
  });

  it("an Inventory-only customer return is posted to Accounting; a Sales return is not posted twice", () => {
    const p = add({ qty: 10, buy: 50 });
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: pay(200), channel: "POS" });
    erp.returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash");
    erp.commit((_s, c) => c.move(p.id, "RETURN", 1, "Customer Return • Direct", c.nextRef("RET")));
    const s = erp.load();
    const inv = balances(journal(s)).inventory.net;
    expect(get(p.id).qty).toBe(10);
    expect(inv).toBe(500); // 10 × 50 — matches the Inventory stock value
    expect(balanceSheet(s).balanced).toBe(true);
  });

  it("stock movements never create cash movements", () => {
    const p = add();
    erp.stockIn(p.id, 3, "x", 55); erp.stockOut(p.id, 1, "y"); erp.adjustStock(p.id, 9, "z");
    const t = erp.createTransfer(p.id, 1, "B", "A"); erp.sendTransfer(t.id); erp.cancelTransfer(t.id);
    const s = erp.load();
    expect(s.payments).toHaveLength(0);
    expect(s.cash).toHaveLength(0);
    expect(floatBalances(s)).toEqual({ cash: 0, mpesa: 0, bank: 0 });
  });
});
