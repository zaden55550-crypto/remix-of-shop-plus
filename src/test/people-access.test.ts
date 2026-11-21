// People & Access. The owner's records and payroll with no login; what an employee's device may hold; invitation delivery that never pretends.
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as erp from "@/lib/erp";
import { deliverLink, providerStatus } from "@/lib/people-delivery.server";
import { employeeStatus, linkEmployeeLogin, saveEmployeeProfile, setEmployeeAssignments, setEmploymentStatus, type EmployeeProfile } from "@/lib/people";
import { PLANS } from "@/lib/shopbook";
import { allowedApps, filterForStaff, moduleKey, staffMayOpen } from "@/lib/staff-access";

const profile = (over: Partial<EmployeeProfile> = {}): EmployeeProfile => ({ name: "Amina Yusuf", phone: "0712345678", email: "", code: "", businessRefs: ["b1"], locationIds: ["loc-main"], accessRole: "shopkeeper", startDate: "2026-11-01", employmentType: "Full-time", ...over });
const owner = (extra = {}) => localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Test Shop", email: "o@x.co", currency: "KES", password: "x", plan: "growth", ...extra }));
beforeEach(() => { localStorage.clear(); owner(); });

describe("plan limits", () => {
  it("use one pool of logins per plan with separate manager caps", () => {
    expect(PLANS.map((p) => [p.id, p.locations, p.maxUsers, p.maxManagers])).toEqual([["basic", 1, 2, 0], ["growth", 5, 12, 1], ["business", 10, 24, 3]]);
  });
});

describe("employee records", () => {
  it("an employee with no login is saved, gets an ID, and is in payroll", () => {
    const e = saveEmployeeProfile(profile());
    expect(e.code).toBe("EMP-000001");
    expect(e.memberId).toBeUndefined();
    const s = erp.load();
    expect(s.employees.map((x) => x.name)).toEqual(["Amina Yusuf"]);
    expect(erp.payrollPreview(s, e.id, 0).salary).toBe(0);
    expect(s.audit[0]?.action).toBe("EMPLOYEE ADDED");
  });

  it("name, phone and business are required; IDs stay unique; the ID is editable", () => {
    expect(() => saveEmployeeProfile(profile({ name: " " }))).toThrow(/full name/);
    expect(() => saveEmployeeProfile(profile({ phone: "" }))).toThrow(/phone number/);
    expect(() => saveEmployeeProfile(profile({ phone: "12" }))).toThrow(/valid phone/);
    expect(() => saveEmployeeProfile(profile({ email: "nope" }))).toThrow(/valid email/);
    expect(() => saveEmployeeProfile(profile({ businessRefs: [] }))).toThrow(/Choose a business/);
    const a = saveEmployeeProfile(profile({ code: "A-1" }));
    expect(a.code).toBe("A-1");
    expect(() => saveEmployeeProfile(profile({ name: "B", code: "a-1" }))).toThrow(/already in use/);
    const edited = saveEmployeeProfile(profile({ name: "Amina B", code: "" }), a.id);
    expect(edited.code).toBe("A-1");
    expect(erp.load().employees).toHaveLength(1);
  });

  it("an existing payroll employee keeps pay and job title when edited here", () => {
    const e = erp.addEmployee({ name: "Peter", role: "Seller", comp: "salary", salary: 30000, rule: { kind: "none", value: 0, paidOnly: false } });
    const saved = saveEmployeeProfile(profile({ name: "Peter K" }), e.id);
    expect(saved).toMatchObject({ salary: 30000, role: "Seller", comp: "salary", name: "Peter K" });
  });

  it("several locations can be assigned and removed", () => {
    const e = saveEmployeeProfile(profile());
    expect(setEmployeeAssignments(e.id, ["b1"], ["loc-main", "loc-2"], "manager")).toMatchObject({ locationIds: ["loc-main", "loc-2"], accessRole: "manager" });
    expect(setEmployeeAssignments(e.id, ["b1"], [], "manager").locationIds).toEqual([]);
  });

  it("suspending and ending employment keep the record and its history", () => {
    const p = erp.addProduct({ name: "Sugar", buy: 50, sell: 80, qty: 10 } as Parameters<typeof erp.addProduct>[0]);
    const e = saveEmployeeProfile(profile());
    const before = erp.load().movements.length;
    setEmploymentStatus(e.id, "suspended");
    expect(employeeStatus(erp.load().employees[0]!)).toBe("Suspended");
    setEmploymentStatus(e.id, "terminated");
    const s = erp.load();
    expect(employeeStatus(s.employees[0]!)).toBe("Terminated");
    expect(s.employees[0]?.active).toBe(false);
    expect(s.movements).toHaveLength(before);
    expect(s.products.map((x) => x.id)).toContain(p.id);
    setEmploymentStatus(e.id, "active");
    expect(employeeStatus(erp.load().employees[0]!)).toBe("Active");
  });

  it("a payroll employee made before this keeps working as Active", () => {
    const e = erp.addEmployee({ name: "Old", role: "Seller", comp: "salary", salary: 10, rule: { kind: "none", value: 0, paidOnly: false } });
    expect(employeeStatus(e)).toBe("Active");
    erp.setEmployeeActive(e.id, false);
    expect(employeeStatus(erp.load().employees[0]!)).toBe("Terminated");
  });

  it("a login is linked once, and only the owner manages employees", () => {
    const e = saveEmployeeProfile(profile());
    expect(linkEmployeeLogin(e.id, "m1").memberId).toBe("m1");
    owner({ role: "staff" });
    expect(() => saveEmployeeProfile(profile({ name: "X" }))).toThrow(/Only the owner/);
    expect(() => setEmploymentStatus(e.id, "terminated")).toThrow(/Only the owner/);
  });
});

describe("an employee's device", () => {
  const records = (): Partial<erp.ErpState> => ({
    products: [{ id: "p1", name: "Sugar", buy: 50, sell: 80, qty: 10, createdAt: 1, locationId: "l1" }],
    sales: [{ id: "s1", ref: "S-1", at: 1, items: [{ productId: "p1", name: "Sugar", qty: 1, price: 80, cost: 50, returned: 0 }], total: 80, pay: { cash: 80 }, locationId: "l1" } as unknown as erp.Sale],
    purchases: [{ id: "x1", ref: "P-1", items: [{ productId: "p1", name: "Sugar", qty: 1, cost: 50, returned: 0 }], pay: { cash: 0, mpesa: 0, bank: 0, credit: 0 }, locationId: "l1" } as unknown as erp.Purchase],
    employees: [{ id: "e1", name: "Me", role: "Seller", comp: "salary", salary: 30000, rule: { kind: "none", value: 0, paidOnly: false }, active: true, createdAt: 1, locationIds: ["l1"] }, { id: "e2", name: "Boss", role: "Admin", comp: "salary", salary: 90000, rule: { kind: "none", value: 0, paidOnly: false }, active: true, createdAt: 1, locationIds: ["l1"] }],
    payments: [{ id: "pay1", locationId: "l1" } as unknown as erp.Payment],
    expenses: [{ id: "ex1", locationId: "l1" } as unknown as erp.Expense],
    locations: [{ id: "l1", name: "A", code: "A", type: "shop", createdAt: 1 }, { id: "l2", name: "B", code: "B", type: "shop", createdAt: 1 }],
    audit: [{ id: "a1", at: 1, action: "X", detail: "secret", user: "Admin", locationId: "l1" }],
    seq: { "S": 9 },
  });
  const shopkeeper = [moduleKey("sales", "view"), moduleKey("pos", "view"), moduleKey("inventory", "view")];
  const filtered = (permissions: string[]) => filterForStaff(records(), { permissions, employeeRef: "e1", locationRefs: ["l1"] });

  it("a shopkeeper gets no buying price, cost, salaries, other people, money or audit", () => {
    const s = filtered(shopkeeper), text = JSON.stringify(s);
    expect(s.products[0]).toMatchObject({ name: "Sugar", sell: 80, buy: 0 });
    expect(s.sales[0]?.items[0]?.cost).toBe(0);
    expect(text).not.toContain("30000");
    expect(text).not.toContain("90000");
    expect(text).not.toContain("Boss");
    expect(text).not.toContain("secret");
    expect(s.payments).toEqual([]);
    expect(s.expenses).toEqual([]);
    expect(s.purchases).toEqual([]);
    expect(s.employees.map((e) => e.name)).toEqual(["Me"]);
  });

  it("only their own locations come through, however many exist", () => {
    expect(filtered(shopkeeper).locations.map((l) => l.id)).toEqual(["l1"]);
    expect(filterForStaff(records(), { permissions: shopkeeper, locationRefs: [] }).locations).toEqual([]);
  });

  it("no permissions means nothing at all", () => {
    const s = filterForStaff(records(), { permissions: [], locationRefs: [] });
    expect(s.products).toEqual([]);
    expect(s.sales).toEqual([]);
    expect(s.employees).toEqual([]);
  });

  it("the owner can grant each figure separately", () => {
    expect(filtered([...shopkeeper, "products.view_buying_price"]).products[0]?.buy).toBe(50);
    const payroll = filtered([moduleKey("payroll", "view"), "salary.view"]);
    expect(payroll.employees.map((e) => e.salary)).toEqual([30000, 90000]);
    expect(filtered([moduleKey("payroll", "view")]).employees.map((e) => e.salary)).toEqual([0]);
    expect(filtered([moduleKey("float", "view"), "finance.view_balances"]).payments).toHaveLength(1);
    expect(filtered([moduleKey("purchases", "view")]).purchases[0]?.items[0]?.cost).toBe(0);
  });

  it("restricted pages stay closed, and the owner's pages are never open", () => {
    expect(allowedApps(shopkeeper)).toEqual(["inventory", "sales", "pos"]);
    for (const open of ["/", "/apps", "/invite", "/sales", "/pos", "/inventory"]) expect(staffMayOpen(open, shopkeeper)).toBe(true);
    for (const closed of ["/accounting", "/reconciliation", "/payroll", "/settings", "/plans", "/support-inbox", "/reports"]) expect(staffMayOpen(closed, shopkeeper)).toBe(false);
  });

  it("the device can't record, so a filtered copy can never overwrite real records", () => {
    owner({ staff: { memberId: "m", fullName: "A", role: "staff", permissions: [], businesses: [], locations: [] } });
    expect(() => erp.addEmployee({ name: "X", role: "S", comp: "salary", salary: 10, rule: { kind: "none", value: 0, paidOnly: false } })).toThrow(/Ask your manager/);
    expect(erp.load().employees).toEqual([]);
  });
});

describe("invitation delivery", () => {
  const contact = { name: "Amina", email: "a@x.co", phone: "+254712345678", shop: "Test Shop", kind: "invite" };
  const ok = (body: unknown = {}) => new Response(JSON.stringify(body), { status: 200 });

  it("with no provider it says so and sends nothing", async () => {
    const send = vi.fn();
    expect(providerStatus({})).toEqual({ email: false, sms: false });
    expect(await deliverLink(contact, "https://x/invite#t", {}, send as unknown as typeof fetch)).toEqual({ sent: false, via: null, error: expect.stringMatching(/No email or SMS provider/) });
    expect(send).not.toHaveBeenCalled();
  });

  it("email goes out through the provider, with the link and no password", async () => {
    const send = vi.fn(async () => ok());
    const r = await deliverLink(contact, "https://x/invite#t", { RESEND_API_KEY: "k", INVITE_EMAIL_FROM: "a@b.c" }, send as unknown as typeof fetch);
    expect(r).toEqual({ sent: true, via: "email", error: null });
    const body = JSON.parse((send.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.to).toBe("a@x.co");
    expect(body.text).toContain("https://x/invite#t");
    expect(body.text.toLowerCase()).not.toContain("password:");
  });

  it("a refused email falls back to SMS, and a full failure is reported as not sent", async () => {
    const env = { RESEND_API_KEY: "k", INVITE_EMAIL_FROM: "a@b.c", AFRICASTALKING_API_KEY: "s", AFRICASTALKING_USERNAME: "u" };
    const fallback = vi.fn(async (url: string) => (String(url).includes("resend") ? new Response("", { status: 500 }) : ok({ SMSMessageData: { Recipients: [{ status: "Success" }] } })));
    expect(await deliverLink(contact, "l", env, fallback as unknown as typeof fetch)).toMatchObject({ sent: true, via: "sms" });
    const failing = vi.fn(async () => { throw new Error("down"); });
    expect(await deliverLink(contact, "l", env, failing as unknown as typeof fetch)).toMatchObject({ sent: false, via: null, error: expect.stringContaining("SMS provider") });
  });

  it("a person with only a phone isn't emailed", async () => {
    const send = vi.fn(async () => ok());
    expect(await deliverLink({ ...contact, email: null }, "l", { RESEND_API_KEY: "k", INVITE_EMAIL_FROM: "a@b.c" }, send as unknown as typeof fetch)).toMatchObject({ sent: false });
    expect(send).not.toHaveBeenCalled();
  });
});
