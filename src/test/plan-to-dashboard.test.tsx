// The whole first run for each plan: choose, confirm the trial, save the choice, set up the first shop, reach the Dashboard's setup list.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetupChecklist } from "@/components/shopbook/setup-checklist";
import * as erp from "@/lib/erp";
import { LANGS } from "@/lib/i18n";
import { translateText } from "@/lib/interface-translations";
import { MAIN_LOCATION, locationUsage } from "@/lib/locations";
import { readSetupMarks, setupListShown, setupSteps } from "@/lib/setup-checklist";
import {
  PLANS,
  loginAllowance,
  planAllowanceLines,
  planEmployeeRule,
  store,
  type Account,
} from "@/lib/shopbook";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => navigate,
  Link: ({ children, to, onClick }: { children: ReactNode; to: string; onClick?: () => void }) => (
    <a
      href={to}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
    >
      {children}
    </a>
  ),
}));

const account = (extra: Partial<Account> = {}): Account => ({
  shopName: "Amina Traders",
  email: "a@b.c",
  currency: "KES",
  password: "x",
  ...extra,
});
async function page(route: string) {
  const { Route } = await import(`@/routes/${route}.tsx`);
  const Screen = (Route as unknown as { options: { component: ComponentType } }).options.component;
  render(<Screen />);
}

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
  store.register(account());
});
afterEach(cleanup);

describe.each(PLANS.map((p) => [p.name, p] as const))("first run on %s", (name, plan) => {
  it("goes from choosing the plan to the Dashboard's setup list", async () => {
    await page("plans");
    fireEvent.click(screen.getByText(plan.subtitle));
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(`start 30-day free trial with ${name}`, "i") }),
    );
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/billing never starts automatically/i)).toBeTruthy();
    expect(
      dialog.getByText(
        `${name} is saved as your choice. It becomes your plan only when you pay for it.`,
      ),
    ).toBeTruthy();
    fireEvent.click(
      dialog.getByRole("button", { name: new RegExp(`start 30-day free trial with ${name}`, "i") }),
    );

    expect(store.get()).toMatchObject({ plan: "trial", trialChoice: plan.id });
    expect(navigate).toHaveBeenLastCalledWith({ to: "/setup" });
    cleanup();

    // Business / Shop Setup: the plan's version of the one page, then Activate checks the page, saves it and opens the apps.
    expect(store.get()?.setupPending).toBe(true);
    await page("setup");
    const summary = await screen.findByRole("group", { name: "Plan Usage & Summary" });
    expect(summary.textContent).toContain(plan.name);
    expect(summary.textContent).toContain(`${plan.monthlyUsd}/mo`);
    expect(summary.textContent).toContain("Free trial");
    const firstShopUsers = loginAllowance({ plan: plan.id }, { shops: 1, stores: 0, warehouses: 0 }, 0).total;
    expect(summary.textContent).toContain(`1/${firstShopUsers}`);
    // The type picker: tick Retail Shop in the list and close it.
    fireEvent.click(document.getElementById("bsetup-business-type")!);
    const picker = await screen.findByRole("dialog", { name: "Business Type" });
    fireEvent.click(within(picker).getByLabelText("Retail Shop"));
    fireEvent.click(within(picker).getByRole("button", { name: /Done/ }));
    // A one-time welcome opens first; then Activate shows its summary, and "Activate now" saves.
    const welcome = screen.queryByRole("dialog", { name: "Welcome to Business Setup" });
    if (welcome) fireEvent.click(within(welcome).getByRole("button", { name: "Let's start" }));
    fireEvent.click(screen.getByRole("button", { name: /^Activate/ }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Ready to activate?" })).getByRole("button", { name: /Activate now/ }));
    expect(navigate).toHaveBeenLastCalledWith({ to: "/apps" });
    expect(erp.load().locations.find((l) => l.id === MAIN_LOCATION)).toMatchObject({ name: "Amina Traders", code: "S001", type: "shop" });
    expect(store.get()).toMatchObject({ businessTypes: ["Retail Shop"] });
    expect(store.get()?.setupPending).toBeUndefined();
    cleanup();

    render(<SetupChecklist />);
    // Nine steps since 2026-11-23 (Bring your data from another system, Finish Ready to sell).
    expect(screen.getByText("1/9 done")).toBeTruthy();
  });

  it("states the plan's location-based maximum", () => {
    const [places, people] = planAllowanceLines(plan);
    const most = loginAllowance({ plan: plan.id }, { shops: plan.locations, stores: 0, warehouses: 0 }, plan.maxManagers).total;
    expect(places).toContain(`Up to ${most} Users`);
    expect(people).toContain("1 Owner");
    expect(places).not.toContain("+");
  });
});

describe("the plans page wording", () => {
  it("says what Buy does: it opens the payment step and changes nothing until confirmed", async () => {
    await page("plans");
    fireEvent.click(screen.getByRole("button", { name: /buy growth/i }));
    expect(screen.getByRole("heading", { name: "Buy Growth" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Activate Growth" })).toBeTruthy();
    expect(store.get()?.plan).toBeUndefined();
  });

  it("shows the trial terms before anything is chosen, and explains the limits", async () => {
    await page("plans");
    expect(screen.getByText(/no payment details needed/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "How limits work" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText(/every shop or warehouse uses one location allowance/i)).toBeTruthy();
    expect(dialog.getByText(/one pool of logins/i)).toBeTruthy();
    expect(dialog.getByText(/cashiers and devices have no separate limit/i)).toBeTruthy();
  });

  it("a warehouse takes a location place, as the page says", () => {
    const s = erp.empty();
    s.locations = [{ id: "w", name: "Store", code: "W", type: "warehouse", createdAt: 1 }];
    store.update({ plan: "basic" });
    expect(locationUsage(s)).toMatchObject({ active: 2, max: 1, over: 1 });
  });

  it("is translated in every language", () => {
    const strings = [
      ...PLANS.flatMap(planAllowanceLines),
      ...PLANS.map(planEmployeeRule),
      "How limits work",
      "Set up your first shop",
      "Add your products",
    ];
    for (const lang of LANGS.filter((l) => l !== "English"))
      for (const text of strings)
        expect(translateText(lang, text), `${lang}: ${text}`).not.toBe(text);
  });
});

describe("the setup list", () => {
  it("reads real records, and counts settings as done once opened", () => {
    const s = erp.empty();
    expect(setupSteps(s, []).filter((x) => x.done)).toEqual([]);
    s.products = [{ id: "p" } as erp.ErpState["products"][number]];
    s.movements = [{ id: "m" } as erp.ErpState["movements"][number]];
    expect(
      setupSteps(s, ["payments"])
        .filter((x) => x.done)
        .map((x) => x.id),
    ).toEqual(["products", "stock", "payments"]);
  });

  it("lists a test sale and inviting staff, done from real records", () => {
    const s = erp.empty();
    const ids = () => setupSteps(s, []).filter((x) => x.done).map((x) => x.id);
    expect(setupSteps(s, []).map((x) => x.id)).toEqual(expect.arrayContaining(["sale", "staff"]));
    s.employees = [{ id: "e" } as erp.ErpState["employees"][number]];
    expect(ids()).toEqual(["staff"]);
    s.sales = [{ id: "s" } as erp.ErpState["sales"][number]];
    expect(ids()).toEqual(["sale", "staff"]);
  });

  it("marks payment methods when opened, and stays hidden once hidden", () => {
    render(<SetupChecklist />);
    fireEvent.click(screen.getByRole("button", { name: /set up your shop/i }));
    fireEvent.click(screen.getByText("Check payment methods"));
    expect(readSetupMarks().seen).toEqual(["payments"]);
    fireEvent.click(screen.getByRole("button", { name: "Hide this list" }));
    expect(screen.queryByText("Set up your shop")).toBeNull();
    expect(readSetupMarks().hidden).toBe(true);
  });

  it("never appears for a shop that is already selling or for an employee", () => {
    const selling = erp.empty();
    selling.sales = [{ id: "s" } as erp.ErpState["sales"][number]];
    expect(setupListShown(selling, { seen: [], hidden: false })).toBe(false);
    store.update({
      staff: {
        memberId: "m",
        fullName: "S",
        role: "staff",
        permissions: [],
        businesses: [],
        locations: [],
      },
    });
    render(<SetupChecklist />);
    expect(screen.queryByText("Set up your shop")).toBeNull();
  });
});
