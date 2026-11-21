// The free trial asks for a plan first, the plan chosen never opens or charges anything, and people are told what a smaller plan leaves out.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrialEndingNotice } from "@/components/shopbook/plan-loss";
import { appsLostOn, appsNotIn, store, type Account } from "@/lib/shopbook";
import { translateText } from "@/lib/interface-translations";
import { LANGS } from "@/lib/i18n";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => navigate,
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

const DAY = 86400000;
const account = (extra: Partial<Account> = {}): Account => ({
  shopName: "Amina",
  email: "a@b.c",
  currency: "KES",
  password: "x",
  ...extra,
});
const names = (apps: { id: string }[]) => apps.map((a) => a.id);

async function openPlans() {
  const { Route } = await import("@/routes/plans");
  const Plans = (Route as unknown as { options: { component: ComponentType } }).options.component;
  render(<Plans />);
}
const trialButton = () => screen.getByRole("button", { name: /free trial/i });

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
});
afterEach(cleanup);

describe("what a plan leaves out", () => {
  it("follows each app's tier", () => {
    expect(names(appsNotIn("basic"))).toEqual([
      "contacts",
      "float",
      "accounting",
      "payroll",
      "reports",
      "summary",
    ]);
    expect(names(appsNotIn("growth"))).toEqual(["payroll", "summary"]);
    expect(appsNotIn("business")).toEqual([]);
  });
  it("counts only what the account has had", () => {
    expect(names(appsLostOn(account({ plan: "trial" }), "growth"))).toEqual(["payroll", "summary"]);
    expect(names(appsLostOn(account({ plan: "growth" }), "basic"))).toEqual([
      "contacts",
      "float",
      "accounting",
      "reports",
    ]);
    expect(appsLostOn(account({ plan: "basic" }), "growth")).toEqual([]);
    expect(appsLostOn(account(), "basic")).toEqual([]);
  });
});

describe("starting the free trial", () => {
  beforeEach(() => store.save(account()));

  it("with no plan selected asks for one and starts nothing", async () => {
    await openPlans();
    fireEvent.click(trialButton());
    expect(screen.getByRole("alert").textContent).toMatch(/select one of these plans/i);
    expect(store.get()?.plan).toBeUndefined();
    expect(store.get()?.trialStart).toBeUndefined();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("clicking a card selects it and stays on the page", async () => {
    await openPlans();
    fireEvent.click(screen.getByText("Small business"));
    expect(screen.getByRole("img", { name: "Selected" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /^buy /i })).toBeNull();
    expect(trialButton().textContent).toContain("Start 30-day free trial with Basic");
  });

  it("tells them what they lose, then keeps full access and only remembers the plan", async () => {
    await openPlans();
    fireEvent.click(screen.getByText("Small business"));
    fireEvent.click(trialButton());
    const dialog = within(screen.getByRole("dialog"));
    for (const app of ["Contacts", "Float", "Accounting", "Reports", "Payroll", "Summary"])
      expect(dialog.getByText(app)).toBeTruthy();
    expect(store.get()?.plan).toBeUndefined();
    fireEvent.click(dialog.getByRole("button", { name: /start 30-day free trial with basic/i }));
    expect(store.get()).toMatchObject({ plan: "trial", trialChoice: "basic" });
    expect(navigate).toHaveBeenCalledWith({ to: "/setup" });
  });

  it("Buy goes to the payment page, which warns someone on the trial", async () => {
    store.save(account({ plan: "trial", trialStart: Date.now() }));
    await openPlans();
    fireEvent.click(screen.getByRole("button", { name: /buy basic/i }));
    expect(screen.getByRole("heading", { name: "Buy Basic" })).toBeTruthy();
    expect(screen.getByText("Payroll")).toBeTruthy();
    expect(store.get()?.plan).toBe("trial");
  });

  it("brings back the plan chosen earlier and never restarts the clock", async () => {
    const trialStart = Date.now() - 5 * DAY;
    store.save(account({ plan: "trial", trialStart, trialChoice: "growth" }));
    await openPlans();
    fireEvent.click(trialButton());
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /continue free trial with growth/i,
      }),
    );
    expect(store.get()).toMatchObject({ trialStart, trialChoice: "growth" });
    expect(navigate).toHaveBeenCalledWith({ to: "/apps" });
  });

  it("after the trial has ended starts nothing, selected or not", async () => {
    const trialStart = Date.now() - 31 * DAY;
    store.save(account({ plan: "trial", trialStart }));
    await openPlans();
    fireEvent.click(trialButton());
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(store.get()?.trialStart).toBe(trialStart);
  });
});

describe("the warning before the trial ends", () => {
  const onTrial = (extra: Partial<Account> = {}) =>
    store.save(account({ plan: "trial", trialStart: Date.now(), trialChoice: "basic", ...extra }));

  it("shows the chosen plan's losses in the last days", () => {
    onTrial();
    render(<TrialEndingNotice days={3} />);
    expect(within(screen.getByRole("dialog")).getByText("Payroll")).toBeTruthy();
  });
  it("shows once a day", () => {
    onTrial();
    render(<TrialEndingNotice days={3} />);
    cleanup();
    render(<TrialEndingNotice days={3} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("waits until the last seven days and has nothing to say once ended", () => {
    onTrial();
    render(<TrialEndingNotice days={8} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    render(<TrialEndingNotice days={0} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("isn't shown to employees", () => {
    onTrial({
      staff: {
        memberId: "m",
        fullName: "S",
        role: "cashier",
        permissions: [],
        businesses: [],
        locations: [],
      },
    });
    render(<TrialEndingNotice days={3} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("someone with no saved choice sees both smaller plans", () => {
    onTrial({ trialChoice: undefined });
    render(<TrialEndingNotice days={3} />);
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Basic does not include:")).toBeTruthy();
    expect(dialog.getByText("Growth does not include:")).toBeTruthy();
  });
});

describe("the new wording", () => {
  it("is translated in every language, placeholders kept", () => {
    for (const lang of LANGS.filter((l) => l !== "English")) {
      expect(translateText(lang, "{x} is not included in {plan}.", "Payroll")).toContain("{plan}");
      expect(translateText(lang, "{x} is not included in {plan}.", "Payroll")).toContain("Payroll");
      expect(translateText(lang, "Start 30-day free trial with {x}", "Basic")).toContain("Basic");
      expect(translateText(lang, "Your free trial has ended.")).not.toBe(
        "Your free trial has ended.",
      );
    }
  });
});
