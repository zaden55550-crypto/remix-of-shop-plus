// Purchases app: the rules behind orders, invoices, payments and cancellation, and the five menus on the real screen.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import * as pur from "@/lib/purchasing";
import { balances, journal } from "@/lib/accounting";
import { saveContact } from "@/lib/people";

const navigate = vi.hoisted(() => () => {});
const link = vi.hoisted(() => ({ search: {} as Record<string, string> }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options, useSearch: () => link.search }),
  useNavigate: () => navigate, // stable like the real hook; a new fn per render loops the account effect
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/shopbook/connection-status", () => ({ ConnectionStatus: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const { Route } = await import("@/routes/purchases");
const Purchases = (Route as unknown as { options: { component: () => ReactElement } }).options.component;

const credit = (n: number) => ({ cash: 0, mpesa: 0, bank: 0, credit: n });
let p: erp.Product, sup: erp.Supplier;
beforeEach(() => {
  link.search = {};
  localStorage.clear();
  localStorage.setItem("shopbook.session", "1");
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Test Shop", email: "t@example.com", currency: "KES", password: "x", plan: "trial", trialStart: Date.now() }));
  p = erp.addProduct({ name: "Soap", buy: 50, sell: 100, qty: 0, unit: "Piece" });
  sup = fin.addSupplier("Kevin", "0700");
  fin.floatDeposit("bank", 100000, "DEPOSIT", "Capital");
});
const stock = () => erp.load().products.find((x) => x.id === p.id)!.qty;
const balance = () => erp.load().suppliers.find((x) => x.id === sup.id)!.balance;
const order = (qty = 10) => pur.saveOrder({ supplierId: sup.id, at: Date.now(), lines: [{ productId: p.id, qty, cost: 50 }], status: "Sent" });

describe("purchase orders", () => {
  it("an order changes no stock; receiving does, in parts, up to what was ordered", () => {
    const o = order();
    expect(stock()).toBe(0);
    expect(erp.load().movements.filter((m) => m.type === "PURCHASE")).toHaveLength(0);
    pur.receiveOrder(o.id, [{ productId: p.id, qty: 4 }], credit(200));
    expect(stock()).toBe(4);
    expect(balance()).toBe(200);
    expect(erp.load().purchaseOrders[0]?.status).toBe("Partially Received");
    expect(erp.load().purchases[0]?.orderId).toBe(o.id);
    expect(() => pur.receiveOrder(o.id, [{ productId: p.id, qty: 7 }], credit(350))).toThrow(/Only 6/);
    expect(stock()).toBe(4);
    pur.receiveOrder(o.id, [{ productId: p.id, qty: 6 }], credit(300));
    expect(stock()).toBe(10);
    expect(erp.load().purchaseOrders[0]?.status).toBe("Completed");
  });

  it("a failed receipt changes nothing at all", () => {
    const o = order();
    expect(() => pur.receiveOrder(o.id, [{ productId: p.id, qty: 4 }], { cash: 0, mpesa: 0, bank: 200000, credit: 0 })).toThrow();
    expect(stock()).toBe(0);
    expect(erp.load().purchases).toHaveLength(0);
    expect(erp.load().purchaseOrders[0]?.lines[0]?.received).toBe(0);
  });

  it("only a live order can be edited or cancelled, and a cancelled one stays", () => {
    const o = order();
    pur.cancelOrder(o.id, "Supplier out of stock");
    expect(erp.load().purchaseOrders[0]).toMatchObject({ status: "Cancelled", cancelReason: "Supplier out of stock" });
    expect(() => pur.saveOrder({ id: o.id, supplierId: sup.id, at: 1, lines: [{ productId: p.id, qty: 1, cost: 1 }] })).toThrow(/draft or sent/);
    expect(() => pur.receiveOrder(o.id, [{ productId: p.id, qty: 1 }], credit(50))).toThrow(/can't receive/);
  });
});

describe("supplier invoices", () => {
  const bought = () => fin.confirmPurchase({ lines: [{ productId: p.id, qty: 10, cost: 50 }], pay: credit(500), supplierId: sup.id, updateCost: false });

  it("an invoice never adds to the balance, and refuses duplicates or the wrong supplier", () => {
    const pu = bought();
    pur.saveInvoice({ number: "INV-1", supplierId: sup.id, purchaseId: pu.id, at: Date.now(), amount: 500 });
    expect(balance()).toBe(500);
    expect(() => pur.saveInvoice({ number: " inv-1 ", supplierId: sup.id, purchaseId: pu.id, at: Date.now(), amount: 500 })).toThrow(/already has an invoice/);
    expect(() => pur.saveInvoice({ number: "INV-2", supplierId: sup.id, at: Date.now(), amount: 500 })).toThrow(/Link the invoice/);
    const other = fin.addSupplier("Other");
    expect(() => pur.saveInvoice({ number: "INV-3", supplierId: other.id, purchaseId: pu.id, at: Date.now(), amount: 500 })).toThrow(/another supplier/);
  });

  it("paying an invoice moves its status and the supplier's balance as one figure", () => {
    const pu = bought();
    const inv = pur.saveInvoice({ number: "INV-1", supplierId: sup.id, purchaseId: pu.id, at: Date.now(), amount: 500 });
    expect(pur.invoiceStatus(erp.load(), inv)).toBe("Unpaid");
    pur.recordSupplierPayment({ supplierId: sup.id, invoiceId: inv.id, parts: [{ method: "bank", amount: 200 }] });
    let s = erp.load();
    expect(pur.invoiceStatus(s, s.supplierInvoices[0]!)).toBe("Partially Paid");
    expect(pur.invoiceBalance(s, s.supplierInvoices[0]!)).toBe(300);
    expect(balance()).toBe(300);
    expect(s.payments.find((x) => x.kind === "SUPPLIER PAYMENT")?.docRef).toBe("INV-1");
    pur.saveInvoice({ ...inv, id: inv.id, dueAt: Date.now() - 3 * 86400000 });
    s = erp.load();
    expect(pur.invoiceStatus(s, s.supplierInvoices[0]!)).toBe("Overdue");
  });

  it("two invoices on one purchase don't both claim the same money", () => {
    const pu = bought();
    const a = pur.saveInvoice({ number: "A", supplierId: sup.id, purchaseId: pu.id, at: 1, amount: 300 });
    erp.commit((s) => { s.supplierInvoices[0]!.createdAt = 1; });
    const b = pur.saveInvoice({ number: "B", supplierId: sup.id, purchaseId: pu.id, at: 2, amount: 200 });
    fin.payPurchase(pu.id, 300, "bank");
    const s = erp.load();
    expect(pur.invoicePaid(s, s.supplierInvoices.find((x) => x.id === a.id)!)).toBe(300);
    expect(pur.invoicePaid(s, s.supplierInvoices.find((x) => x.id === b.id)!)).toBe(0);
  });
});

describe("supplier payments", () => {
  it("a combined payment is all or nothing, and a repeat is refused", () => {
    const pu = fin.confirmPurchase({ lines: [{ productId: p.id, qty: 10, cost: 50 }], pay: credit(500), supplierId: sup.id, updateCost: false });
    expect(() => pur.recordSupplierPayment({ supplierId: sup.id, purchaseId: pu.id, parts: [{ method: "bank", amount: 100 }, { method: "mpesa", amount: 100 }] })).toThrow(/Not enough money in M-Pesa/);
    expect(balance()).toBe(500);
    expect(erp.load().payments.filter((x) => x.kind === "SUPPLIER PAYMENT")).toHaveLength(0);
    fin.floatTransfer("bank", "mpesa", 1000);
    const rows = pur.recordSupplierPayment({ supplierId: sup.id, purchaseId: pu.id, parts: [{ method: "bank", amount: 100 }, { method: "mpesa", amount: 150 }], note: "Part one" });
    expect(rows.map((r) => [r.method, r.amount, r.note])).toEqual(expect.arrayContaining([["bank", -100, "Part one"], ["mpesa", -150, "Part one"]]));
    expect(balance()).toBe(250);
    expect(() => pur.recordSupplierPayment({ supplierId: sup.id, purchaseId: pu.id, parts: [{ method: "bank", amount: 100 }] })).toThrow(/just recorded/);
    expect(balance()).toBe(250);
  });
});

describe("cancelling a purchase", () => {
  it("takes the stock out, clears what's owed, refunds what was paid, keeps the record and balances the books", () => {
    const pu = fin.confirmPurchase({ lines: [{ productId: p.id, qty: 10, cost: 50 }], pay: { cash: 0, mpesa: 0, bank: 200, credit: 300 }, supplierId: sup.id, updateCost: false });
    const bank = fin.floatBalances(erp.load()).bank;
    expect(() => pur.cancelPurchase(pu.id, "", "bank")).toThrow(/reason/);
    expect(() => pur.cancelPurchase(pu.id, "Wrong goods", "credit")).toThrow(/money to refund/);
    pur.cancelPurchase(pu.id, "Wrong goods", "bank");
    const s = erp.load(), after = s.purchases.find((x) => x.id === pu.id)!;
    expect(after.cancelled?.reason).toBe("Wrong goods");
    expect(pur.purchaseState(after)).toBe("Cancelled");
    expect(stock()).toBe(0);
    expect(balance()).toBe(0);
    expect(fin.floatBalances(s).bank).toBe(bank + 200);
    expect(s.purchaseReturns.reduce((a, r) => a + r.amount, 0)).toBe(500);
    expect(() => pur.cancelPurchase(pu.id, "Again", "bank")).toThrow(/already cancelled/);
    const entries = journal(s);
    entries.forEach((e) => expect(Math.round(e.lines.reduce((a, l) => a + l.debit - l.credit, 0) * 100)).toBe(0));
    expect(balances(entries).payables.net).toBe(0);
    expect(balances(entries).inventory.net).toBe(0);
  });

  it("refuses when the goods have already been sold", () => {
    const pu = fin.confirmPurchase({ lines: [{ productId: p.id, qty: 10, cost: 50 }], pay: credit(500), supplierId: sup.id, updateCost: false });
    erp.stockOut(p.id, 8, "Sold");
    expect(() => pur.cancelPurchase(pu.id, "Oops", "bank")).toThrow(/Not enough stock/);
    expect(balance()).toBe(500);
  });
});

describe("the Overview's figures", () => {
  const buy = (qty: number, pay = credit(qty * 50)) => fin.confirmPurchase({ lines: [{ productId: p.id, qty, cost: 50 }], pay, supplierId: sup.id, updateCost: false });

  it("an order, a draft or an invoice adds nothing; a combined payment counts once", () => {
    order(100);
    const pu = buy(10);
    pur.saveInvoice({ number: "INV-1", supplierId: sup.id, purchaseId: pu.id, at: Date.now(), amount: 500 });
    fin.floatTransfer("bank", "mpesa", 1000);
    pur.recordSupplierPayment({ supplierId: sup.id, purchaseId: pu.id, parts: [{ method: "bank", amount: 100 }, { method: "mpesa", amount: 150 }] });
    expect(pur.purchaseKpis(erp.load())).toEqual({ total: 500, paid: 250, outstanding: 250, received: 500 });
  });

  it("a cancelled purchase leaves every figure, its refund included", () => {
    const pu = buy(10, { cash: 0, mpesa: 0, bank: 200, credit: 300 });
    pur.cancelPurchase(pu.id, "Wrong goods", "bank");
    expect(pur.purchaseKpis(erp.load())).toEqual({ total: 0, paid: 0, outstanding: 0, received: 0 });
  });

  it("the period narrows them; Outstanding is then today's debt on that period's purchases", () => {
    const old = buy(10), recent = buy(4);
    const week = 7 * 86400000, long = Date.now() - 30 * 86400000;
    erp.commit((s) => { const x = s.purchases.find((y) => y.id === old.id)!; x.at = long; });
    fin.payPurchase(old.id, 100, "bank"); // paid today, for an old purchase
    const s = erp.load(), range = { from: Date.now() - week, to: Date.now() };
    expect(pur.purchaseKpis(s, range)).toEqual({ total: 200, paid: 100, outstanding: 200, received: 200 });
    expect(pur.purchaseKpis(s).outstanding).toBe(600); // the whole account, as the supplier balance says
    expect(fin.purchaseBalance(s, s.purchases.find((y) => y.id === recent.id)!)).toBe(200);
  });
});

describe("suppliers", () => {
  it("the statement ends on the supplier's real balance", () => {
    const pu = fin.confirmPurchase({ lines: [{ productId: p.id, qty: 10, cost: 50 }], pay: { cash: 0, mpesa: 0, bank: 100, credit: 400 }, supplierId: sup.id, updateCost: false });
    fin.payPurchase(pu.id, 150, "bank");
    fin.returnPurchase(pu.id, [{ productId: p.id, qty: 1 }], "credit");
    const s = erp.load(), found = s.suppliers.find((x) => x.id === sup.id)!, rows = pur.supplierStatement(s, found);
    expect(found.balance).toBe(200);
    expect(rows.at(-1)?.balance).toBe(200);
  });

  it("no second supplier with the same name, from Purchases or Contacts", () => {
    expect(() => fin.addSupplier(" kevin ")).toThrow(/already exists/);
    expect(() => saveContact("suppliers", { name: "Kevin" })).toThrow(/already exists/);
  });
});

describe("the screen", () => {
  const tabs = (i: number) => within(screen.getAllByRole("tablist")[i]!).getAllByRole("tab").map((t) => t.textContent?.toLowerCase());
  const open = async (menu: string, sub?: string) => { fireEvent.click(await screen.findByRole("tab", { name: new RegExp(`^${menu}$`, "i") })); if (sub) fireEvent.click(screen.getByRole("tab", { name: new RegExp(`^${sub}$`, "i") })); };

  it("has exactly the five menus and their submenus, in order", async () => {
    render(<Purchases />);
    await screen.findByRole("tab", { name: "Overview" });
    expect(tabs(0)).toEqual(["overview", "purchases", "orders & invoices", "suppliers & payments", "reports"]);
    expect(screen.getAllByRole("tablist")).toHaveLength(1); // Overview has no submenu
    await open("Purchases"); expect(tabs(1)).toEqual(["all purchases", "draft purchases", "cancelled purchases", "purchase returns"]);
    await open("Orders & Invoices"); expect(tabs(1)).toEqual(["purchase orders", "supplier invoices"]);
    await open("Suppliers & Payments"); expect(tabs(1)).toEqual(["suppliers", "supplier payments"]);
    await open("Reports"); expect(tabs(1)).toEqual(["purchase reports", "supplier reports", "payment reports", "returns reports", "stock received reports"]);
  });

  it("Overview shows the four KPI cards above its four sections, with real figures", async () => {
    const pu = fin.confirmPurchase({ lines: [{ productId: p.id, qty: 10, cost: 50 }], pay: { cash: 0, mpesa: 0, bank: 100, credit: 400 }, supplierId: sup.id, updateCost: false });
    fin.payPurchase(pu.id, 50, "bank");
    render(<Purchases />);
    await screen.findByRole("tab", { name: "Overview" });
    const cards = [...document.querySelectorAll(".pm-kpis .dash-kpi")].map((k) => k.textContent);
    expect(cards).toEqual([expect.stringMatching(/Total Purchases.*500/i), expect.stringMatching(/Amount Paid.*150/i), expect.stringMatching(/Outstanding Balance.*350/i), expect.stringMatching(/Stock Received.*500/i)]);
    for (const t of ["Recent Purchases", "Recent Stock Received", "Outstanding Payments", "Purchase Activity"]) expect(await screen.findByRole("heading", { name: t })).toBeTruthy();
    expect(document.querySelectorAll(".dash-kpi")).toHaveLength(4);
  });

  it("an old saved link lands on the screen that replaced it", async () => {
    link.search = { menu: "Suppliers", sub: "Balances" };
    render(<Purchases />);
    expect((await screen.findByRole("tab", { name: "Suppliers & Payments" })).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Suppliers" }).getAttribute("aria-selected")).toBe("true");
  });

  it("All Purchases has the toolbar in order, View and Edit only, and search finds product names", async () => {
    const pu = fin.confirmPurchase({ lines: [{ productId: p.id, qty: 2, cost: 50 }], pay: credit(100), supplierId: sup.id, updateCost: false });
    render(<Purchases />);
    await open("Purchases");
    const bar = document.querySelector(".pm-toolbar")!;
    expect([...bar.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") ?? b.textContent)?.toLowerCase())).toEqual(["scan", "filters", "period", "new purchase", "import", "share"]);
    expect(within(document.querySelector(".pm-actions") as HTMLElement).getAllByRole("button").map((b) => b.textContent)).toEqual(["View", "Edit"]);
    fireEvent.change(screen.getByRole("textbox", { name: /Search by purchase/ }), { target: { value: "soap" } });
    expect(screen.getByText(pu.ref)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: /Search by purchase/ }), { target: { value: "zzz" } });
    expect(screen.queryByText(pu.ref)).toBeNull();
  });

  it("All Purchases opens a purchase-only import flow and keeps its export/share menu", async () => {
    render(<Purchases />);
    await open("Purchases");
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(screen.getByRole("heading", { name: "Import Purchases" })).toBeTruthy();
    expect(screen.getByText(/Import purchases only/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Download template/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Share/ })).toBeTruthy();
  });

  it("All Purchases Scan opens the purchase scanner and adds a known barcode", async () => {
    const scanned = erp.addProduct({ name: "Scan Item", buy: 60, sell: 90, qty: 0, barcode: "123456789" });
    render(<Purchases />);
    await open("Purchases");
    const bar = document.querySelector(".pm-toolbar")!;
    const buttons = [...bar.querySelectorAll("button")].map((b) => (b.getAttribute("aria-label") ?? b.textContent)?.toLowerCase());
    expect(buttons.indexOf("scan")).toBeLessThan(buttons.indexOf("filters"));
    fireEvent.click(screen.getByRole("button", { name: /Scan/i }));
    fireEvent.change(await screen.findByPlaceholderText("Barcode"), { target: { value: scanned.barcode } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(document.querySelectorAll(".pur-line:not(.pur-line-head)")).toHaveLength(1);
    expect(document.querySelector(".pur-line-name")?.textContent).toContain("Scan Item");
  });

  it("All Purchases Scan lets me name a product when its barcode is unknown", async () => {
    const code = "UNKNOWN-UPC-556677";
    render(<Purchases />);
    await open("Purchases");
    fireEvent.click(screen.getByRole("button", { name: /Scan/i }));
    fireEvent.change(await screen.findByPlaceholderText("Barcode"), { target: { value: code } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    fireEvent.change(await screen.findByPlaceholderText("Product name"), { target: { value: "New Scanned Item" } });
    fireEvent.change(screen.getByPlaceholderText("Buying price"), { target: { value: "45" } });
    fireEvent.change(screen.getByPlaceholderText("Selling price"), { target: { value: "70" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(erp.findByCode(erp.load(), code)?.name).toBe("New Scanned Item");
    expect(document.querySelector(".pur-line-name")?.textContent).toContain("New Scanned Item");
  });

  it("New Order saves an order and leaves stock alone", async () => {
    render(<Purchases />);
    await open("Orders & Invoices");
    expect(screen.getByRole("button", { name: "New Order" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Purchase Orders" }).getAttribute("aria-selected")).toBe("true");
    order(3);
    expect(await screen.findByText("LPO-000001")).toBeTruthy();
    expect(stock()).toBe(0);
  });
});
