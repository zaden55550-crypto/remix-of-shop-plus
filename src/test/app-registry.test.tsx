// The application registry (app-requirements.ts, app-registry.ts) and route protection (AppAccessGate): one entry per approved
// business type, type-specific workflows, the 13 Trade apps preserved, four tiles per row, and app URLs refused when the open
// business, the login, a hidden setting or the plan doesn't allow them.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as erp from "@/lib/erp";
import { createBusiness, openBusiness } from "@/lib/businesses";
import { BUSINESS_TYPES, INDUSTRIES } from "@/lib/industry-config";
import { IMPLEMENTED_APPS, MODULES, TYPE_REQUIREMENTS } from "@/lib/app-requirements";
import { APPS_PER_ROW, appOfPath, launcherFor, launcherRows, mayOpenPath, requirementsFor } from "@/lib/app-registry";
import { saveSettings } from "@/lib/settings-config";
import { moduleKey } from "@/lib/staff-access";
import { store, type Account } from "@/lib/shopbook";

const route = vi.hoisted(() => ({ pathname: "/pos", navigate: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => route.navigate, useLocation: () => ({ pathname: route.pathname }) }));
import { AppAccessGate, pageAllowed } from "@/components/shopbook/app-access-gate";

const TRADE = ["dashboard", "inventory", "purchases", "sales", "pos", "expenses", "contacts", "float", "accounting", "payroll", "reports", "summary", "settings"];
const SHARED = ["dashboard", "expenses", "contacts", "float", "accounting", "payroll", "reports", "summary", "settings"];
const owner = (extra: object = {}) => localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Duka Kuu", email: "o@x.co", currency: "KSH", country: "KEN", password: "x", plan: "business", businessTypes: ["Retail Shop"], industryFamilyId: "trade", trialStart: Date.now(), ...extra }));
const acct = (extra: Partial<Account> = {}) => ({ ...store.get()!, ...extra }) as Account;
const launcher = (type: string, extra: Partial<Account> = {}, hiddenApps: string[] = []) => launcherFor({ industryFamilyId: BUSINESS_TYPES.find((t) => t.name === type)!.familyId, businessType: type, account: acct(extra), hiddenApps });
const modules = (type: string) => requirementsFor(BUSINESS_TYPES.find((t) => t.name === type)!.familyId, type).modules.map((m) => m.id);
const ids = (type: string) => launcher(type).apps.map((a) => a.id);

beforeEach(() => { localStorage.clear(); owner(); localStorage.setItem("shopbook.session", "1"); route.navigate.mockClear(); route.pathname = "/pos"; });
afterEach(cleanup);

describe("business-type requirements", () => {
  it("has exactly one entry for each of the 111 approved business types, using only known apps and modules", () => {
    expect(Object.keys(TYPE_REQUIREMENTS).sort()).toEqual(BUSINESS_TYPES.map((t) => t.name).sort());
    for (const [type, need] of Object.entries(TYPE_REQUIREMENTS)) {
      for (const app of need.apps) expect(IMPLEMENTED_APPS, type).toContain(app);
      for (const m of need.modules) expect(Object.keys(MODULES), type).toContain(m);
      for (const app of ["dashboard", "accounting", "expenses", "contacts", "reports", "settings"]) expect(need.apps, `${type} reuses ${app}`).toContain(app);
    }
  });
  it("every Trade type keeps all 13 apps; no other industry gets the retail counter", () => {
    for (const t of BUSINESS_TYPES.filter((x) => x.familyId === "trade")) expect([...ids(t.name), "settings"]).toEqual(TRADE);
    for (const t of BUSINESS_TYPES.filter((x) => x.familyId !== "trade")) expect(ids(t.name), t.name).not.toContain("pos");
    // Distribution is the one non-Trade type that sells goods (no counter POS).
    expect(BUSINESS_TYPES.filter((t) => t.familyId !== "trade" && ids(t.name).includes("sales")).map((t) => t.name)).toEqual(["Distribution Business"]);
  });
  it("gives each business type its own workflows, not one list per industry", () => {
    expect(modules("Laundry & Dry Cleaning")).toEqual(["orders", "garments", "deliveries"]);
    expect(modules("Salon & Beauty")).toEqual(["appointments", "serviceMenu", "commissions", "clientProfiles"]);
    expect(modules("Repair & Maintenance Services")).toEqual(["jobCards", "diagnostics", "technicians"]);
    expect(ids("Repair & Maintenance Services")).toContain("inventory"); // parts
    expect(modules("Hotel")).toEqual(["reservations", "rooms", "housekeeping", "guestBilling", "frontDesk"]);
    expect(modules("Restaurant")).toEqual(["menu", "tables", "kitchen", "restaurantPos"]);
    expect(modules("General Manufacturing")).toEqual(["production", "bom", "workOrders", "costing", "quality"]);
    expect(modules("Hospital")).toEqual(["patients", "appointments", "clinical", "patientBilling", "labResults", "imaging"]);
    expect(modules("Secondary School")).toEqual(["students", "academics", "fees", "attendance"]);
    // Two Services types are not the same environment.
    expect(modules("Laundry & Dry Cleaning")).not.toEqual(modules("Salon & Beauty"));
    expect(ids("Laundry & Dry Cleaning")).not.toContain("inventory");
  });
  it("marks clinical, patient and student records as needing restricted access", () => {
    const privacy = (type: string) => launcher(type).planned.filter((p) => p.privacy).map((p) => p.id);
    expect(privacy("Medical Clinic")).toEqual(["patients", "clinical", "patientBilling"]);
    expect(privacy("Primary School")).toEqual(["students"]);
    expect(privacy("Laundry & Dry Cleaning")).toEqual([]);
  });
  it("lays the launcher out four tiles to a row with Settings on its own row", () => {
    expect(APPS_PER_ROW).toBe(4);
    const hotel = launcher("Hotel");
    expect(launcherRows(hotel)).toBe(Math.ceil((hotel.apps.length + hotel.planned.length) / 4) + 1);
  });
  it("falls back to the industry's approved configuration when the type isn't one of its types, and to Trade when unclassified", () => {
    expect(requirementsFor("services", "Retail Shop").typeSpecific).toBe(false);
    expect(launcherFor({ account: acct() }).apps.map((a) => a.id)).toEqual(TRADE.filter((a) => a !== "settings"));
    expect(launcherFor({ industryFamilyId: "education", account: acct() }).apps.map((a) => a.id)).toEqual(["dashboard", "expenses", "contacts", "accounting", "reports"]);
    expect(INDUSTRIES).toHaveLength(8);
  });
});

describe("route protection", () => {
  it("maps app pages to their app and leaves every other page open", () => {
    expect(appOfPath("/pos")).toBe("pos");
    expect(appOfPath("/reconciliation?x=1")).toBe("accounting");
    for (const page of ["/", "/apps", "/businesses", "/plans", "/setup", "/signup", "/invite", "/privacy", "/support-inbox"]) expect(appOfPath(page), page).toBeUndefined();
  });
  it("refuses an app the business type doesn't use, a hidden app, an app the login may not view, and a plan-locked app", () => {
    const laundry = launcher("Laundry & Dry Cleaning");
    expect(mayOpenPath("/pos", laundry)).toBe(false);
    expect(mayOpenPath("/inventory", laundry)).toBe(false);
    expect(mayOpenPath("/accounting", laundry)).toBe(true);
    expect(mayOpenPath("/reconciliation", laundry)).toBe(true);
    expect(mayOpenPath("/businesses", laundry)).toBe(true);
    expect(mayOpenPath("/float", launcher("Retail Shop", {}, ["float"]))).toBe(false);
    const cashier = launcher("Retail Shop", { staff: { memberId: "m", fullName: "A", role: "shopkeeper", permissions: [moduleKey("pos", "view")], businesses: [], locations: [] } as Account["staff"] });
    expect(mayOpenPath("/pos", cashier)).toBe(true);
    expect(mayOpenPath("/accounting", cashier)).toBe(false);
    expect(mayOpenPath("/settings", cashier)).toBe(false);
    expect(mayOpenPath("/payroll", launcher("Retail Shop", { plan: "basic" }))).toBe(false); // the plan's own rule (shopbook.ts), unchanged
  });
  it("every existing Trade page still opens for a Trade business", () => {
    for (const app of TRADE) expect(pageAllowed(`/${app}`), app).toBe(true);
    expect(pageAllowed("/reconciliation")).toBe(true);
  });
  it("the gate sends a typed URL back to the Apps launcher, and re-checks when the business is switched", () => {
    const cleaners = createBusiness({ name: "Safi Cleaners", industryFamilyId: "services", businessType: "Laundry & Dry Cleaning", phone: "+254733000333", country: "KEN", currency: "KSH" }, { name: "Safi Westlands", type: "shop" });
    render(<AppAccessGate />);
    expect(route.navigate).not.toHaveBeenCalled(); // POS is a Trade app and the Trade business is open
    act(() => { openBusiness(erp.load(), cleaners.id); });
    expect(route.navigate).toHaveBeenCalledWith({ to: "/apps", replace: true });
    route.navigate.mockClear();
    act(() => { openBusiness(erp.load(), erp.MAIN_BUSINESS); });
    expect(route.navigate).not.toHaveBeenCalled();
  });
  it("the gate refuses an app the owner hid, as soon as it is hidden", () => {
    route.pathname = "/float";
    render(<AppAccessGate />);
    expect(route.navigate).not.toHaveBeenCalled();
    act(() => { saveSettings({ hiddenApps: ["float"] }); });
    expect(route.navigate).toHaveBeenCalledWith({ to: "/apps", replace: true });
  });
  it("does nothing when nobody is signed in", () => {
    localStorage.removeItem("shopbook.session");
    route.pathname = "/payroll";
    render(<AppAccessGate />);
    expect(route.navigate).not.toHaveBeenCalled();
  });
});
