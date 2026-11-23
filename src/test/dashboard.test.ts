import { describe, expect, it } from "vitest";
import { dashboardTotals } from "../lib/dashboard";
import { addProduct, confirmSale, load, returnSale } from "../lib/erp";

describe("Dashboard totals", () => {
  it("reads actual sales, returns and stock without changing ERP records", () => {
    localStorage.removeItem("shopbook.erp");
    const product = addProduct({ name: "Cable", buy: 100, sell: 200, qty: 10 });
    const sale = confirmSale({ cart: [{ productId: product.id, qty: 3 }], discount: 0, pay: { cash: 600, bank: 0, mpesa: 0, credit: 0 }, channel: "POS" });
    returnSale(sale.id, [{ productId: product.id, qty: 1 }], "cash");
    const before = localStorage.getItem("shopbook.erp");
    expect(dashboardTotals(load())).toEqual({ sales: 400, stock: 800, purchases: 0, expenses: 0, profit: 200 });
    expect(localStorage.getItem("shopbook.erp")).toBe(before);
    localStorage.removeItem("shopbook.erp");
  });
});
import { dashboardView } from "../lib/dashboard";
import { addCustomer } from "../lib/erp";
import { addExpense, addSupplier, confirmPurchase, floatDeposit, floatTransfer } from "../lib/finance";

describe("Dashboard view", () => {
  const day = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  it("reconciles payment methods, money in/out, balances and debts with the ERP records", () => {
    localStorage.removeItem("shopbook.erp");
    const p = addProduct({ name: "Cable", buy: 100, sell: 200, qty: 20 });
    const jane = addCustomer("Jane");
    const supplier = addSupplier("Kamau");
    floatDeposit("bank", 1000, "DEPOSIT", "Capital");
    floatTransfer("bank", "mpesa", 400);
    confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: { cash: 300, mpesa: 0, bank: 0, credit: 100 }, customerId: jane.id, channel: "POS" });
    confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: { cash: 0, mpesa: 200, bank: 0, credit: 0 }, channel: "Sales" });
    confirmPurchase({ lines: [{ productId: p.id, qty: 5, cost: 100 }], pay: { cash: 0, mpesa: 0, bank: 200, credit: 300 }, supplierId: supplier.id, updateCost: false });
    const before = localStorage.getItem("shopbook.erp");
    const v = dashboardView(load(), day(), Date.now());

    // The four payment methods add up exactly to the sales total.
    expect(v.payTotal).toBe(600);
    expect(v.kpis.sales).toBe(600);
    expect(Object.fromEntries(v.payments.map((x) => [x.method, x.amount]))).toEqual({ cash: 300, mpesa: 200, bank: 0, credit: 100 });
    expect(v.payments.reduce((t, x) => t + x.pct, 0)).toBeCloseTo(100, 0);
    // Credit is not money in; the bank→M-Pesa transfer is neither in nor out.
    expect(v.charts.moneyIn).toBe(1000 + 300 + 200);
    expect(v.charts.moneyOut).toBe(200);
    // Working balance is real money only.
    // The working balance also lists each payment account (custom methods, 2026-11); the totals are what matter here.
    expect(v.working).toMatchObject({ cash: 300, mpesa: 600, bank: 400, total: 1300 });
    // Debt totals and their counts describe the same contacts.
    expect(v.receivables).toEqual({ amount: 100, count: 1 });
    expect(v.payables).toEqual({ amount: 300, count: 1 });
    expect(localStorage.getItem("shopbook.erp")).toBe(before);
  });

  it("shows a loss as a negative profit instead of zero", () => {
    localStorage.removeItem("shopbook.erp");
    const p = addProduct({ name: "Soap", buy: 50, sell: 60, qty: 10 });
    confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: { cash: 60, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" });
    addExpense({ category: "Rent", amount: 100, method: "credit", pay: {} });
    const v = dashboardView(load(), day(), Date.now());
    expect(v.kpis.profit).toBe(10 - 100);
    expect(v.kpis.margin).toBe(-150);
    localStorage.removeItem("shopbook.erp");
  });
});

import { businessAlerts } from "../lib/dashboard";
describe("business alerts", () => {
  const o = { cur: "KSh", tr: (t: string) => t, sync: { phase: "idle" } };
  it("lists nothing for a shop with nothing outstanding", () => {
    localStorage.clear();
    expect(businessAlerts(load(), o)).toEqual([]);
  });
  it("names a low product and a sync failure, from real state only", () => {
    localStorage.clear();
    addProduct({ name: "Bell test", buy: 10, sell: 20, qty: 0 });
    const ids = businessAlerts(load(), { ...o, sync: { phase: "failed" } }).map((a) => a.id);
    expect(ids).toEqual(["lowstock", "sync"]);
  });
});

describe("Dashboard ranges and definitions", () => {
  const day = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

  it("says when a short period's trend charts cover the last 7 days, and not otherwise", () => {
    localStorage.removeItem("shopbook.erp");
    const v = dashboardView(load(), day(), Date.now());
    expect(v.charts.lastWeek).toBe(true);
    expect(v.charts.moneyInOut).toHaveLength(7);
    const month = dashboardView(load(), day() - 20 * 864e5, Date.now());
    expect(month.charts.lastWeek).toBe(false);
  });

  it("profit is gross profit minus expenses, and margin is that profit over sales", () => {
    localStorage.removeItem("shopbook.erp");
    const p = addProduct({ name: "Cable", buy: 100, sell: 200, qty: 10 });
    confirmSale({ cart: [{ productId: p.id, qty: 5 }], discount: 0, pay: { cash: 1000, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" });
    addExpense({ category: "Rent", amount: 200, method: "credit", pay: {} });
    const v = dashboardView(load(), day(), Date.now());
    expect(v.kpis.sales).toBe(1000);
    expect(v.kpis.profit).toBe(1000 - 500 - v.kpis.expenses);
    expect(v.kpis.margin).toBeCloseTo((v.kpis.profit / 1000) * 100, 1);
    expect(v.stockValue).toBe(5 * 100);
  });

  it("keeps customer debt out of the working balance and matches the Receivables figure", () => {
    localStorage.removeItem("shopbook.erp");
    const p = addProduct({ name: "Cable", buy: 100, sell: 200, qty: 10 });
    const jane = addCustomer("Jane");
    confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: { cash: 100, mpesa: 0, bank: 0, credit: 300 }, customerId: jane.id, channel: "POS" });
    const v = dashboardView(load(), day(), Date.now());
    expect(v.receivables.amount).toBe(300);
    expect(v.working.total).toBe(v.working.cash + v.working.mpesa + v.working.bank);
    expect(v.working.total).toBe(100);
  });
});
