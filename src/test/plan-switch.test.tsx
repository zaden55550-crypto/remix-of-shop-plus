// Moving between plans: the payment step decides, nothing is deleted, and every locked app's records can still be downloaded.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as erp from "@/lib/erp";
import { takePayment } from "@/lib/payment";
import { PLAN_CHANGED_EVENT, buyPlan } from "@/lib/plan-change";
import { SHEETS } from "@/lib/records-export";
import { canOpen, store, type Account } from "@/lib/shopbook";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => navigate,
}));

const account = (extra: Partial<Account> = {}): Account => ({
  shopName: "Amina",
  email: "a@b.c",
  currency: "KES",
  password: "x",
  ...extra,
});
async function openPlans() {
  const { Route } = await import("@/routes/plans");
  const Plans = (Route as unknown as { options: { component: ComponentType } }).options.component;
  render(<Plans />);
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
});
afterEach(cleanup);

describe("buying a plan", () => {
  it("accepts every payment in the testing period and takes no money", async () => {
    expect(await takePayment({ planId: "basic", billing: "monthly", amountUsd: 11 })).toMatchObject(
      { ok: true, test: true },
    );
  });

  it("moves down from Business, locking the apps Basic leaves out", async () => {
    store.save(account({ plan: "business" }));
    expect(await buyPlan("basic", "monthly")).toMatchObject({ ok: true, firstPlan: false });
    const now = store.get();
    expect(now?.plan).toBe("basic");
    expect(canOpen(now, "basic")).toBe(true);
    expect(canOpen(now, "growth")).toBe(false);
  });

  it("deletes nothing when moving down", async () => {
    store.save(account({ plan: "business" }));
    const records = localStorage.getItem("shopbook.erp");
    await buyPlan("basic", "monthly");
    expect(localStorage.getItem("shopbook.erp")).toBe(records);
  });

  it("leaves the plan alone when a payment is refused", async () => {
    store.save(account({ plan: "trial", trialStart: 1, trialChoice: "basic" }));
    const refused = async () => ({ ok: false as const, error: "Card declined" });
    expect(await buyPlan("basic", "monthly", refused)).toEqual({
      ok: false,
      error: "Card declined",
    });
    expect(store.get()).toMatchObject({ plan: "trial", trialChoice: "basic" });
  });

  it("charges the right amount for the billing period", async () => {
    store.save(account({ plan: "trial" }));
    const pay = vi.fn(takePayment);
    await buyPlan("growth", "yearly", pay);
    expect(pay).toHaveBeenCalledWith({ planId: "growth", billing: "yearly", amountUsd: 238 });
  });

  it("refuses employees and the plan they're already on, without taking payment", async () => {
    const pay = vi.fn(takePayment);
    store.save(
      account({
        plan: "growth",
        staff: {
          memberId: "m",
          fullName: "S",
          role: "cashier",
          permissions: [],
          businesses: [],
          locations: [],
        },
      }),
    );
    expect((await buyPlan("basic", "monthly", pay)).ok).toBe(false);
    store.save(account({ plan: "growth" }));
    expect((await buyPlan("growth", "monthly", pay)).ok).toBe(false);
    expect(pay).not.toHaveBeenCalled();
  });

  it("tells Cloud backup to save at the moment of the switch", async () => {
    store.save(account({ plan: "business" }));
    const saved = vi.fn();
    window.addEventListener(PLAN_CHANGED_EVENT, saved);
    await buyPlan("growth", "monthly");
    window.removeEventListener(PLAN_CHANGED_EVENT, saved);
    expect(saved).toHaveBeenCalledOnce();
  });
});

describe("the plans page", () => {
  it("activates from the payment page, saying it's a test", async () => {
    store.save(account({ plan: "business" }));
    await openPlans();
    fireEvent.click(await screen.findByRole("button", { name: /buy basic/i }));
    expect(screen.getByText(/test mode/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /download my records/i })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Activate Basic" }));
    await waitFor(() => expect(store.get()?.plan).toBe("basic"));
    expect(navigate).toHaveBeenCalledWith({ to: "/apps" });
  });

  it("sends a first-time buyer to shop setup", async () => {
    store.save(account());
    await openPlans();
    fireEvent.click(screen.getByRole("button", { name: /buy growth/i }));
    fireEvent.click(screen.getByRole("button", { name: "Activate Growth" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/setup" }));
  });

  it("a paid customer can't go back to the free trial or rebuy their plan", async () => {
    store.save(account({ plan: "basic", trialStart: Date.now() }));
    await openPlans();
    const onPlan = (await screen.findByRole("button", {
      name: "You are on Basic",
    })) as HTMLButtonElement;
    expect(onPlan.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Your plan" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: /buy business/i }));
    expect(screen.queryByText(/free trial instead/i)).toBeNull();
  });
});

describe("taking the records away", () => {
  const shop = () => {
    const s = erp.empty();
    s.employees.push({
      id: "e",
      name: "Juma",
      role: "Cashier",
      comp: "salary",
      salary: 500,
      rule: { kind: "none", value: 0, paidOnly: false },
      active: true,
      createdAt: 1,
    } as erp.Employee);
    s.payrolls.push({
      id: "r",
      ref: "PAY-1",
      at: 1000,
      employeeId: "e",
      from: 1000,
      to: 2000,
      salary: 500,
      commission: 0,
      deductions: 50,
      net: 450,
      paid: 450,
      user: "A",
    });
    s.payrollPayments.push({
      id: "p",
      ref: "PP-1",
      at: 1000,
      payrollId: "r",
      employeeId: "e",
      method: "cash",
      amount: 450,
      user: "A",
    });
    s.cash.push({
      id: "c",
      at: 1000,
      type: "CASH UP",
      amount: 900,
      expected: 900,
      counted: 900,
      user: "A",
    });
    s.payments.push({
      id: "m",
      ref: "EXP-1",
      at: 1000,
      method: "cash",
      amount: -20,
      kind: "EXPENSE",
    } as erp.Payment);
    return s;
  };
  const sheet = (name: string) =>
    SHEETS.find((x) => x.name === name)!
      .rows(shop())
      .map((r) => r.row);

  it("covers what the locked apps hold, with the people's names", () => {
    expect(sheet("Employees")[0]).toMatchObject({ Name: "Juma", Salary: 500 });
    expect(sheet("Payroll")[0]).toMatchObject({ Ref: "PAY-1", Employee: "Juma", Net: 450 });
    expect(sheet("Payroll payments")[0]).toMatchObject({
      Employee: "Juma",
      Payroll: "PAY-1",
      Amount: 450,
    });
    expect(sheet("Cash register")[0]).toMatchObject({ Type: "CASH UP", Counted: 900 });
    expect(sheet("Money movements")[0]).toMatchObject({ Kind: "EXPENSE", Amount: -20 });
  });
  it("the journal's debits equal its credits", () => {
    const s = shop();
    s.sales.push({
      id: "x",
      ref: "S-1",
      at: 1000,
      items: [],
      subtotal: 100,
      discount: 0,
      tax: 0,
      total: 100,
      pay: { cash: 100, mpesa: 0, bank: 0, credit: 0 },
      user: "A",
      channel: "POS",
    } as unknown as erp.Sale);
    const rows = SHEETS.find((x) => x.name === "Accounting journal")!
      .rows(s)
      .map((r) => r.row as { Debit: number; Credit: number });
    expect(rows.reduce((a, r) => a + r.Debit, 0)).toBeCloseTo(
      rows.reduce((a, r) => a + r.Credit, 0),
    );
  });
  it("every sheet name fits Excel's limit and works on an empty shop", () => {
    for (const x of SHEETS) {
      expect(x.name.length).toBeLessThanOrEqual(31);
      expect(x.rows(erp.empty())).toEqual([]);
    }
  });
});
