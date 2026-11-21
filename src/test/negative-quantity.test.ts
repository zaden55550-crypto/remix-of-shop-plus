import { beforeEach, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { confirmPurchase } from "@/lib/finance";

beforeEach(() => localStorage.clear());

const product = (qty = 10) => erp.addProduct({ name: "Soap", buy: 50, sell: 100, qty } as erp.NewProduct);
const noPay = { cash: 0, mpesa: 0, bank: 0, credit: 0 };

it("rejects negative quantities when adding a product", () => {
  expect(() => product(-5)).toThrow(/can't be negative/);
  expect(() => erp.addProduct({ name: "Oil", buy: 1, sell: 2, qty: Number.NaN } as erp.NewProduct)).toThrow(/can't be negative/);
  expect(erp.load().products).toHaveLength(0);
});

it("blocks any save that stores a negative product quantity, price or variant", () => {
  const p = product();
  const write = (patch: Partial<erp.Product>) => () =>
    erp.commit((s) => { Object.assign(s.products.find((x) => x.id === p.id)!, patch); });
  expect(write({ qty: -1 })).toThrow(/Quantity can't be negative/);
  expect(write({ variants: [{ id: "v", name: "S", qty: -2 }] })).toThrow(/Quantity can't be negative/);
  expect(write({ sell: -100 })).toThrow(/Prices can't be negative/);
  expect(write({ minStock: -1 })).toThrow(/Minimum stock can't be negative/);
  expect(() => erp.updateProduct(p.id, { buy: -1 })).toThrow(/Prices can't be negative/);
  expect(() => erp.commit((s) => { s.products.push({ id: "x", name: "Raw", buy: 1, sell: 1, qty: -3, createdAt: 0 }); })).toThrow();
  expect(erp.load().products.map((x) => x.qty)).toEqual([10]);
});

it("rejects negative quantities in stock moves, purchases, transfers and sales", () => {
  const p = product();
  expect(() => erp.stockIn(p.id, -3, "Restock")).toThrow();
  expect(() => erp.stockOut(p.id, -3, "Damaged")).toThrow();
  expect(() => erp.adjustStock(p.id, -1, "Count")).toThrow();
  expect(() => erp.createTransfer(p.id, -2, "Branch", "Main")).toThrow();
  expect(() => confirmPurchase({ lines: [{ productId: p.id, qty: -4, cost: 50 }], pay: noPay, updateCost: false })).toThrow();
  expect(() => erp.confirmSale({ cart: [{ productId: p.id, qty: -1 }], discount: 0, pay: noPay, channel: "POS" })).toThrow();
  expect(erp.load().products[0]?.qty).toBe(10);
});

it("does not let older negative data block unrelated saves", () => {
  const p = product();
  const raw = JSON.parse(localStorage.getItem("shopbook.erp") || "{}");
  raw.products.push({ id: "legacy", name: "Old", buy: 1, sell: 1, qty: -2, createdAt: 0 });
  localStorage.setItem("shopbook.erp", JSON.stringify(raw));
  expect(() => erp.stockIn(p.id, 5, "Restock")).not.toThrow();
  expect(erp.load().products.find((x) => x.id === p.id)?.qty).toBe(15);
});
