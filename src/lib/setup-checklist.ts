// The Dashboard's setup list for a new owner. Each step reads real records where they exist; payment methods and other
// settings have no record that says they were set up, so those count as done once opened. Only that and hiding the list stay on this device.
import { MAIN_LOCATION } from "@/lib/locations";
import type { ErpState } from "@/lib/erp";
import type { ViewSearch } from "@/lib/deep-link";

const KEY = "shopbook.setupChecklist";
export type SetupMarks = { seen: string[]; hidden: boolean };

export function readSetupMarks(): SetupMarks {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    return { seen: Array.isArray(v?.seen) ? v.seen : [], hidden: v?.hidden === true };
  } catch {
    return { seen: [], hidden: false };
  }
}
export function saveSetupMarks(marks: SetupMarks) {
  localStorage.setItem(KEY, JSON.stringify(marks));
}

export type SetupStep = {
  id: string;
  label: string;
  to: string;
  search: ViewSearch;
  done: boolean;
  opensOnly?: boolean;
};

export function setupSteps(s: ErpState, seen: readonly string[]): SetupStep[] {
  return [
    {
      id: "shop",
      label: "Set up your first shop",
      to: "/setup",
      search: {},
      done: s.locations.some((l) => l.id === MAIN_LOCATION),
    },
    {
      id: "products",
      label: "Add your products",
      to: "/inventory",
      search: { menu: "products & stock", sub: "Add Product" },
      done: s.products.some((p) => !p.archived),
    },
    {
      id: "stock",
      label: "Enter opening stock",
      to: "/inventory",
      search: { menu: "products & stock", sub: "Stock In" },
      done: s.movements.length > 0,
    },
    {
      id: "sale",
      label: "Make a test sale",
      to: "/pos",
      search: {},
      done: s.sales.length > 0,
    },
    {
      id: "staff",
      label: "Invite your staff",
      to: "/settings",
      search: { menu: "People & Access" },
      done: s.employees.length > 0,
    },
    {
      id: "payments",
      label: "Check payment methods",
      to: "/settings",
      search: { menu: "Finance" },
      done: seen.includes("payments"),
      opensOnly: true,
    },
    {
      id: "settings",
      label: "Review other settings",
      to: "/settings",
      search: {},
      done: seen.includes("settings"),
      opensOnly: true,
    },
  ];
}

/** A shop that is already selling is past setup, so existing customers never get this list. */
export const setupListShown = (s: ErpState, marks: SetupMarks) =>
  !marks.hidden && s.sales.length === 0 && setupSteps(s, marks.seen).some((step) => !step.done);
