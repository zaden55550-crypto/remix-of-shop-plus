// The Businesses screen (/businesses): an owner sees their businesses with industry, type and locations, creates another
// through the form (the type list follows the industry), and opens one into its own Apps launcher.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as erp from "@/lib/erp";
import { createBusiness } from "@/lib/businesses";
import { businessTypesForFamily } from "@/lib/industry-config";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => navigate, // stable like the real hook; a new fn per render loops the account effect
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/components/shopbook/global-application-header", () => ({ GlobalApplicationHeader: ({ shop }: { shop: string }) => <div data-testid="header">{shop}</div> }));

import { Route } from "@/routes/businesses";
const Page = (Route as unknown as { options: { component: ComponentType } }).options.component;
const typeOf = (industry: string, n = 0) => businessTypesForFamily(industry as never)[n]!.name;

beforeEach(() => {
  localStorage.clear();
  navigate.mockClear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Duka Kuu", email: "o@x.co", currency: "KSH", country: "KEN", password: "x", plan: "business", businessTypes: [typeOf("trade")], industryFamilyId: "trade", trialStart: Date.now() }));
  localStorage.setItem("shopbook.session", "1");
});
afterEach(cleanup);

describe("Businesses screen", () => {
  it("lists the existing Trade business first, as the one being worked in", async () => {
    render(<Page />);
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByRole("heading").textContent).toBe("Duka Kuu");
    expect(within(rows[0]!).getByText(`Trade · ${typeOf("trade")}`)).toBeTruthy();
    expect(within(rows[0]!).getByText("Working in")).toBeTruthy();
  });

  it("creates a business from the form: only Trade can be chosen, with one or more of its types", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: /Create business/ }));
    const dialog = await screen.findByRole("dialog", { name: "Create business" });
    const industry = within(dialog).getByLabelText(/^industry$/i) as HTMLSelectElement;
    // The other seven industries are listed as Coming soon and can't be chosen yet (2026-11-20).
    const open = [...industry.options].filter((o) => o.value && !o.disabled).map((o) => o.value);
    expect(open).toEqual(["trade"]);
    expect([...industry.options].find((o) => o.value === "services")?.textContent).toMatch(/Coming soon/);
    expect((dialog.querySelector("#biz-type") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(industry, { target: { value: "trade" } });
    fireEvent.change(within(dialog).getByLabelText(/^business name$/i), { target: { value: "Safi Mart" } });
    fireEvent.click(dialog.querySelector("#biz-type")!);
    const picker = await screen.findByRole("dialog", { name: "Business Type" });
    const offered = within(picker).getAllByRole("checkbox").map((c) => c.closest("label")!.textContent);
    expect(offered).toEqual(businessTypesForFamily("trade").map((t) => t.name));
    fireEvent.click(within(picker).getByLabelText("Supermarket"));
    fireEvent.click(within(picker).getByLabelText("Butchery"));
    fireEvent.click(within(picker).getByRole("button", { name: /Done/ }));
    fireEvent.change(within(dialog).getByLabelText(/^business phone number$/i), { target: { value: "+254 733 000 333" } });
    fireEvent.change(within(dialog).getByLabelText(/^location name$/i), { target: { value: "Safi Westlands" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create business" }));
    const saved = erp.load().businesses;
    expect(saved).toEqual([expect.objectContaining({ name: "Safi Mart", industryFamilyId: "trade", businessType: "Supermarket", businessTypes: ["Supermarket", "Butchery"], country: "KEN", currency: "KSH" })]);
    expect(erp.load().locations).toEqual([expect.objectContaining({ name: "Safi Westlands", businessId: saved[0]!.id })]);
    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((r) => within(r).getByRole("heading").textContent)).toEqual(["Duka Kuu", "Safi Mart"]);
    expect(within(rows[1]!).getByText(/Safi Westlands/)).toBeTruthy();
  });

  it("refuses an incomplete form and saves nothing", async () => {
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: /Create business/ }));
    const dialog = await screen.findByRole("dialog", { name: "Create business" });
    fireEvent.change(within(dialog).getByLabelText(/^business name$/i), { target: { value: "Half Done" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create business" }));
    expect(erp.load().businesses).toEqual([]);
  });

  it("opens another business into its own Apps launcher", async () => {
    const b = createBusiness({ name: "Kahawa Cafe", industryFamilyId: "hospitality", businessType: typeOf("hospitality"), phone: "0722000222", country: "UGA", currency: "UGX" }, { name: "Cafe Shop", type: "shop" });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Open Kahawa Cafe" }));
    expect(erp.activeBusiness(erp.load())).toBe(b.id);
    expect(navigate).toHaveBeenCalledWith({ to: "/apps" });
    const rows = await screen.findAllByRole("listitem");
    expect(within(rows[1]!).getByText("Working in")).toBeTruthy();
    expect(screen.getByTestId("header").textContent).toBe("Kahawa Cafe");
  });

  it("sends an employee's login back to the Apps launcher: it has no businesses to choose", async () => {
    localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Duka Kuu", email: "", currency: "KSH", password: "", plan: "business", role: "staff", staff: { memberId: "m1", fullName: "Amina", role: "cashier", permissions: [], businesses: [], locations: [] } }));
    render(<Page />);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: "/apps", replace: true }));
    expect(screen.queryByRole("listitem")).toBeNull();
  });
});
