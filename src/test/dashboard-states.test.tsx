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
    await waitFor(() => expect(screen.getByText("No transactions yet", { exact: false })).toBeTruthy());
    expect(screen.queryByText("Sales vs Purchases")).toBeNull();
    expect(screen.queryByText("Money In vs Out")).toBeNull();
    expect(screen.queryByText("Loading records…")).toBeNull();
  });

  it("shows the four attention cards in order, inside the row", async () => {
    account();
    localStorage.setItem("shopbook.erp", "{}");
    const { container } = render(<Dashboard />);
    await waitFor(() => expect(container.querySelector(".dash-needs-row .dash-attention")).toBeTruthy());
    const labels = [...container.querySelectorAll(".dash-att-text > span")].map((x) => x.textContent);
    expect(labels).toEqual(["Low Stock", "Payables", "Receivables", "Approvals"]);
  });

  it("an employee waiting for their first copy sees loading, not zero activity", async () => {
    account({ staff: { memberId: "m", fullName: "Sam", role: "cashier", permissions: [], businesses: [], locations: [] } });
    render(<Dashboard />);
    // Other status messages (connection, sync) can be on the page too.
    await waitFor(() => expect(screen.getAllByRole("status").some((x) => x.textContent === "Loading records…")).toBe(true));
  });

  // The trend charts left the Dashboard (owner, 2026-11); a broken chart library must still not stop the page.
  it("a chart library that fails doesn't stop the page", async () => {
    account();
    localStorage.setItem("shopbook.erp", "{}");
    chart.fail = true;
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText("No transactions yet", { exact: false })).toBeTruthy());
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
