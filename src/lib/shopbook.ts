import { clean } from "@/lib/format";
import { randomUUID } from "@/lib/id";
// Local-only store for the screens-first phase (no backend yet).
// App icons are served from public/SHOP_PLUS_3D_Transparent_Icons.

export type PlanId = "basic" | "growth" | "business";
export type Tier = PlanId;

// ShopBot: light mode shows the black logo (Shopbot_Dark), dark mode the white logo (Shopbot_Light).
export const chatIcons = { dark: "/SHOP_PLUS_3D_Transparent_Icons/shopbot-light-192.png", light: "/SHOP_PLUS_3D_Transparent_Icons/shopbot-dark-192.png" };

export const APPS: { id: string; name: string; icon: string; iconDark: string; tier: Tier }[] = [
  { id: "dashboard", name: "Dashboard", icon: "/SHOP_PLUS_3D_Transparent_Icons/Dashboard.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Dashboard.png", tier: "basic" },
  { id: "inventory", name: "Inventory", icon: "/SHOP_PLUS_3D_Transparent_Icons/Inventory.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Inventory.png", tier: "basic" },
  { id: "purchases", name: "Purchases", icon: "/SHOP_PLUS_3D_Transparent_Icons/Purchases.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Purchases.png", tier: "basic" },
  { id: "sales", name: "Sales", icon: "/SHOP_PLUS_3D_Transparent_Icons/Sales.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Sales.png", tier: "basic" },
  { id: "pos", name: "POS", icon: "/SHOP_PLUS_3D_Transparent_Icons/POS.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/POS.png", tier: "basic" },
  { id: "expenses", name: "Expenses", icon: "/SHOP_PLUS_3D_Transparent_Icons/Expenses.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Expenses.png", tier: "basic" },
  { id: "contacts", name: "Contacts", icon: "/SHOP_PLUS_3D_Transparent_Icons/Contacts.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Contacts.png", tier: "growth" },
  { id: "float", name: "Float", icon: "/SHOP_PLUS_3D_Transparent_Icons/Float.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Float.png", tier: "growth" },
  { id: "accounting", name: "Accounting", icon: "/SHOP_PLUS_3D_Transparent_Icons/Accounting.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Accounting.png", tier: "growth" },
  { id: "payroll", name: "Payroll", icon: "/SHOP_PLUS_3D_Transparent_Icons/Payroll.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Payroll.png", tier: "business" },
  { id: "reports", name: "Reports", icon: "/SHOP_PLUS_3D_Transparent_Icons/Reports.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Reports.png", tier: "growth" },
  { id: "summary", name: "Summary", icon: "/SHOP_PLUS_3D_Transparent_Icons/Summary.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Summary.png", tier: "business" },
  { id: "settings", name: "Settings", icon: "/SHOP_PLUS_3D_Transparent_Icons/Settings.png", iconDark: "/SHOP_PLUS_3D_Transparent_Icons/Settings.png", tier: "basic" },
];

export const RING_ICONS = APPS.map((a) => a.iconDark);

export const PLANS: {
  id: PlanId;
  name: string;
  monthlyUsd: number;
  yearlyUsd: number;
  monthly: number;
  yearly: number;
  tagline: string;
  subtitle: string;
  /** Active Shops, Stores and legacy Warehouses together. The one place location limits are set. */
  locations: number;
  /** Every login the plan allows, the owner included: Basic 2, Growth 12, Business 24 (one pool, see loginAllowance). */
  maxUsers: number | null;
  /** How many of the logins may be admins or managers. */
  maxManagers: number;
  /** No longer limits anyone (2026-11-20: one free pool of logins); kept so older code and saved data still read. */
  shopkeepersPerShop: number;
  storekeepersPerStore: number;
  /** Whether this plan offers manager roles. */
  managerRoles: boolean;
  /** Tills (counters) the plan allows: in total, or at each shop when `countersPerShop`. Added 2026-11-20 on the owner's approval. */
  counters: number;
  countersPerShop: boolean;
  intro?: string;
  features: string[];
  recommended?: boolean;
  best?: boolean;
}[] = [
  {
    id: "basic",
    name: "Basic",
    monthlyUsd: 11,
    yearlyUsd: 118.8, // $11 * 12 * 0.9 = $118.80 / yr
    monthly: 11,
    yearly: 118.8,
    tagline: "Start selling.",
    subtitle: "Small business",
    locations: 1,
    maxUsers: 2,
    maxManagers: 0,
    shopkeepersPerShop: 1,
    storekeepersPerStore: 0,
    managerRoles: false,
    counters: 1,
    countersPerShop: false,
    features: [
      "POS cash checkout",
      "Real-time inventory & stock",
      "Sales and purchase orders",
      "Product catalog & barcode",
      "Daily sales history & reports",
      "Expenses & payment recording",
      "Returns & customer receipts",
      "Low-stock alerts & badges",
      "Customer & supplier records",
      "Device-local backup",
      "Offline sales recording",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    monthlyUsd: 22,
    yearlyUsd: 237.6, // $22 * 12 * 0.9 = $237.60 / yr
    monthly: 22,
    yearly: 237.6,
    tagline: "Manage your growing shop.",
    subtitle: "Growing business",
    locations: 5,
    maxUsers: 12,
    maxManagers: 1,
    shopkeepersPerShop: 2,
    storekeepersPerStore: 1,
    managerRoles: true,
    counters: 10,
    countersPerShop: false,
    intro: "Everything in Basic, plus:",
    recommended: true,
    features: [
      "Customer debtors & contacts",
      "Double-entry accounting",
      "Cash float & till management",
      "Returns & stock restoration",
      "Credit sales & partial payments (P.Pay)",
      "End-of-day cash-up auditing",
      "Full financial reports",
      "Multi-shop management",
      "Warehouse stock transfers",
      "Advanced settings & permissions",
    ],
  },
  {
    id: "business",
    name: "Business",
    monthlyUsd: 50,
    yearlyUsd: 540, // $50 * 12 * 0.9 = $540 / yr
    monthly: 50,
    yearly: 540,
    tagline: "Run the whole business.",
    subtitle: "Established business",
    locations: 10,
    maxUsers: 24,
    maxManagers: 3,
    shopkeepersPerShop: 2,
    storekeepersPerStore: 1,
    managerRoles: true,
    counters: 20,
    countersPerShop: false,
    intro: "Everything in Growth, plus:",
    best: true,
    features: [
      "Staff payroll & wage slips",
      "Executive business summaries",
      "Multi-shop & multi-device sync",
      "Advanced approval workflows",
      "Shopbot AI business insights",
      "Role-based permissions & cashiers",
      "Priority VIP support",
      "Expanded cloud backups",
      "Custom reports & scheduled summaries",
      "Advanced settings & controls",
    ],
  },
];

const RANK: Record<Tier, number> = { basic: 1, growth: 2, business: 3 };

/** A business document's details. New files are kept in the device's document store (doc-store.ts); older ones carry a dataUrl. */
export type BusinessDocument = { id: string; name: string; mime: string; size: number; dataUrl?: string | undefined;
  /** An online copy is kept (proposed 0022), so the owner's other devices can open it. */ cloud?: boolean | undefined };

export type Account = {
  shopName: string;
  email: string;
  phone?: string;
  /** A second and third business phone number (Business Setup), optional. `phone` is the primary one, given when registering. */
  phone2?: string | undefined;
  phone3?: string | undefined;
  /** Optional business files (KRA certificates and related records), kept with the local business account. */
  businessDocuments?: BusinessDocument[] | undefined;
  language?: string;
  currency: string;
  country?: string;
  logo?: string | undefined;
  businessId?: string;
  password: string; // screens-only phase; replaced by real auth later
  plan?: PlanId | "trial" | undefined;
  trialStart?: number;
  /** The plan picked when starting the trial. It opens nothing: the trial stays full access and only a verified payment activates a plan. */
  trialChoice?: PlanId | undefined;
  /** The billing period of the paid plan, set by buyPlan. */
  billing?: Billing | undefined;
  /** Legacy single type kept for accounts saved before the multi-type catalogue. */
  businessType?: string | undefined;
  /** Approved business type labels from the industry catalogue; legacy labels remain valid until changed in setup.
   *  The first is the primary type; the rest are extra types the business also trades in. */
  businessTypes?: readonly string[] | undefined;
  /** Optional catalogue family; absent on older accounts and safe to derive from the first recognized businessType. */
  industryFamilyId?: import("@/lib/industry-config").IndustryFamilyId | undefined;
  /** Set when a new plan or trial starts and cleared by Review & Activate, so signing in returns to setup until it is done. */
  setupPending?: boolean | undefined;
  role?: string | undefined;
  /** The "Try a sample shop" account (sample-shop.ts): never synced, backed up or linked online; leaving it removes it. */
  demo?: boolean | undefined;
  /** Present only on an employee login. It comes from the server and decides what this device shows. */
  staff?: StaffAccess | undefined;
  /** Central identity status is separate from legacy profile fields stored on this device. */
  authMigration?: { status: "not_started" | "pending" | "complete" | "manual_reconciliation"; centralUserId?: string; centralAccountId?: string; centralBusinessId?: string; updatedAt: number; message?: string } | undefined;
  /** Server-derived central context; legacy browser profile values never populate this field. */
  centralContext?: { accountId: string; businesses: { id: string; name: string; currency: string; legacy_business_id: string | null }[]; locations: { id: string; name: string; kind: string; business_id: string; erp_ref: string | null; status: string }[]; subscription: { plan_id: string; status: string; billing_cycle: string | null; trial_ends_at: string | null } | null; syncBusiness: string | null; syncedAt: number } | undefined;
};

export type StaffLocation = { id: string; name: string; kind: "shop" | "store" | "warehouse"; businessId: string; erpRef?: string | null };
export type StaffAccess = {
  memberId: string; fullName: string; role: string; permissions: string[];
  businesses: { id: string; name: string; currency: string }[]; locations: StaffLocation[];
  activeLocationId?: string | undefined; syncedAt?: number | undefined;
  /** False once the employer's trial has ended: the server still lets them view, but records nothing. */
  writable?: boolean | undefined;
};

const KEY = "shopbook.account";
const SESSION = "shopbook.session";

export const store = {
  get(): Account | null {
    if (typeof window === "undefined") return null;
    try {
      const a = JSON.parse(localStorage.getItem(KEY) || "null");
      // Accounts saved before Plus became Growth keep everything they have.
      return a?.plan === "plus" ? { ...a, plan: "growth" } : a;
    } catch {
      return null;
    }
  },
  register(a: Account) {
    const freshAccount: Account = {
      ...a,
      businessId: a.businessId || randomUUID(),
    };
    localStorage.setItem(KEY, JSON.stringify(freshAccount));
    store.signIn();
    return freshAccount;
  },
  save(a: Account) {
    const old = store.get();
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...a,
        businessId: a.businessId ?? old?.businessId ?? randomUUID(),
      }),
    );
  },
  update(p: Partial<Account>) {
    const a = store.get();
    if (a) store.save({ ...a, ...p });
  },
  /** `remember` false (Log In's "Remember me" unticked) keeps the session for this browser tab only, so closing the browser signs out. */
  signIn(remember = true) {
    if (remember) {
      localStorage.setItem(SESSION, "1");
      try { sessionStorage.removeItem(SESSION); } catch { /* no session storage */ }
    } else {
      localStorage.removeItem(SESSION);
      try { sessionStorage.setItem(SESSION, "1"); } catch { localStorage.setItem(SESSION, "1"); }
    }
    window.dispatchEvent(new Event("shopbook-session"));
  },
  signOut() {
    localStorage.removeItem(SESSION);
    try { sessionStorage.removeItem(SESSION); } catch { /* no session storage */ }
    window.dispatchEvent(new Event("shopbook-session"));
  },
  signedIn() {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem(SESSION) === "1") return true;
    try { return sessionStorage.getItem(SESSION) === "1"; } catch { return false; }
  },
};

export function trialDaysLeft(a: Account | null) {
  if (!a?.trialStart) return 0;
  return Math.max(0, 30 - Math.floor((Date.now() - a.trialStart) / 86400000));
}

/** The trial opens every app, so it carries the largest plan's allowances. No plan has the smallest. */
function planOf(a: Pick<Account, "plan"> | null) {
  const id = a?.plan === "trial" ? "business" : a?.plan;
  return PLANS.find((p) => p.id === id);
}

/** Active locations this account may have. */
export function locationAllowance(a: Account | null) {
  return planOf(a)?.locations ?? 1;
}

export type LocationCounts = { shops: number; stores: number; warehouses: number };

/** How a plan is billed, as chosen when it was bought. Older accounts without one were bought monthly. */
export type Billing = "monthly" | "yearly";
/** The plan's real price for its billing period, e.g. { amount: 50, period: "month" }. */
export function planPrice(p: (typeof PLANS)[number], billing: Billing = "monthly") {
  return billing === "yearly" ? { amount: Math.round(p.yearlyUsd), period: "year" as const } : { amount: p.monthlyUsd, period: "month" as const };
}

/** One pool of logins per plan (owner's rule, 2026-11-20): Basic 2, Growth 12, Business 24, the owner included, whatever the
 *  number or type of locations. Of these, up to `maxManagers` may be admins or managers; everyone else is staff the owner places
 *  freely: all at one shop, or shared between shops and warehouses. No location has its own staff limit. `n` and `usedManagers`
 *  are kept for older callers and change nothing. */
export function loginAllowance(a: Pick<Account, "plan"> | null, _n: LocationCounts = { shops: 0, stores: 0, warehouses: 0 }, _usedManagers = 0) {
  const p = planOf(a) ?? PLANS[0]!;
  const total = p.maxUsers ?? 2;
  // Three fixed parts: the owner, the managers, the staff. Empty manager places never become staff places.
  const staff = total - 1 - p.maxManagers;
  return { total, staff, managers: p.maxManagers, shopkeepers: staff, storekeepers: p.id === "basic" ? 0 : staff };
}

/** The counters (tills) a plan allows, in total across all shops, one per staff place (owner, 2026-11-22): Basic 1, Growth 10, Business 20.
 *  Once used, a counter must be removed from a shop before another can be added. The trial has Business limits. */
export function counterLimit(a: Pick<Account, "plan"> | null) {
  const p = planOf(a) ?? PLANS[0]!;
  return { max: p.counters, perShop: p.countersPerShop };
}
/** The counter line on a plan card, from the plan's own numbers. */
export function planCounterLine(p: (typeof PLANS)[number]) {
  return p.counters === 1 ? "1 Counter" : p.countersPerShop ? `Up to ${p.counters} Counters per Shop` : `Up to ${p.counters} Counters`;
}

/** The two rows on a plan card, from the plan's own numbers. */
export function planAllowanceLines(p: (typeof PLANS)[number]) {
  const maxUsers = p.maxUsers ?? 2;
  const places = `${p.locations} ${p.locations === 1 ? "Location" : "Locations"} · Up to ${maxUsers} Users`;
  const staff = maxUsers - 1 - p.maxManagers;
  const people = p.id === "basic" ? "1 Owner + 1 Employee" : `1 Owner + ${p.maxManagers === 1 ? "1 Manager" : `${p.maxManagers} Managers`} + ${staff} Staff`;
  return [places, people];
}

/** Who the staff can be, for the limits explanation on /plans. */
export function planEmployeeRule(p: (typeof PLANS)[number]) {
  return p.maxManagers === 0
    ? "Basic allows one employee for its one Shop and no Warehouse."
    : `${p.maxManagers === 1 ? "Up to 1 Manager" : `Up to ${p.maxManagers} Managers`} and up to ${(p.maxUsers ?? 2) - 1 - p.maxManagers} staff; place the staff at any shop or warehouse, all at one or shared.`;
}

/** An app opens on the trial (before and after it ends: an ended trial is read-only, see canRecord) or on a plan that includes it. */
export function canOpen(a: Account | null, tier: Tier) {
  if (!a?.plan) return false;
  if (a.plan === "trial") return true;
  return RANK[a.plan] >= RANK[tier];
}

/** The 30-day trial is over and no plan has been paid for. */
export function trialEnded(a: Pick<Account, "plan" | "trialStart"> | null) {
  return a?.plan === "trial" && trialDaysLeft(a as Account) <= 0;
}

/** Whether this device may record anything new or change existing records. After the trial, people still sign in, view and export
 *  what they were already allowed to; only a verified plan brings recording back. An employee's answer comes from the server (`writable`). */
export function canRecord(a: Account | null) {
  if (!a) return true;
  if (a.staff && a.staff.writable !== undefined) return a.staff.writable;
  return !trialEnded(a);
}

export const READ_ONLY_MESSAGE = "Your free trial has ended. You can still view and export your records. Subscribe to add new transactions.";
export const STAFF_READ_ONLY_MESSAGE = "Your employer's free trial has ended. You can still view records. Ask your employer to subscribe to add new sales.";

/** Apps a plan does not open. */
export function appsNotIn(plan: PlanId) {
  return APPS.filter((app) => RANK[app.tier] > RANK[plan]);
}

/** The business types an account holds, in display order. A single stored label (older accounts) is kept as the first. */
export function businessTypesOf(a: Account | null): readonly string[] {
  const types = a?.businessTypes?.filter(Boolean);
  if (types?.length) return types;
  return a?.businessType ? [a.businessType] : [];
}

/** Of those, the apps this account has had access to, so would lose by moving to the plan. The trial counts as every app. */
export function appsLostOn(a: Account | null, plan: PlanId) {
  if (!a?.plan) return [];
  const held = a.plan === "trial" ? RANK.business : RANK[a.plan];
  return appsNotIn(plan).filter((app) => RANK[app.tier] <= held);
}

/** How close to the end of the trial the owner is warned about what they will lose. */
export const TRIAL_WARNING_DAYS = 7;

export const fmtKsh = (n: number) => `KSh ${clean(n).toLocaleString("en-KE")}`;


