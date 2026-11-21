// What an employee login may reach. The server decides (my_access, staffSnapshot); this file holds the shared
// names, and the filter that runs on the server so hidden figures never reach an employee's device.
import { empty, MAIN_BUSINESS, MAIN_LOCATION, type ErpState } from "@/lib/erp";
import { scopeToBusiness, scopeToShop } from "@/lib/shop-scope";
import { type IndustryFamilyId } from "@/lib/industry-config";

export const MODULES = [
  ["dashboard", "Dashboard"], ["inventory", "Inventory"], ["purchases", "Purchases"], ["sales", "Sales"], ["pos", "POS"], ["expenses", "Expenses"], ["contacts", "Contacts"],
  ["float", "Float"], ["accounting", "Accounting"], ["payroll", "Payroll"], ["reports", "Reports"], ["summary", "Summary"], ["settings", "Settings"],
] as const;
export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export"] as const;
export const moduleKey = (module: string, action: string) => `module.${module}.${action}`;
/** Admins and managers use the manager allowance; every other login uses a location's employee places. */
export const isManagerRole = (role?: string) => role === "admin" || role === "manager";
export const SENSITIVE = [
  ["products.view_buying_price", "View buying prices"], ["products.view_cost", "View product costs"], ["profit.view_margin", "View profit margins"], ["finance.view_balances", "View financial balances"], ["salary.view", "View payroll and salaries"],
  ["employees.manage", "Manage employees"], ["inventory.manage", "Manage inventory"], ["purchases.manage", "Manage purchases"], ["purchases.approve", "Approve purchases"], ["expenses.manage", "Manage expenses"], ["finance.manage_accounts", "Manage financial accounts"],
  ["sales.process", "Process sales"], ["sales.refund", "Issue refunds"], ["reports.manage", "Manage reports"], ["accounting.access", "Access accounting"], ["pos.manage", "Manage POS"], ["stock.transfers", "Manage stock transfers"], ["stock.view_warehouse", "View connected warehouse stock"],
] as const;
export const OWNER_ONLY = ["Change business ownership", "Manage the owner's subscription", "Grant or revoke owner privileges", "Initiate and approve transfers of money between locations"] as const;

/** Roles are trade-specific by default. Each industry adds its own staff positions, derived from the industry
 *  catalogue so a Hospitality business sees Front Desk / Housekeeping and a Healthcare business sees
 *  Clinician / Nurse, while the shared Trade roles stay available everywhere. */
export const INDUSTRY_ROLES: Record<string, readonly [string, string][]> = {
  trade: [],
  manufacturing: [["production_operator", "Production Operator"], ["quality_inspector", "Quality Inspector"], ["maintenance_tech", "Maintenance Technician"]],
  hospitality: [["front_desk", "Front Desk"], ["housekeeper", "Housekeeper"], ["concierge", "Concierge"]],
  services: [["service_tech", "Service Technician"], ["scheduler", "Scheduler"], ["cleaner", "Cleaner"]],
  "property-construction": [["property_manager", "Property Manager"], ["contractor", "Contractor"], ["facilities_tech", "Facilities Technician"]],
  logistics: [["driver", "Driver"], ["dispatch_coordinator", "Dispatch Coordinator"], ["warehouse_handler", "Warehouse Handler"]],
  education: [["teacher", "Teacher"], ["administrator", "Administrator"], ["support_staff", "Support Staff"]],
  healthcare: [["clinician", "Clinician"], ["nurse", "Nurse"], ["medical_assistant", "Medical Assistant"]],
};

/** All roles available to a business of this industry, Trade roles first, then the industry's own. */
export function rolesForIndustry(familyId: string | undefined): readonly [string, string][] {
  const extra = familyId ? INDUSTRY_ROLES[familyId] ?? [] : [];
  return [...ROLES, ...extra] as readonly [string, string][];
}

/** Whether a role is one of the industry's own staff positions (not a shared Trade role). */
export function isIndustryRole(role?: string, familyId?: string): boolean {
  if (!role || !familyId) return false;
  return (INDUSTRY_ROLES[familyId] ?? []).some(([id]) => id === role);
}
export const ROLES = [["admin", "Admin"], ["manager", "Manager"], ["shopkeeper", "Shopkeeper"], ["warehouse_staff", "Storekeeper"], ["staff", "Staff"]] as const;
export type RoleId = (typeof ROLES)[number][0];
export const roleLabel = (r?: string, familyId?: IndustryFamilyId | string | null) =>
  r === "owner" ? "Owner" : rolesForIndustry(familyId ?? undefined).find(([id]) => id === r)?.[1] ?? ROLES.find(([id]) => id === r)?.[1] ?? "Staff";

export const allowedApps = (permissions: readonly string[]) => MODULES.map(([id]) => id).filter((id) => permissions.includes(moduleKey(id, "view")));

/** Which app a page belongs to. Anything not listed is closed to an employee; the login, invitation and Apps pages are always open. */
const ALWAYS_OPEN = new Set(["", "apps", "invite"]);
const SAME_APP: Record<string, string> = { reconciliation: "accounting" };
export function staffMayOpen(path: string, permissions: readonly string[]) {
  const first = path.split("/").filter(Boolean)[0] ?? "";
  if (ALWAYS_OPEN.has(first)) return true;
  const app = SAME_APP[first] ?? first;
  return allowedApps(permissions).some((id) => id === app);
}
export const settingsForStaff = ["General", "Appearance"] as const;

const COST_KEYS = new Set(["buy", "cost", "costPrice", "buyingPrice", "unitCost", "margin", "profit"]);
const PAY_KEYS = new Set(["salary", "rule", "earned", "net", "gross", "deductions", "amount", "balance"]);
const stripKeys = <T,>(value: T, keys: Set<string>): T => {
  if (Array.isArray(value)) return value.map((v) => stripKeys(v, keys)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, keys.has(k) ? (typeof v === "number" ? 0 : undefined) : stripKeys(v, keys)])) as T;
  return value;
};

/** Matches no location, for a login with none assigned: they get no shop's records. */
const NO_SHOP = "__no_shop__";
/** A business no employee belongs to: filtering for it gives an empty copy. */
export const NO_BUSINESS = "__no_business__";

/** One business an employee may reach, from member_business_access() (proposed 0020): its own role, permissions and locations. */
export type BusinessMembership = { id: string; erpRef: string | null; name: string; currency?: string | undefined; role: string; permissions: string[]; locations: { id: string; name?: string | undefined; kind?: string | undefined; erpRef: string | null }[] };
export type StaffScope = { business: string | undefined; role: string; permissions: string[]; locationRefs: (string | null)[]; activeRef: string | null | undefined; shop: string | undefined };
/** What an employee works with now. With memberships (0020), one business at a time: the one asked for, else the one holding the location asked for,
 *  else their first; its own role, permissions and locations only. Without them (0020 not applied), exactly as before: the seat's one set. */
export function staffScope(seat: { role: string; permissions: readonly string[]; locations: readonly { id: string; erpRef?: string | null | undefined }[] }, memberships: readonly BusinessMembership[] | null, want: { location?: string | undefined; business?: string | undefined } = {}): StaffScope {
  if (!memberships) {
    const active = seat.locations.find((l) => l.id === want.location)?.erpRef;
    const refs = seat.locations.map((l) => l.erpRef ?? null);
    const first = active ?? refs.find(Boolean) ?? undefined;
    return { business: undefined, role: seat.role, permissions: [...seat.permissions], locationRefs: refs, activeRef: active, shop: first ?? (isManagerRole(seat.role) ? "loc-main" : undefined) };
  }
  const pick = memberships.find((m) => want.business && m.erpRef === want.business) ?? memberships.find((m) => want.location && m.locations.some((l) => l.id === want.location)) ?? memberships[0];
  if (!pick || !pick.erpRef) return { business: NO_BUSINESS, role: seat.role, permissions: [], locationRefs: [], activeRef: undefined, shop: undefined };
  const active = pick.locations.find((l) => l.id === want.location)?.erpRef;
  const refs = pick.locations.map((l) => l.erpRef);
  const first = active ?? refs.find(Boolean) ?? undefined;
  return { business: pick.erpRef, role: pick.role, permissions: [...pick.permissions], locationRefs: refs, activeRef: active, shop: first ?? (isManagerRole(pick.role) && pick.erpRef === MAIN_BUSINESS ? MAIN_LOCATION : undefined) };
}

/** The business a location belongs to in the owner's records. The built-in main shop, and anything untagged, is the first business's. */
function businessOfLocation(s: ErpState, ref: string) {
  return ref === MAIN_LOCATION ? MAIN_BUSINESS : s.locations.find((l) => l.id === ref)?.businessId ?? MAIN_BUSINESS;
}

/** The owner's records as this employee may see them. Anything not granted is left out or blanked here, on the server.
 *  They see one business and, within it, one shop at a time: `activeRef` if it is theirs, otherwise their first.
 *  The business is the one their shop belongs to; an admin or manager with no location assigned works across the whole
 *  first business. Another business of the same owner is never included, whatever the role. */
export function filterForStaff(source: Partial<ErpState>, access: { permissions: readonly string[]; employeeRef?: string | null | undefined; locationRefs: readonly (string | null | undefined)[]; activeRef?: string | null | undefined; role?: string | undefined;
  /** The business this copy is for, when the server decided it (business memberships, 0020). Otherwise the business of their shop. */
  business?: string | undefined }): ErpState {
  const has = (k: string) => access.permissions.includes(k), view = (m: string) => has(moduleKey(m, "view"));
  const all = { ...empty(), ...source }, assigned = access.locationRefs.filter((r): r is string => Boolean(r));
  const first = assigned.find((r) => r === access.activeRef) ?? assigned[0];
  const business = access.business ?? (first ? businessOfLocation(all, first) : MAIN_BUSINESS);
  if (business === NO_BUSINESS) return { ...empty(), seq: {} };
  const whole = scopeToBusiness(all, business), refs = assigned.filter((r) => businessOfLocation(all, r) === business);
  const everywhere = isManagerRole(access.role) && !refs.length;
  const shop = refs.find((r) => r === access.activeRef) ?? refs[0] ?? NO_SHOP;
  // A shop's connected stores and warehouses come through only with the permission. Their stock is read from the movements they bring.
  const connected = view("inventory") && has("stock.view_warehouse") ? whole.locations.find((l) => l.id === shop)?.connected ?? [] : [];
  const out = empty(), full = everywhere ? whole : scopeToShop(whole, shop, connected);
  const take = <K extends keyof ErpState>(keys: K[], allowed: boolean) => { if (allowed) for (const k of keys) out[k] = full[k]; };
  const selling = view("sales") || view("pos");
  take(["products", "categories", "brands", "units", "attributes"], view("inventory") || selling || view("purchases"));
  take(["movements", "transfers"], view("inventory"));
  take(["sales", "returns", "customers"], selling);
  take(["suppliers", "purchases", "purchaseReturns", "purchaseOrders", "supplierInvoices"], view("purchases"));
  take(["expenses", "expenseCategories"], view("expenses"));
  if (view("contacts")) take(["customers", "suppliers", "otherContacts", "contactCategories"], true);
  const money = has("finance.view_balances");
  take(["payments", "cash"], money && (view("float") || view("accounting") || view("reports") || view("pos")));
  take(["audit"], has("audit.view"));
  // The names of the business's money accounts (no balances), so anyone taking or paying money can choose Airtel Money and the like.
  take(["moneyAccounts"], selling || view("purchases") || view("expenses") || view("float") || view("accounting") || view("reports"));
  take(["employees", "commissions", "payrolls", "payrollPayments", "payrollDrafts"], view("payroll") && has("salary.view"));
  if (!out.employees.length) out.employees = stripKeys(whole.employees.filter((e) => e.id === access.employeeRef), PAY_KEYS);
  const places = new Set(refs), seen = new Set(connected);
  out.locations = everywhere ? whole.locations : whole.locations.filter((l) => places.has(l.id) || (seen.has(l.id) && l.type !== "shop" && l.active !== false));
  // A variant's count is across every shop, so it stays out of one shop's copy.
  if (!everywhere) out.products = out.products.map(({ variants: _variants, ...p }) => p);
  const stripped = new Set(COST_KEYS);
  if (has("products.view_buying_price") || has("products.view_cost")) { stripped.delete("buy"); stripped.delete("cost"); stripped.delete("costPrice"); stripped.delete("buyingPrice"); stripped.delete("unitCost"); }
  if (has("profit.view_margin")) { stripped.delete("margin"); stripped.delete("profit"); }
  // A line's cost can be worked out from a document's total, so without cost access the buying documents show no money at all.
  if (stripped.has("buy")) {
    const noPay = { cash: 0, mpesa: 0, bank: 0, credit: 0 };
    out.purchases = out.purchases.map((p) => ({ ...p, total: 0, pay: noPay, settled: 0 }));
    out.purchaseReturns = out.purchaseReturns.map((r) => ({ ...r, amount: 0, items: r.items.map((i) => ({ ...i, amount: 0 })) }));
    out.purchaseOrders = out.purchaseOrders.map((o) => ({ ...o, total: 0 }));
    out.supplierInvoices = out.supplierInvoices.map((i) => ({ ...i, amount: 0 }));
  }
  const clean = stripped.size ? stripKeys(out, stripped) : out;
  // Reference counters are not business figures, but they aren't needed on a device that can't record.
  return { ...clean, seq: {} };
}
