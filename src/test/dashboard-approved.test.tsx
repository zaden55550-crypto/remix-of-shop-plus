import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { empty, type ErpState } from "@/lib/erp";
import { RecentTransactions, AnnouncementTicker, staffActivity, TX_LIMIT } from "@/components/shopbook/dash-extras";
import { filterForStaff } from "@/lib/staff-access";
import { cachedAnnouncements, refreshAnnouncements } from "@/lib/announcements";

vi.mock("@tanstack/react-router", () => ({ Link: ({ children, to, ...props }: React.PropsWithChildren<{ to: string }> & React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={to} {...props}>{children}</a> }));
vi.mock("@/lib/announcements", () => ({
  cachedAnnouncements: vi.fn(() => ({ list: [{ id: "a", message: "First" }, { id: "b", message: "Second" }] })),
  refreshAnnouncements: vi.fn(async () => ({ list: [{ id: "a", message: "First" }, { id: "b", message: "Second" }] })),
  visibleAnnouncements: (list: unknown[]) => list,
  dismissedIds: () => [],
}));
const tr = (s: string) => s;

describe("approved dashboard interactions", () => {
  it("orders mixed records newest first in one table and filters by tab", () => {
    const s = empty();
    s.sales = [{ id: "s1", ref: "SALE-1", at: 7, customerId: "", total: 12, pay: { cash: 12, mpesa: 0, bank: 0, credit: 0 } }] as ErpState["sales"];
    s.purchases = [{ id: "p1", ref: "PUR-1", at: 8, supplierId: "", user: "Test", total: 10, items: [], pay: { cash: 10, mpesa: 0, bank: 0, credit: 0 } }] as ErpState["purchases"];
    const moves = [9, 6, 5, 4, 3, 2, 1, 0, -1, -2, -3, -4, -5].map((at) => ({ id: `${at}`, ref: `MOVE-${at}`, at, kind: "CASH IN", amount: at, method: "cash" }));
    render(<RecentTransactions s={s} moves={moves} cur="KSh" tr={tr} shop="Test" staff={false} summary={() => ""} onSale={() => {}} />);
    const refs = () => [...document.querySelectorAll(".dash-tx-row:not(.is-head) .dash-tx-ref")].map((x) => x.textContent);
    expect(refs().slice(0, 4)).toEqual(["MOVE-9", "PUR-1", "SALE-1", "MOVE-6"]);
    expect(refs()).toHaveLength(15);
    expect(screen.queryByText("Load More")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Sales" }));
    expect(refs()).toEqual(["SALE-1"]);
    fireEvent.click(screen.getByRole("tab", { name: "Cash Moves" }));
    expect(refs()).toHaveLength(13);
  });
  it("keeps type and payment badges, a heading row, and at most TX_LIMIT rows", () => {
    const moves = Array.from({ length: TX_LIMIT + 20 }, (_, i) => ({ id: `${i}`, ref: `M-${i}`, at: 1000 - i, kind: "CASH IN", amount: i, method: "M-Pesa" }));
    const view = render(<RecentTransactions s={empty()} moves={moves} cur="KSh" tr={tr} shop="Test" staff={false} summary={() => ""} onSale={() => {}} />);
    expect(view.container.querySelectorAll(".dash-tx-row:not(.is-head)")).toHaveLength(TX_LIMIT);
    expect(view.container.querySelector(".dash-tx-row.is-head")).toBeTruthy();
    expect(view.container.querySelector(".dash-tx-badge.is-move")).toBeTruthy();
    expect(view.container.querySelector(".dash-tx-method.is-mpesa")).toBeTruthy();
    expect(view.container.querySelector(".dash-tx-row")?.hasAttribute("data-fit-text")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    view.unmount();
  });
  it("limits staff activity to granted audit access and assigned shop", () => {
    const s = empty();
    s.audit = [
      { id: "a", at: 1, action: "SALE", detail: "private detail", user: "Alice", locationId: "loc-main" },
      { id: "b", at: 2, action: "SALE", detail: "private detail", user: "Bob", locationId: "other" },
      { id: "c", at: 3, action: "SALE", detail: "private detail", user: "Admin", locationId: "loc-main" },
    ];
    const access = { permissions: ["audit.view"], locationRefs: ["loc-main"], activeRef: "loc-main", role: "manager" };
    expect(staffActivity(filterForStaff(s, access).audit, true).map((x) => x.id)).toEqual(["a"]);
    expect(staffActivity(filterForStaff(s, { ...access, permissions: [] }).audit, true)).toEqual([]);
    expect(staffActivity(s.audit, false)).toEqual([]);
  });
  it("shows permitted real activity using the announcement arrows", async () => {
    vi.mocked(cachedAnnouncements).mockReturnValueOnce({ list: [], at: 0 });
    vi.mocked(refreshAnnouncements).mockResolvedValueOnce({ list: [], at: 0, fresh: true });
    const audit = [
      { id: "a", at: 1000, action: "SALE", detail: "private detail", user: "Alice" },
      { id: "b", at: 2000, action: "STOCK IN", detail: "private detail", user: "Bob" },
    ];
    const view = render(<AnnouncementTicker tr={tr} audit={audit} canViewActivity />);
    expect(await screen.findByText(/Bob · STOCK IN/)).toBeTruthy();
    expect(view.container.textContent).not.toContain("private detail");
    fireEvent.click(screen.getByRole("button", { name: "Next announcement" }));
    expect(screen.getByText(/Alice · SALE/)).toBeTruthy();
  });
  it("keeps announcement arrows visible but disabled without messages", async () => {
    vi.mocked(cachedAnnouncements).mockReturnValueOnce({ list: [], at: 0 });
    vi.mocked(refreshAnnouncements).mockResolvedValueOnce({ list: [], at: 0, fresh: true });
    render(<AnnouncementTicker tr={tr} />);
    await screen.findByText("No announcements right now");
    expect(screen.getByRole("button", { name: "Previous announcement" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Next announcement" })).toHaveProperty("disabled", true);
  });
  it("changes announcements only using the arrows", async () => {
    render(<AnnouncementTicker tr={tr} />);
    await screen.findByText("First");
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    const region = screen.getByRole("region", { name: "Announcement" });
    fireEvent.click(within(region).getByRole("button", { name: "Next announcement" }));
    expect(within(region).getByText("Second")).toBeTruthy();
    fireEvent.click(within(region).getByRole("button", { name: "Previous announcement" }));
    expect(within(region).getByText("First")).toBeTruthy();
  });
});
