// Multi-business foundation hardening: per-business payment settings, reference numbers, payroll drafts, backups, the app registry,
// English capitalisation, and employees' business scope. The real engine and storage.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import { createBusiness, openBusiness } from "@/lib/businesses";
import { businessTypesForFamily } from "@/lib/industry-config";
import { scopeToBusiness } from "@/lib/shop-scope";
import { savePayrollDraft } from "@/lib/people";
import { backupJson, restoreJson, snapshot } from "@/lib/backup";
import { readSettings, saveSettings } from "@/lib/settings-config";
import { APPS_PER_ROW, launcherFor, launcherRows } from "@/lib/app-registry";
import { translateText } from "@/lib/interface-translations";
import { filterForStaff, moduleKey, NO_BUSINESS, staffScope, type BusinessMembership } from "@/lib/staff-access";
import { buildStaffChange } from "@/lib/staff-record";
import { store, type Account } from "@/lib/shopbook";

const typeOf = (industry: string, n = 0) => businessTypesForFamily(industry as never)[n]!.name;
const owner = (extra: object = {}) => localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Duka Kuu", email: "o@x.co", currency: "KSH", country: "KEN", password: "x", plan: "business", businessTypes: [typeOf("trade")], industryFamilyId: "trade", trialStart: Date.now(), ...extra }));
const uganda = { name: "Kampala Cafe", industryFamilyId: "hospitality", businessType: typeOf("hospitality"), phone: "+256700000001", country: "UGA", currency: "UGX" };
const shopOf = (b: string) => erp.load().locations.find((l) => l.businessId === b)!;
const sell = (productId: string, qty = 1) => { const price = erp.load().products.find((p) => p.id === productId)!.sell; return erp.confirmSale({ cart: [{ productId, qty }], discount: 0, pay: { cash: price * qty, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" }); };

beforeEach(() => { localStorage.clear(); owner(); });

describe("payment methods belong to their business", () => {
  it("a new business in another country starts with Mobile Money; the first business keeps M-Pesa", () => {
    const b = createBusiness(uganda, { name: "Cafe Shop", type: "shop" });
    const s = erp.load();
    expect(erp.paymentMethods(scopeToBusiness(s, b.id)).map((m) => m.name)).toEqual(["Cash", "Mobile Money", "Bank"]);
    expect(erp.paymentMethods(scopeToBusiness(s, erp.MAIN_BUSINESS)).map((m) => m.name)).toEqual(["Cash", "M-Pesa", "Bank"]);
    expect(erp.paymentMethods(scopeToBusiness(s, b.id))[1]!.id).toBe("mpesa"); // pay records keep the same key
  });
  it("renaming, adding and disabling in one business never changes another's", () => {
    fin.renameMoneyAccount("cash", "Till");
    const b = createBusiness(uganda, { name: "Cafe Shop", type: "shop" });
    openBusiness(erp.load(), b.id);
    expect(erp.paymentMethods(scopeToBusiness(erp.load(), b.id))[0]!.name).toBe("Cash"); // not the first business's "Till"
    fin.renameMoneyAccount("cash", "Cash Box");
    const evc = fin.addMoneyAccount("Airtel Money", "mobile");
    fin.setMoneyAccountActive("bank", false);
    const s = erp.load();
    expect(s.businesses.find((x) => x.id === b.id)!.paymentSettings).toMatchObject({ cash: { name: "Cash Box" }, bank: { active: false } });
    expect(erp.paymentMethods(scopeToBusiness(s, b.id)).map((m) => [m.name, m.active])).toEqual([["Cash Box", true], ["Mobile Money", true], ["Bank", false], ["Airtel Money", true]]);
    expect(erp.paymentMethods(scopeToBusiness(s, erp.MAIN_BUSINESS)).map((m) => [m.name, m.active])).toEqual([["Till", true], ["M-Pesa", true], ["Bank", true]]);
    expect(s.moneyAccounts.find((a) => a.id === evc.id)).toMatchObject({ businessId: b.id });
    expect(s.moneyAccounts.filter((a) => a.id === "cash")).toEqual([expect.objectContaining({ name: "Till" })]); // the first business's row only
  });
  it("a sale can't be paid into another business's method or a method its business disabled", () => {
    const mine = fin.addMoneyAccount("Card", "card");
    const p = erp.addProduct({ name: "Cable", buy: 50, sell: 100, qty: 10 });
    const b = createBusiness(uganda, { name: "Cafe Shop", type: "shop" });
    openBusiness(erp.load(), b.id);
    const tea = erp.addProduct({ name: "Tea", buy: 10, sell: 30, qty: 10 });
    expect(() => erp.confirmSale({ cart: [{ productId: tea.id, qty: 1 }], discount: 0, pay: { cash: 0, mpesa: 0, bank: 0, credit: 0, [mine.id]: 30 }, channel: "POS" })).toThrow("Unknown payment method");
    fin.setMoneyAccountActive("bank", false);
    expect(() => erp.confirmSale({ cart: [{ productId: tea.id, qty: 1 }], discount: 0, pay: { cash: 0, mpesa: 0, bank: 30, credit: 0 }, channel: "POS" })).toThrow(/no longer in use/);
    openBusiness(erp.load(), erp.MAIN_BUSINESS);
    expect(() => sell(p.id)).not.toThrow(); // the first business still takes bank and its own Card
  });
});

describe("reference numbers", () => {
  it("the first business keeps its numbers; another business counts on its own with its code, so numbers never repeat across businesses", () => {
    const p = erp.addProduct({ name: "Cable", buy: 50, sell: 100, qty: 10 });
    const first = sell(p.id);
    expect(first.ref).toMatch(/^[A-Z]+-000001$/);
    const b = createBusiness(uganda, { name: "Cafe Shop", type: "shop" });
    expect(erp.load().businesses[0]!.code).toBe("B2");
    openBusiness(erp.load(), b.id);
    const tea = erp.addProduct({ name: "Tea", buy: 10, sell: 30, qty: 10 });
    const one = sell(tea.id), two = sell(tea.id);
    expect([one.ref, two.ref]).toEqual([`B2-${first.ref.replace(/-\d+$/, "")}-000001`, `B2-${first.ref.replace(/-\d+$/, "")}-000002`]);
    openBusiness(erp.load(), erp.MAIN_BUSINESS);
    expect(sell(p.id).ref).toBe(first.ref.replace(/000001$/, "000002")); // the first business continues where it was
    const refs = erp.load().sales.map((x) => x.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe("payroll drafts", () => {
  const employee = () => erp.addEmployee({ name: "Amina", role: "Seller", comp: "salary", salary: 30000, rule: { kind: "percent", value: 0, paidOnly: false } });
  it("belong to their employee's business, stay there when edited, and never show in another business", () => {
    const b = createBusiness(uganda, { name: "Cafe Shop", type: "shop" });
    const mainPerson = employee();
    openBusiness(erp.load(), b.id);
    const cafePerson = employee();
    const d = savePayrollDraft({ employeeId: cafePerson.id, from: 1, to: 2, deductions: 0 });
    expect(d.businessId).toBe(b.id);
    savePayrollDraft({ employeeId: cafePerson.id, from: 1, to: 3, deductions: 5 }, d.id);
    expect(erp.load().payrollDrafts.find((x) => x.id === d.id)).toMatchObject({ businessId: b.id, to: 3 });
    expect(() => savePayrollDraft({ employeeId: mainPerson.id, from: 1, to: 2, deductions: 0 })).toThrow("Choose a valid employee and period");
    const s = erp.load();
    expect(scopeToBusiness(s, b.id).payrollDrafts.map((x) => x.id)).toEqual([d.id]);
    expect(scopeToBusiness(s, erp.MAIN_BUSINESS).payrollDrafts).toEqual([]);
  });
});

describe("backups hold every business", () => {
  it("restore brings back each business's settings and the business that was open; a version 2 file still restores", () => {
    saveSettings({ taxPin: "MAIN" });
    const b = createBusiness(uganda, { name: "Cafe Shop", type: "shop" });
    openBusiness(erp.load(), b.id);
    saveSettings({ taxPin: "CAFE" });
    const file = backupJson("Duka Kuu");
    expect(snapshot("x")).toMatchObject({ version: 3, activeBusiness: b.id, businessSettings: { [b.id]: expect.stringContaining("CAFE") } });

    localStorage.removeItem(`shopbook.settings@${b.id}`);
    openBusiness(erp.load(), erp.MAIN_BUSINESS);
    restoreJson(file);
    expect(erp.activeBusiness(erp.load())).toBe(b.id);
    expect(readSettings().taxPin).toBe("CAFE");
    expect(erp.load().businesses.map((x) => x.id)).toEqual([b.id]);

    const old = JSON.parse(file);
    delete old.businessSettings; delete old.activeBusiness; old.version = 2;
    old.data.businesses = [];
    restoreJson(JSON.stringify(old));
    expect(erp.activeBusiness(erp.load())).toBe(erp.MAIN_BUSINESS); // the open business is not in the restored records
    expect(() => restoreJson(JSON.stringify({ ...JSON.parse(file), businessSettings: { [b.id]: "not json" } }))).toThrow("Backup settings are damaged");
  });
});

describe("the application registry", () => {
  const acct = (extra: Partial<Account> = {}) => ({ ...store.get()!, ...extra }) as Account;
  it("a Trade business keeps all 13 apps, four to a row", () => {
    const l = launcherFor({ industryFamilyId: "trade", businessType: typeOf("trade"), account: acct() });
    expect([...l.apps.map((a) => a.id), l.settings?.id]).toEqual(["dashboard", "inventory", "purchases", "sales", "pos", "expenses", "contacts", "float", "accounting", "payroll", "reports", "summary", "settings"]);
    expect(l.planned).toEqual([]);
    expect(APPS_PER_ROW).toBe(4);
    expect(launcherRows(l)).toBe(4); // 12 apps in three rows of four, then Settings
  });
  it("another industry gets its business type's own requirements, never the Trade selling apps", () => {
    const l = launcherFor({ industryFamilyId: "healthcare", businessType: "Medical Clinic", account: acct() });
    expect(l.typeSpecific).toBe(true);
    // Shared business apps, plus stock for medical supplies; no retail Sales or POS.
    expect(l.apps.map((a) => a.id)).toEqual(["dashboard", "inventory", "purchases", "expenses", "contacts", "float", "accounting", "payroll", "reports", "summary"]);
    expect(l.planned.map((p) => p.id)).toEqual(["patients", "appointments", "clinical", "patientBilling"]);
    for (const trade of ["sales", "pos"]) expect(l.apps.map((a) => a.id)).not.toContain(trade);
  });
  it("an account saved before industries existed is a Trade business; a plan or a login can still narrow what shows", () => {
    expect(launcherFor({ account: acct() }).apps).toHaveLength(12);
    expect(launcherFor({ industryFamilyId: "trade", account: acct({ plan: "basic" }) }).locked.has("payroll")).toBe(true);
    const staff = acct({ staff: { memberId: "m", fullName: "A", role: "shopkeeper", permissions: [moduleKey("sales", "view"), moduleKey("pos", "view")], businesses: [], locations: [] } as Account["staff"] });
    expect(launcherFor({ industryFamilyId: "trade", account: staff }).apps.map((a) => a.id)).toEqual(["sales", "pos"]);
    expect(launcherFor({ industryFamilyId: "trade", account: acct(), hiddenApps: ["float"] }).apps.map((a) => a.id)).not.toContain("float");
  });
});

describe("English keeps the capitalisation the screen wrote", () => {
  it("doesn't take a dictionary row's capitalisation in English, and still translates any capitalisation elsewhere", () => {
    expect(translateText("English", "Low Stock")).toBe("Low Stock");
    expect(translateText("English", "Business name")).toBe("Business name");
    expect(translateText("English", "RETURN")).toBe("RETURN");
    expect(translateText("Swahili", "Low Stock")).toBe(translateText("Swahili", "Low stock"));
    expect(translateText("Swahili", "Low Stock")).not.toBe("Low Stock");
    expect(translateText("English", "Not enough stock for Tea (available 2)")).toBe("Not enough stock for Tea (available 2)");
  });
});

describe("an employee's business scope", () => {
  const seat = { role: "shopkeeper", permissions: ["module.sales.view", "sales.process"], locations: [{ id: "srv-l1", erpRef: "loc-main" }] };
  const memberships: BusinessMembership[] = [
    { id: "srv-b1", erpRef: "biz-main", name: "Duka", role: "shopkeeper", permissions: ["module.sales.view", "sales.process"], locations: [{ id: "srv-l1", erpRef: "loc-main" }] },
    { id: "srv-b2", erpRef: "cafe123456", name: "Cafe", role: "manager", permissions: ["module.inventory.view"], locations: [{ id: "srv-l2", erpRef: "cafeshop01" }] },
  ];
  it("without memberships (0020 not applied) works exactly as before", () => {
    expect(staffScope(seat, null, { location: "srv-l1" })).toEqual({ business: undefined, role: "shopkeeper", permissions: seat.permissions, locationRefs: ["loc-main"], activeRef: "loc-main", shop: "loc-main" });
  });
  it("with memberships uses only the chosen business's role, permissions and locations", () => {
    expect(staffScope(seat, memberships, { business: "cafe123456" })).toMatchObject({ business: "cafe123456", role: "manager", permissions: ["module.inventory.view"], locationRefs: ["cafeshop01"], shop: "cafeshop01" });
    expect(staffScope(seat, memberships, { location: "srv-l2" }).business).toBe("cafe123456");
    expect(staffScope(seat, memberships, {}).business).toBe("biz-main");
    expect(staffScope(seat, [], {})).toMatchObject({ business: NO_BUSINESS, permissions: [], shop: undefined });
    expect(staffScope(seat, memberships, { business: "notmine1234" }).business).toBe("biz-main"); // only a business the login holds
  });
  it("the server's copy holds only the chosen business, and nothing for a login with no business", () => {
    const p = erp.addProduct({ name: "Cable", buy: 50, sell: 100, qty: 10 });
    sell(p.id);
    const b = createBusiness(uganda, { name: "Cafe Shop", type: "shop" });
    openBusiness(erp.load(), b.id);
    const tea = erp.addProduct({ name: "Tea", buy: 10, sell: 30, qty: 10 });
    sell(tea.id);
    const s = erp.load(), view = ["sales", "inventory"].map((m) => moduleKey(m, "view"));
    expect(filterForStaff(s, { permissions: view, locationRefs: [], role: "manager", business: b.id }).products.map((x) => x.name)).toEqual(["Tea"]);
    expect(filterForStaff(s, { permissions: view, locationRefs: [], role: "manager", business: NO_BUSINESS }).products).toEqual([]);
  });
  it("an employee's sale worked out on the server belongs to the business of their shop", () => {
    const b = createBusiness(uganda, { name: "Cafe Shop", type: "shop" });
    openBusiness(erp.load(), b.id);
    const tea = erp.addProduct({ name: "Tea", buy: 10, sell: 30, qty: 10 });
    openBusiness(erp.load(), erp.MAIN_BUSINESS);
    const change = buildStaffChange(erp.load(), "00000000-0000-4000-8000-000000000099", { type: "sale", at: Date.now(), input: { cart: [{ productId: tea.id, qty: 1 }], discount: 0, pay: { cash: 30, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" } }, { shop: shopOf(b.id).id, user: "Amina" });
    const sale = change.changes.find((c) => c.collection === "sales")?.after as erp.Sale | undefined;
    expect(change.refused).toBeNull();
    expect(sale).toMatchObject({ businessId: b.id, locationId: shopOf(b.id).id });
  });
});
