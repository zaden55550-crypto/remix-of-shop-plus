import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// One navigate function for every render, like the real router. A new function per render re-runs
// useAccount's [nav] effect, which sets a fresh account and renders again: an endless loop inside render().
const navigate = vi.hoisted(() => () => {});
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: object) => options,
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => <a className={className}>{children}</a>,
  useNavigate: () => navigate,
}));
vi.mock("@/components/shopbook/global-application-header", () => ({ GlobalApplicationHeader: () => null }));
vi.mock("@/components/shopbook/setup-checklist", () => ({ SetupChecklist: () => null }));
vi.mock("@/components/shopbook/trial-banner", () => ({ TrialBanner: () => null }));
vi.mock("@/lib/fill-screen", () => ({ useScreenFit: () => {} }));
const pie = vi.hoisted(() => ({ data: [] as { amount: number }[][] }));
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div data-testid="pie">{children}</div>,
  Pie: ({ data }: { data: { amount: number }[] }) => { pie.data.push(data); return null; },
  Cell: () => null,
  Tooltip: () => null,
}));

import Dashboard from "@/routes/dashboard";
import { addProduct, confirmSale } from "@/lib/erp";

const signIn = () => {
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Test", email: "t@e.com", phone: "", currency: "KSh", password: "", plan: "business" }));
  localStorage.setItem("shopbook.session", "1");
};

describe("Sales by payment method doughnut", () => {
  afterEach(() => { cleanup(); localStorage.clear(); pie.data = []; });

  it("with no sales today: a plain ring, no shares, and the real zero total", async () => {
    signIn();
    localStorage.setItem("shopbook.erp", "{}");
    const { container } = render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("No sales today")).toBeTruthy());
    expect(container.querySelector(".dash-donut-ring")).toBeTruthy();
    expect(screen.queryByTestId("pie")).toBeNull();
    expect(pie.data).toHaveLength(0);
  });

  it("with sales: real shares only, no placeholder slices", async () => {
    signIn();
    localStorage.removeItem("shopbook.erp");
    const p = addProduct({ name: "Cable", buy: 100, sell: 200, qty: 10 });
    confirmSale({ cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: { cash: 400, mpesa: 200, bank: 0, credit: 0 }, channel: "POS" });
    const { container } = render(<Dashboard />);
    await waitFor(() => expect(screen.getByTestId("pie")).toBeTruthy());
    expect(container.querySelector(".dash-donut-ring")).toBeNull();
    expect(pie.data.at(-1)!.map((x) => x.amount)).toEqual([400, 200]);
  });
});
