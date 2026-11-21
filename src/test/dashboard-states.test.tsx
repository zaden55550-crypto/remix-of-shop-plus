import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useMemo } from "react";

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
const chart = vi.hoisted(() => ({ fail: false }));
vi.mock("recharts", async (original) => {
  const real = await original<typeof import("recharts")>();
  return {
    ...real,
    PieChart: (props: object) => {
      useMemo(() => { if (chart.fail) throw new Error("bad data"); }, []);
      return <real.PieChart {...props} />;
    },
  };
});

import Dashboard from "@/routes/dashboard";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const account = (extra: object = {}) => {
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Test", email: "t@e.com", phone: "", currency: "KSh", password: "", plan: "business", ...extra }));
  localStorage.setItem("shopbook.session", "1");
};

describe("Dashboard states", () => {
  beforeEach(() => {
    localStorage.clear();
    chart.fail = false;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("an empty shop says there is no activity, without the removed trend charts", async () => {
    account();
    localStorage.setItem("shopbook.erp", "{}");
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("No sales recorded yet")).toBeTruthy());
    expect(screen.queryByText("Sales vs Purchases")).toBeNull();
    expect(screen.queryByText("Money In vs Out")).toBeNull();
    expect(screen.queryByText("Loading records…")).toBeNull();
  });

  it("shows the four attention cards in order, inside the row", async () => {
    account();
    localStorage.setItem("shopbook.erp", "{}");
    const { container } = render(<Dashboard />);
    await waitFor(() => expect(container.querySelector(".dash-grid .dash-area-att .dash-attention")).toBeTruthy());
    const labels = [...container.querySelectorAll(".dash-att-text > span")].map((x) => x.textContent);
    expect(labels).toEqual(["Low Stock", "Receivables", "Payables", "Approvals"]);
  });

  it("an employee waiting for their first copy sees loading, not zero activity", async () => {
    account({ staff: { memberId: "m", fullName: "Sam", role: "cashier", permissions: [], businesses: [], locations: [] } });
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Loading records…"));
  });

  it("a chart that fails to draw says so and the rest of the page stays", async () => {
    account();
    localStorage.setItem("shopbook.erp", "{}");
    chart.fail = true;
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("could not be drawn"));
    expect(screen.getByText("No sales recorded yet")).toBeTruthy();
  });

  it("keeps receivables apart from the working balance, labelled", async () => {
    account();
    localStorage.setItem("shopbook.erp", "{}");
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("Owed by customers, not included")).toBeTruthy());
    expect(screen.queryByText("Credit", { selector: ".dash-wb-row span" })).toBeNull();
    expect(screen.getByText("At cost")).toBeTruthy();
    expect(screen.getByText("After expenses")).toBeTruthy();
  });
});
