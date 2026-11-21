// What happens to a sale between the counter and the server: lost connections, refusals, a refresh of the copy, and signing out.
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as erp from "@/lib/erp";
import { getOutbox } from "@/lib/outbox";

const server = vi.hoisted(() => ({ staffRecord: vi.fn(), staffSnapshot: vi.fn() }));
vi.mock("@/lib/people-access.functions", () => ({ ...server, employeeSignIn: vi.fn(), myAccess: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signOut: vi.fn(async () => ({})) } } }));

const { endStaffSession, refreshStaffRecords, sendStaffQueue } = await import("@/lib/staff-session");

const MEMBER = "member-1", KEPT = `shopbook.staffUnsent.${MEMBER}`;
const product = { id: "p1", name: "Sugar", buy: 0, sell: 2, qty: 10, createdAt: 1 };
const copy = (qty = 10) => ({ ...erp.empty(), products: [{ ...product, qty }] });
const sell = (qty = 1) => erp.confirmSale({ cart: [{ productId: "p1", qty }], discount: 0, pay: { cash: qty * 2, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" });
const qty = () => erp.load().products[0]?.qty;
const phases = () => getOutbox().map((o) => o.phase);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Town", email: "", currency: "KES", password: "", role: "staff", staff: { memberId: MEMBER, fullName: "Amina", role: "shopkeeper", permissions: ["sales.process"], businesses: [], locations: [], activeLocationId: undefined } }));
  localStorage.setItem("shopbook.erp", JSON.stringify(copy()));
  server.staffRecord.mockResolvedValue({ refused: null });
  server.staffSnapshot.mockResolvedValue({ state: JSON.stringify(copy()), updatedAt: "" });
});

describe("sending", () => {
  it("sends in order and marks each one confirmed", async () => {
    const a = sell(), b = sell(2);
    await sendStaffQueue();
    expect(server.staffRecord.mock.calls.map(([x]) => x.data.id)).toEqual([a.id, b.id]);
    expect(phases()).toEqual(["synced", "synced"]);
  });

  it("nothing is sent while offline, and the sale stays on the screen", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    sell(3);
    await sendStaffQueue();
    online.mockRestore();
    expect(server.staffRecord).not.toHaveBeenCalled();
    expect(phases()).toEqual(["pending"]);
    expect(qty()).toBe(7);
  });

  it("a lost connection keeps the sale and the order, and resends the same operation", async () => {
    const a = sell(); sell();
    server.staffRecord.mockRejectedValueOnce(new Error("Network down"));
    await sendStaffQueue();
    expect(server.staffRecord).toHaveBeenCalledTimes(1);
    expect(phases()).toEqual(["failed", "pending"]);
    const raw = JSON.parse(localStorage.getItem("shopbook.erp")!);
    raw.__outbox[0].nextRetry = 0;
    localStorage.setItem("shopbook.erp", JSON.stringify(raw));
    await sendStaffQueue();
    expect(server.staffRecord.mock.calls[1]?.[0].data.id).toBe(a.id);
    expect(phases()).toEqual(["synced", "synced"]);
  });

  it("a refused sale is set aside with its reason, the employee is told, and the rest still go", async () => {
    const told = vi.fn(); window.addEventListener("shopbook-staff-refused", told);
    sell(); sell();
    server.staffRecord.mockResolvedValueOnce({ refused: "Insufficient stock: Sugar (available 0)" });
    await sendStaffQueue();
    window.removeEventListener("shopbook-staff-refused", told);
    expect(phases()).toEqual(["conflict", "synced"]);
    expect(getOutbox()[0]?.error).toMatch(/Insufficient/);
    expect(told).toHaveBeenCalledTimes(1);
  });
});

describe("refreshing the copy", () => {
  it("a sale not yet sent stays on the new copy", async () => {
    sell(4);
    await refreshStaffRecords();
    expect(qty()).toBe(6);
    expect(erp.load().sales).toHaveLength(1);
    expect(phases()).toEqual(["pending"]);
  });

  it("a confirmed sale isn't counted twice: the new copy already has it", async () => {
    sell(4);
    await sendStaffQueue();
    server.staffSnapshot.mockResolvedValue({ state: JSON.stringify(copy(6)), updatedAt: "" });
    await refreshStaffRecords();
    expect(qty()).toBe(6);
  });

  it("a refused sale drops off the screen, because it isn't in the books", async () => {
    sell(4);
    server.staffRecord.mockResolvedValueOnce({ refused: "No" });
    await sendStaffQueue();
    await refreshStaffRecords();
    expect(qty()).toBe(10);
    expect(erp.load().sales).toEqual([]);
  });
});

describe("signing out", () => {
  it("clears the copy but keeps a sale the server hasn't got, for this login only", async () => {
    const sale = sell();
    await endStaffSession();
    expect(localStorage.getItem("shopbook.erp")).toBeNull();
    expect(JSON.parse(localStorage.getItem(KEPT)!).map((o: { id: string }) => o.id)).toEqual([sale.id]);
  });

  it("keeps nothing when everything has been sent", async () => {
    sell();
    await sendStaffQueue();
    await endStaffSession();
    expect(localStorage.getItem(KEPT)).toBeNull();
  });
});
