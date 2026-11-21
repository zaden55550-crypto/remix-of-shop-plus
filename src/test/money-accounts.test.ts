// Payment methods the owner names (Airtel Money, EVC, Card…) beside Cash, M-Pesa and Bank: usable wherever money moves,
// counted in every balance, and retired only when empty so no money ever drops out of the totals.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import { balanceSheet } from "@/lib/accounting";
import { dashboardView } from "@/lib/dashboard";
import { payRecord, emptyPay } from "@/components/shopbook/pay-picker";

const pay = (extra: Record<string, number> = {}, cash = 0, credit = 0): erp.PayRecord => ({ cash, mpesa: 0, bank: 0, credit, ...extra });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "T", email: "t@x.co", password: "p", currency: "KES", plan: "business", businessId: "b1" }));
});

describe("named money accounts", () => {
  it("allow more than 10 methods (up to the 30 in use guard), with names that don't repeat", () => {
    for (let i = 1; i <= 12; i++) fin.addMoneyAccount(`Wallet ${i}`);
    expect(erp.moneyMethods(erp.load())).toHaveLength(15);
    for (let i = 13; i <= 27; i++) fin.addMoneyAccount(`Wallet ${i}`);
    expect(() => fin.addMoneyAccount("Wallet 28")).toThrow(/Up to 30/);
    expect(() => fin.renameMoneyAccount(erp.namedAccounts(erp.load())[0]!.id, " wallet 2 ")).toThrow(/already exists/);
    expect(() => fin.addMoneyAccount("M-PESA")).toThrow(/already exists/);
    expect(() => fin.addMoneyAccount("credit")).toThrow(/payment state/);
    expect(() => fin.addMoneyAccount("Partial payment")).toThrow(/payment state/);
    expect(() => fin.addMoneyAccount("  ")).toThrow(/Enter a payment method name/);
  });

  it("take sales, debts, purchases, expenses and transfers, and every balance counts them", () => {
    const airtel = fin.addMoneyAccount("Airtel Money");
    const p = erp.addProduct({ name: "A", buy: 5, sell: 10, qty: 50, unit: "pcs" });
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: pay({ [airtel.id]: 20 }, 10), channel: "POS" });
    expect(erp.methodOf(sale.pay)).toBe("Cash + Airtel Money");
    const c = erp.addCustomer("Asha");
    erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: pay({}, 0, 10), customerId: c.id, channel: "Sales" });
    erp.receiveDebt(c.id, 10, airtel.id);
    fin.confirmPurchase({ lines: [{ productId: p.id, qty: 2, cost: 5 }], pay: pay({ [airtel.id]: 10 }), updateCost: false });
    fin.addExpense({ category: "Rent", amount: 5, method: airtel.id, pay: { [airtel.id]: 5 } });
    fin.floatTransfer(airtel.id, "bank", 3);
    const s = erp.load(), b = fin.floatBalances(s);
    expect(fin.balanceOf(b, airtel.id)).toBe(20 + 10 - 10 - 5 - 3);
    expect(fin.totalMoney(b)).toBe(b.cash + b.mpesa + b.bank + fin.balanceOf(b, airtel.id));
    expect(balanceSheet(s).balanced).toBe(true);
    expect(balanceSheet(s).assets.find((a) => a.id === airtel.id)?.value).toBe(12);
    const view = dashboardView(s, 0, Date.now());
    expect(view.working.accounts.map((a) => a.name)).toEqual(["Cash", "M-Pesa", "Bank", "Airtel Money"]);
    expect(view.working.total).toBe(fin.totalMoney(b));
    expect(view.payments.find((x) => x.method === airtel.id)?.amount).toBe(20);
  });

  it("can't pay out more than an account holds", () => {
    const airtel = fin.addMoneyAccount("Airtel Money");
    fin.floatDeposit(airtel.id, 50, "DEPOSIT", "Owner");
    expect(() => fin.floatTransfer(airtel.id, "cash", 60)).toThrow(/Not enough money in Airtel Money/);
  });

  it("retire only when empty, then leave every picker but keep their history", () => {
    const airtel = fin.addMoneyAccount("Airtel Money");
    fin.floatDeposit(airtel.id, 50, "DEPOSIT", "Owner");
    expect(() => fin.setMoneyAccountActive(airtel.id, false)).toThrow(/Move the money out of Airtel Money first/);
    fin.floatTransfer(airtel.id, "cash", 50);
    fin.setMoneyAccountActive(airtel.id, false);
    const s = erp.load();
    expect(erp.moneyMethods(s)).not.toContain(airtel.id);
    expect(fin.shownAccounts(s)).not.toContain(airtel.id);
    expect(() => fin.floatDeposit(airtel.id, 5, "DEPOSIT", "x")).toThrow(/no longer in use/);
    const p = erp.addProduct({ name: "A", buy: 5, sell: 10, qty: 5, unit: "pcs" });
    expect(() => erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: pay({ [airtel.id]: 10 }), channel: "POS" })).toThrow(/no longer in use/);
    expect(s.payments.filter((x) => x.method === airtel.id)).toHaveLength(2);
    fin.setMoneyAccountActive(airtel.id, true);
    expect(erp.moneyMethods(erp.load())).toContain(airtel.id);
  });

  it("refuse a payment method that isn't one of the business's accounts", () => {
    const p = erp.addProduct({ name: "A", buy: 5, sell: 10, qty: 5, unit: "pcs" });
    expect(() => erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: pay({ "acct-nothere": 10 }), channel: "POS" })).toThrow(/Unknown payment method/);
  });

  it("go through the picker: one chosen account, or a P.PAY split across several", () => {
    const airtel = fin.addMoneyAccount("Airtel Money");
    expect(payRecord(emptyPay(airtel.id), 100)).toEqual(pay({ [airtel.id]: 100 }));
    expect(payRecord({ mode: "ppay", split: { cash: "30", [airtel.id]: "50" }, received: "" }, 100)).toEqual(pay({ [airtel.id]: 50 }, 30, 20));
  });
});

describe("configurable payment methods", () => {
  it("rename, recategorise, reorder and disable Cash, M-Pesa and Bank without moving any record", () => {
    const p = erp.addProduct({ name: "A", buy: 5, sell: 10, qty: 50, unit: "pcs" });
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: { cash: 0, mpesa: 20, bank: 0, credit: 0 }, channel: "POS" });
    fin.renameMoneyAccount("mpesa", "EVC");
    fin.setMoneyAccountCategory("mpesa", "mobile");
    const card = fin.addMoneyAccount("Card", "card");
    fin.moveMoneyAccount(card.id, -1); fin.moveMoneyAccount(card.id, -1); fin.moveMoneyAccount(card.id, -1);
    let s = erp.load();
    expect(erp.methodName("mpesa", s)).toBe("EVC");
    expect(erp.moneyMethods(s)).toEqual([card.id, "cash", "mpesa", "bank"]);
    expect(erp.paymentMethods(s).find((m) => m.id === card.id)?.category).toBe("card");
    // The sale still records mpesa; only its name changed.
    expect(s.sales.find((x) => x.id === sale.id)?.pay.mpesa).toBe(20);
    expect(fin.balanceOf(fin.floatBalances(s), "mpesa")).toBe(20);
    // A method holding money can't be disabled; an empty one can, and new payments then refuse it.
    expect(() => fin.setMoneyAccountActive("mpesa", false)).toThrow(/Move the money out of EVC/);
    fin.setMoneyAccountActive("bank", false);
    s = erp.load();
    expect(erp.moneyMethods(s)).toEqual([card.id, "cash", "mpesa"]);
    expect(erp.moneyMethods(s, true)).toContain("bank");
    expect(() => erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: { cash: 0, mpesa: 0, bank: 10, credit: 0 }, channel: "POS" })).toThrow(/Bank is no longer in use/);
    // A pay record still carries bank: 0, which is fine.
    expect(() => erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: { cash: 10, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" })).not.toThrow();
    expect(erp.defaultMethod(erp.load())).toBe(card.id);
    expect(emptyPay().mode).toBe(card.id);
  });

  it("keeps at least one method in use", () => {
    fin.setMoneyAccountActive("mpesa", false); fin.setMoneyAccountActive("bank", false);
    expect(() => fin.setMoneyAccountActive("cash", false)).toThrow(/at least one/);
  });

  it("never reports Credit as a payment method", () => {
    const p = erp.addProduct({ name: "A", buy: 5, sell: 10, qty: 50, unit: "pcs" });
    const c = erp.addCustomer("Asha", "0700");
    erp.confirmSale({ cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: { cash: 10, mpesa: 0, bank: 0, credit: 20 }, channel: "POS", customerId: c.id });
    const s = erp.load();
    expect(erp.moneyMethods(s, true)).not.toContain("credit");
    expect(erp.payLines(s, s.sales[0]!.pay)).toEqual([["cash", 10], ["credit", 20]]);
    // Partial payment: the paid part goes to the method, the rest stays owed.
    expect(payRecord({ mode: "ppay", split: { cash: "12" }, received: "" }, 30)).toEqual({ cash: 12, mpesa: 0, bank: 0, credit: 18 });
    expect(payRecord({ mode: "credit", split: {}, received: "" }, 30)).toEqual({ cash: 0, mpesa: 0, bank: 0, credit: 30 });
  });
});
