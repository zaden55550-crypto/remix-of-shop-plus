// Local-only store for the screens-first phase (no backend yet).
import Dashboard from "@/assets/icons/Dashboard.png.asset.json";
import Inventory from "@/assets/icons/Inventory.png.asset.json";
import Purchases from "@/assets/icons/Purchases.png.asset.json";
import Sales from "@/assets/icons/Sales.png.asset.json";
import POS from "@/assets/icons/POS.png.asset.json";
import Expenses from "@/assets/icons/Expenses.png.asset.json";
import Contacts from "@/assets/icons/Contacts.png.asset.json";
import Accounting from "@/assets/icons/Accounting.png.asset.json";
import Float from "@/assets/icons/Float.png.asset.json";
import Payroll from "@/assets/icons/Payroll.png.asset.json";
import Reports from "@/assets/icons/Reports.png.asset.json";
import Summary from "@/assets/icons/Summary.png.asset.json";
import Settings from "@/assets/icons/Settings.png.asset.json";
import DashboardD from "@/assets/icons2/Dashboard.png.asset.json";
import InventoryD from "@/assets/icons2/Inventory.png.asset.json";
import PurchasesD from "@/assets/icons2/Purchases.png.asset.json";
import SalesD from "@/assets/icons2/Sales.png.asset.json";
import POSD from "@/assets/icons2/POS.png.asset.json";
import ExpensesD from "@/assets/icons2/Expenses.png.asset.json";
import ContactsD from "@/assets/icons2/Contacts.png.asset.json";
import AccountingD from "@/assets/icons2/Accounting.png.asset.json";
import FloatD from "@/assets/icons2/Float.png.asset.json";
import PayrollD from "@/assets/icons2/Payroll.png.asset.json";
import ReportsD from "@/assets/icons2/Reports.png.asset.json";
import SummaryD from "@/assets/icons2/Summary.png.asset.json";
import SettingsD from "@/assets/icons2/Settings.png.asset.json";
import ChatLight from "@/assets/icons/AI_Chatbot_Light_Mode.png.asset.json";
import ChatLightV2 from "@/assets/Chatbot_Dark_v2.png.asset.json";

export type PlanId = "basic" | "plus" | "business";
export type Tier = PlanId;

// Per the supplied assets: the dark chatbot art is for light mode, the light art for dark mode.
// Light mode uses only the supplied black "chatbot" art (Chatbot_Dark_v2).
export const chatIcons = { dark: ChatLight.url, light: ChatLightV2.url };

export const APPS: { id: string; name: string; icon: string; iconDark: string; tier: Tier }[] = [
  { id: "dashboard", name: "Dashboard", icon: Dashboard.url, iconDark: DashboardD.url, tier: "basic" },
  { id: "inventory", name: "Inventory", icon: Inventory.url, iconDark: InventoryD.url, tier: "basic" },
  { id: "purchases", name: "Purchases", icon: Purchases.url, iconDark: PurchasesD.url, tier: "basic" },
  { id: "sales", name: "Sales", icon: Sales.url, iconDark: SalesD.url, tier: "basic" },
  { id: "pos", name: "POS", icon: POS.url, iconDark: POSD.url, tier: "basic" },
  { id: "expenses", name: "Expenses", icon: Expenses.url, iconDark: ExpensesD.url, tier: "plus" },
  { id: "contacts", name: "Contacts", icon: Contacts.url, iconDark: ContactsD.url, tier: "plus" },
  { id: "accounting", name: "Accounting", icon: Accounting.url, iconDark: AccountingD.url, tier: "plus" },
  { id: "float", name: "Float", icon: Float.url, iconDark: FloatD.url, tier: "plus" },
  { id: "payroll", name: "Payroll", icon: Payroll.url, iconDark: PayrollD.url, tier: "business" },
  { id: "reports", name: "Reports", icon: Reports.url, iconDark: ReportsD.url, tier: "plus" },
  { id: "summary", name: "Summary", icon: Summary.url, iconDark: SummaryD.url, tier: "business" },
  { id: "settings", name: "Settings", icon: Settings.url, iconDark: SettingsD.url, tier: "basic" },
];

export const RING_ICONS = APPS.map((a) => a.iconDark);

export const PLANS: {
  id: PlanId;
  name: string;
  monthly: number;
  yearly: number;
  tagline: string;
  intro?: string;
  features: string[];
  best?: boolean;
}[] = [
  {
    id: "basic", name: "Basic", monthly: 1050, yearly: 1000, tagline: "Start selling.",
    features: ["Dashboard basic", "Inventory", "Purchases", "Sales", "POS", "Basic products", "Basic history", "Basic settings"],
  },
  {
    id: "plus", name: "Plus", monthly: 2100, yearly: 2000, tagline: "Manage your growing shop.", intro: "Everything in Basic, plus:",
    features: ["Inventory", "Contacts", "Accounting", "Float", "Returns", "Credit & partial", "Mixed payments", "Cash-up (end of day)", "Reports", "Settings (advanced)"],
  },
  {
    id: "business", name: "Business", monthly: 4200, yearly: 4000, tagline: "Run the whole business.", intro: "Everything in Plus, plus:", best: true,
    features: ["Payroll", "Summary", "Advanced analytics", "Advanced AI", "Advanced permissions", "Multi-shop", "Advanced integrations", "Custom reports", "Priority support", "Full settings access"],
  },
];

const RANK: Record<Tier, number> = { basic: 1, plus: 2, business: 3 };

export type Account = {
  shopName: string;
  email: string;
  language?: string;
  currency: string;
  logo?: string | undefined;
  password: string; // screens-only phase; replaced by real auth later
  plan?: PlanId | "trial";
  trialStart?: number;
};

const KEY = "shopbook.account";
const SESSION = "shopbook.session";

export const store = {
  get(): Account | null {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch { return null; }
  },
  save(a: Account) { localStorage.setItem(KEY, JSON.stringify(a)); },
  update(p: Partial<Account>) { const a = store.get(); if (a) store.save({ ...a, ...p }); },
  signIn() { localStorage.setItem(SESSION, "1"); },
  signOut() { localStorage.removeItem(SESSION); },
  signedIn() { return typeof window !== "undefined" && localStorage.getItem(SESSION) === "1"; },
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

export const fmtKsh = (n: number) => `KSh ${n.toLocaleString("en-KE")}`;
