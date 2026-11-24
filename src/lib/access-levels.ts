// Access levels per app (owner, 2026-11-24), the way Odoo, Zoho and QuickBooks show user rights: each app gets one level
// (No access · View · Use · Manage · Full) instead of six separate ticks, and a few sensitive rights (buying prices, profit, refunds…)
// are switched on or off by name. A role is only the starting point; whatever the owner changes for one person is kept as that
// person's own setting (`access`: permission key → allowed, differences from the role only) and sent to the server's
// member_permissions once their login exists (set_member_permission). The server stays the judge (my_access).
import { ACTIONS, MODULES, SENSITIVE, moduleKey } from "@/lib/staff-access";
import { peopleCall } from "@/lib/people-access.functions";

export type Level = "none" | "view" | "use" | "manage" | "full";
export const LEVELS: readonly [Level, string, string][] = [
  ["none", "No access", "The app is hidden from them"],
  ["view", "View", "Can open and look, can't change anything"],
  ["use", "Use", "Can look and add new records (sell, receive, record)"],
  ["manage", "Manage", "Can also edit records and export them"],
  ["full", "Full", "Can also delete and approve"],
];
const LEVEL_ACTIONS: Record<Level, readonly string[]> = {
  none: [], view: ["view"], use: ["view", "create"], manage: ["view", "create", "edit", "export"], full: ACTIONS,
};

const mods = (apps: string[], actions: readonly string[]) => apps.flatMap((m) => actions.map((a) => moduleKey(m, a)));
/** The role templates as the server starts them (migration 0009). An owner who changed a template in Manage Access › Role
 *  templates keeps that on the server; these are only what the window starts from. */
export const ROLE_DEFAULTS: Record<string, readonly string[]> = {
  admin: [...mods(MODULES.map(([id]) => id), ACTIONS), ...SENSITIVE.map(([k]) => k)],
  manager: [
    ...mods(["dashboard", "inventory", "purchases", "sales", "pos", "expenses", "contacts", "float", "reports"], ["view", "create", "edit", "export"]),
    "module.purchases.approve", "module.expenses.approve", "purchases.approve", "inventory.manage", "purchases.manage", "expenses.manage", "sales.process", "sales.refund", "pos.manage", "stock.transfers",
  ],
  shopkeeper: ["module.dashboard.view", "module.sales.view", "module.sales.create", "module.pos.view", "module.pos.create", "module.inventory.view", "sales.process"],
  warehouse_staff: ["module.dashboard.view", "module.inventory.view", "module.inventory.create", "module.inventory.edit", "inventory.manage", "stock.transfers"],
  staff: [],
};

/** Every permission key the access window shows. */
export const ACCESS_KEYS = [...mods(MODULES.map(([id]) => id), ACTIONS), ...SENSITIVE.map(([k]) => k)];

/** What this person ends up with: the role's start, then their own changes. */
export function effective(role: string, access?: Record<string, boolean>): Set<string> {
  const on = new Set(ROLE_DEFAULTS[role] ?? []);
  for (const [k, v] of Object.entries(access ?? {})) if (v) on.add(k); else on.delete(k);
  return on;
}

/** The level an app is at. Ticks that match no level exactly (set one by one in Manage Access) show as the nearest level below. */
export function levelOf(on: Set<string>, app: string): Level {
  const has = (a: string) => on.has(moduleKey(app, a));
  if (!has("view")) return "none";
  if (ACTIONS.every(has)) return "full";
  if (has("edit")) return "manage";
  if (has("create")) return "use";
  return "view";
}

/** Only the differences from the role are kept, so a later change to the role template still reaches this person elsewhere. */
function diff(role: string, on: Set<string>): Record<string, boolean> {
  const base = new Set(ROLE_DEFAULTS[role] ?? []), out: Record<string, boolean> = {};
  for (const k of ACCESS_KEYS) if (on.has(k) !== base.has(k)) out[k] = on.has(k);
  return out;
}

export function setLevel(role: string, access: Record<string, boolean> | undefined, app: string, level: Level) {
  const on = effective(role, access);
  for (const a of ACTIONS) on.delete(moduleKey(app, a));
  for (const a of LEVEL_ACTIONS[level]) on.add(moduleKey(app, a));
  return diff(role, on);
}
export function setRight(role: string, access: Record<string, boolean> | undefined, key: string, allowed: boolean) {
  const on = effective(role, access);
  if (allowed) on.add(key); else on.delete(key);
  return diff(role, on);
}
/** Everything on, or everything off (the owner's quick buttons). */
export function setAll(role: string, allowed: boolean) {
  return diff(role, allowed ? new Set(ACCESS_KEYS) : new Set());
}
export const changedCount = (access?: Record<string, boolean>) => Object.keys(access ?? {}).length;

/** Once the person has a login: their own settings go to the server, one switch at a time. Returns how many didn't save. */
export async function applyAccess(memberId: string, access?: Record<string, boolean>): Promise<number> {
  let failed = 0;
  for (const [key, allowed] of Object.entries(access ?? {})) {
    try { await peopleCall({ data: { fn: "set_member_permission", args: { p_member: memberId, p_key: key, p_allowed: allowed } } }); }
    catch { failed++; }
  }
  return failed;
}

/** The rules in plain words, shown under the access window and in the guide (owner, 2026-11-24). */
export const ACCESS_RULES = [
  "The owner always sees and controls everything, and alone can change the plan, ownership and owner rights.",
  "A role is a starting point: Admin (everything but owner rights), Manager, Shopkeeper, Storekeeper, or Staff (starts with nothing).",
  "Each app has one level: No access, View, Use (add records), Manage (also edit and export) or Full (also delete and approve).",
  "Sensitive rights are separate: buying prices, profit margins, balances, salaries, refunds and approvals stay hidden until switched on.",
  "A person only sees the shops and warehouses ticked for them, and only the counters ticked at each shop (none ticked: any counter).",
  "Changes for one person apply only to them; Manage Access › Role templates changes everyone on a role.",
];
