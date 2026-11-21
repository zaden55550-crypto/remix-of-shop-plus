import { beforeEach, describe, expect, it, vi } from "vitest";
import { addProduct, commit, confirmSale, empty, load, returnSale, runErpTransaction } from "../lib/erp";
import { getOutbox, pendingOperations, retryDelay, updateOperation } from "../lib/outbox";
describe("durable atomic ERP outbox", () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Test", businessId: "test-business" })); });
  it("persists validated records and operations together across reloads", () => {
    const p = addProduct({ name: "Tea", buy: 10, sell: 20, qty: 10 });
    const raw = JSON.parse(localStorage.getItem("shopbook.erp") ?? "{}");
    expect(raw.products[0].id).toBe(p.id); expect(raw.__outbox).toHaveLength(1); expect(getOutbox()[0]?.phase).toBe("pending");
    expect(load().products[0]?.qty).toBe(10); expect(Object.keys(load())).toEqual(Object.keys(empty()));
  });
  it("failed validation never saves an operation", () => {
    expect(() => addProduct({ name: "", buy: 1, sell: 2, qty: 1 })).toThrow(); expect(getOutbox()).toHaveLength(0);
  });
  it("mixed partial sale and return preserve exact stock and payment data", () => {
    const p = addProduct({ name: "Tea", buy: 10, sell: 20, qty: 10 });
    commit((s) => { s.customers.push({ id: "c", name: "Customer", balance: 0, createdAt: 1 }); });
    const sale = confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: { cash: 10, mpesa: 10, bank: 10, credit: 10 }, customerId: "c", channel: "POS" });
    expect(sale.total).toBe(40); expect(load().products[0]?.qty).toBe(8); expect(load().customers[0]?.balance).toBe(10);
    expect(getOutbox().at(-1)?.changes.find((c) => c.collection === "sales")?.after).toMatchObject({ pay: { cash: 10, mpesa: 10, bank: 10, credit: 10 } });
    returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash"); expect(load().products[0]?.qty).toBe(9); expect(getOutbox()).toHaveLength(4);
  });
  it("never acknowledges on retry; keeps stable IDs, failures and history", () => {
    addProduct({ name: "Tea", buy: 1, sell: 2, qty: 2 }); const id = getOutbox()[0]?.id; if (!id) throw new Error("Missing operation");
    updateOperation(id, { attempts: 2, phase: "failed", error: "Timeout" }, "Retry failed");
    expect(getOutbox()[0]?.id).toBe(id); expect(getOutbox()[0]?.acknowledgedAt).toBeUndefined(); expect(getOutbox()[0]?.history).toHaveLength(2); expect(pendingOperations()).toHaveLength(1);
  });
  it("filters operations from another business and owner", () => {
    localStorage.setItem("shopbook.syncOwner", "owner-a"); addProduct({ name: "Tea", buy: 1, sell: 2, qty: 2 });
    expect(pendingOperations("owner-b")).toHaveLength(0); localStorage.setItem("shopbook.account", JSON.stringify({ businessId: "other" })); expect(pendingOperations()).toHaveLength(0);
  });
  it("quota failure leaves both projection and queue unchanged", () => {
    addProduct({ name: "Tea", buy: 1, sell: 2, qty: 2 }); const before = localStorage.getItem("shopbook.erp");
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Quota exceeded"); });
    expect(() => commit((s) => { if (s.products[0]) s.products[0].sell = 50; })).toThrow("Quota exceeded"); spy.mockRestore(); expect(localStorage.getItem("shopbook.erp")).toBe(before);
  });
  it("bounds per-operation retry backoff at 60 seconds", () => { expect(retryDelay(1)).toBe(2000); expect(retryDelay(20)).toBe(60000); });
  it("never persists preview records or preview operations", () => {
    runErpTransaction(() => { addProduct({ name: "Preview", buy: 1, sell: 2, qty: 2 }); expect(load().products).toHaveLength(1); expect(getOutbox()).toHaveLength(0); }, false);
    expect(load().products).toHaveLength(0); expect(getOutbox()).toHaveLength(0);
  });
  it("commits all import stages as one operation and rolls back failed stages", () => {
    expect(() => runErpTransaction(() => { addProduct({ name: "A", buy: 1, sell: 2, qty: 2 }); throw new Error("Later stage failed"); })).toThrow();
    expect(load().products).toHaveLength(0); expect(getOutbox()).toHaveLength(0);
    runErpTransaction(() => { addProduct({ name: "A", buy: 1, sell: 2, qty: 2 }); addProduct({ name: "B", buy: 1, sell: 2, qty: 3 }); });
    expect(load().products).toHaveLength(2); expect(getOutbox()).toHaveLength(1);
  });
});