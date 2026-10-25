import { clean } from "@/lib/format";
// Local-only store for the screens-first phase (no backend yet).
import Dashboard from "@/assets/icons-final/Dashboard.png.asset.json";
import Inventory from "@/assets/Inventory.png.asset.json";
import Purchases from "@/assets/icons-final/Purchases.png.asset.json";
import Sales from "@/assets/icons-final/Sales.png.asset.json";
import POS from "@/assets/icons-final/POS.png.asset.json";
import Expenses from "@/assets/icons-final/Expenses.png.asset.json";
import Contacts from "@/assets/icons-final/Contacts.png.asset.json";
import Accounting from "@/assets/icons-final/Accounting.png.asset.json";
import Float from "@/assets/icons-final/Float.png.asset.json";
import Payroll from "@/assets/icons-final/Payroll.png.asset.json";
import Reports from "@/assets/icons-final/Reports.png.asset.json";
import Summary from "@/assets/icons-final/Summary.png.asset.json";
import Settings from "@/assets/icons-final/Settings.png.asset.json";
import DashboardD from "@/assets/icons-final/Dashboard.png.asset.json";
import InventoryD from "@/assets/Inventory.png.asset.json";
import PurchasesD from "@/assets/icons-final/Purchases.png.asset.json";
import SalesD from "@/assets/icons-final/Sales.png.asset.json";
import POSD from "@/assets/icons-final/POS.png.asset.json";
import ExpensesD from "@/assets/icons-final/Expenses.png.asset.json";
import ContactsD from "@/assets/icons-final/Contacts.png.asset.json";
import AccountingD from "@/assets/icons-final/Accounting.png.asset.json";
import FloatD from "@/assets/icons-final/Float.png.asset.json";
import PayrollD from "@/assets/icons-final/Payroll.png.asset.json";
import ReportsD from "@/assets/icons-final/Reports.png.asset.json";
import SummaryD from "@/assets/icons-final/Summary.png.asset.json";
import SettingsD from "@/assets/icons-final/Settings.png.asset.json";
import ShopbotLight from "@/assets/Shopbot_Light.png.asset.json";
import ShopbotDark from "@/assets/Shopbot_Dark.png.asset.json";

export type PlanId = "basic" | "plus" | "business";
export type Tier = PlanId;

// ShopBot: light mode shows the black logo (Shopbot_Dark), dark mode the white logo (Shopbot_Light).
export const chatIcons = { dark: ShopbotLight.url, light: ShopbotDark.url };

export const APPS: { id: string; name: string; icon: string; iconDark: string; tier: Tier }[] = [
  { id: "dashboard", name: "Dashboard", icon: Dashboard.url, iconDark: DashboardD.url, tier: "basic" },
  { id: "inventory", name: "Inventory", icon: Inventory.url, iconDark: InventoryD.url, tier: "basic" },
  { id: "purchases", name: "Purchases", icon: Purchases.url, iconDark: PurchasesD.url, tier: "basic" },
  { id: "sales", name: "Sales", icon: Sales.url, iconDark: SalesD.url, tier: "basic" },
  { id: "pos", name: "POS", icon: POS.url, iconDark: POSD.url, tier: "basic" },
  { id: "expenses", name: "Expenses", icon: Expenses.url, iconDark: ExpensesD.url, tier: "basic" },
  { id: "contacts", name: "Contacts", icon: Contacts.url, iconDark: ContactsD.url, tier: "plus" },
  { id: "float", name: "Float", icon: Float.url, iconDark: FloatD.url, tier: "plus" },
  { id: "accounting", name: "Accounting", icon: Accounting.url, iconDark: AccountingD.url, tier: "plus" },
  { id: "payroll", name: "Payroll", icon: Payroll.url, iconDark: PayrollD.url, tier: "business" },
  { id: "reports", name: "Reports", icon: Reports.url, iconDark: ReportsD.url, tier: "plus" },
  { id: "summary", name: "Summary", icon: Summary.url, iconDark: SummaryD.url, tier: "business" },
  { id: "settings", name: "Settings", icon: Settings.url, iconDark: SettingsD.url, tier: "basic" },
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
    features: [
      "POS cashier checkout",
      "Real-time Inventory & stock",
      "Sales & purchase orders",
      "Product catalog & barcode",
      "Basic daily sales history",
      "Device-local backup",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    monthlyUsd: 22,
    yearlyUsd: 237.6, // $22 * 12 * 0.9 = $237.60 / yr
    monthly: 22,
    yearly: 237.6,
    tagline: "Manage your growing shop.",
    intro: "Basic plus:",
    recommended: true,
    features: [
      "Customer Debtors & Contacts",
      "Double-entry Accounting",
      "Cash Float & Till Management",
      "Returns & stock restoration",
      "Credit sales & partial payments (P.PAY)",
      "End-of-day Cash-Up audit",
      "Full Financial Reports",
      "Multi-Shop & Multi-Device Sync (manage 1 store)",
      "Settings (advanced)",
    ],
  },
  {
    id: "business",
    name: "Business",
    monthlyUsd: 40,
    yearlyUsd: 432, // $40 * 12 * 0.9 = $432 / yr
    monthly: 40,
    yearly: 432,
    tagline: "Run the whole business.",
    intro: "Plus plus:",
    best: true,
    features: [
      "Staff Payroll & Wage slips",
      "Executive Business Summary",
      "Multi-Shop & Multi-Device Sync (manage multiple branches & stores)",
      "Smart Business AI & reorder alerts",
      "Role-based permissions & cashiers",
      "Priority VIP support",
      "Unlimited cloud backups",
      "Full settings & custom reports",
    ],
  },
];

const RANK: Record<Tier, number> = { basic: 1, plus: 2, business: 3 };

export type Account = {
  shopName: string;
  email: string;
  phone?: string;
  language?: string;
  currency: string;
  country?: string;
  logo?: string | undefined;
  businessId?: string;
  password: string; // screens-only phase; replaced by real auth later
  plan?: PlanId | "trial";
  trialStart?: number;
};

const KEY = "shopbook.account";
const SESSION = "shopbook.session";

export const store = {
  get(): Account | null {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem(KEY) || "null");
    } catch {
      return null;
    }
  },
  save(a: Account) {
    const old = store.get();
    if (old && !a.businessId && (old.password !== a.password || old.shopName !== a.shopName || old.phone !== a.phone)) {
      throw new Error("Sign in to the existing shop or export and clear this device before changing businesses.");
    }
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...a,
        businessId: a.businessId ?? old?.businessId ?? crypto.randomUUID(),
      }),
    );
  },
  update(p: Partial<Account>) {
    const a = store.get();
    if (a) store.save({ ...a, ...p });
  },
  signIn() {
    localStorage.setItem(SESSION, "1");
    window.dispatchEvent(new Event("shopbook-session"));
  },
  signOut() {
    localStorage.removeItem(SESSION);
    window.dispatchEvent(new Event("shopbook-session"));
  },
  signedIn() {
    return typeof window !== "undefined" && localStorage.getItem(SESSION) === "1";
  },
};

export function trialDaysLeft(a: Account | null) {
  if (!a?.trialStart) return 0;
  return Math.max(0, 30 - Math.floor((Date.now() - a.trialStart) / 86400000));
}

export function canOpen(a: Account | null, tier: Tier) {
  if (!a?.plan) return false;
  if (a.plan === "trial") return trialDaysLeft(a) > 0;
  return RANK[a.plan] >= RANK[tier];
}

export const fmtKsh = (n: number) => `KSh ${clean(n).toLocaleString("en-KE")}`;
