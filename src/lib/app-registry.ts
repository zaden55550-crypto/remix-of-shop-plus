// Which applications a business may use, for the Apps launcher and for every app route (AppAccessGate). One place decides.
//
// Order of decisions:
// 1. Requirements: the business type's own entry (app-requirements.ts: one per approved type) when the type belongs to the
//    business's industry; otherwise its industry's approved configuration (industry-config.ts); a business with no classification at
//    all (saved before industries existed) is a Trade business, so it keeps every app it had.
// 2. Implemented vs planned: implemented apps open; required modules that are not built yet show as planned tiles that never open.
// 3. Subscription: an app the plan doesn't include is listed but locked (canOpen in shopbook.ts decides; plans are not changed here).
// 4. Permissions: an employee sees only the apps their login may view; the owner may hide apps (Settings › Manage Apps).
// Settings is always separate (its own row on the launcher). The launcher lays tiles out four to a row.
import { TILL_APPS, tillLimited } from "@/lib/till-cashier";
import { APPS, canOpen, type Account } from "@/lib/shopbook";
import { INDUSTRIES, INDUSTRY_APP_NAMES, PLANNED_INDUSTRY_APP_IDS, businessTypeByName, isIndustryFamilyId, type IndustryFamilyId } from "@/lib/industry-config";
import { IMPLEMENTED_APPS, MODULES, requirementsOf, type ImplementedApp, type ModuleId } from "@/lib/app-requirements";
import { allowedApps } from "@/lib/staff-access";

export const APPS_PER_ROW = 4;
export type RegistryApp = (typeof APPS)[number];
export type PlannedTile = { id: string; name: string; privacy: boolean };
export type Launcher = {
  /** The industry the launcher was chosen for (Trade when the business has no classification). */
  industry: IndustryFamilyId;
  /** True when the business type's own requirements were used (not just its industry's). */
  typeSpecific: boolean;
  /** Implemented apps to show, in the launcher's order, without Settings. Locked ones are still listed (see `locked`). */
  apps: RegistryApp[];
  /** Required modules that are not built yet: shown, never opened. */
  planned: PlannedTile[];
  /** Settings, shown on its own row, when this login may open it. */
  settings: RegistryApp | undefined;
  /** Apps listed but not included in the plan. */
  locked: Set<string>;
};
export type LauncherInput = {
  industryFamilyId?: string | undefined;
  businessType?: string | undefined;
  account: Account;
  /** Apps the owner chose to hide on this device. */
  hiddenApps?: readonly string[] | undefined;
};

const IMPLEMENTED = new Set<string>(IMPLEMENTED_APPS);
const OLD_PLANNED = new Set<string>(PLANNED_INDUSTRY_APP_IDS);

/** The industry a business's apps follow: its saved industry, else its approved business type's, else Trade. */
export function launcherIndustry(industryFamilyId: string | undefined, businessType: string | undefined): IndustryFamilyId {
  if (isIndustryFamilyId(industryFamilyId)) return industryFamilyId;
  return (businessType ? businessTypeByName(businessType)?.familyId : undefined) ?? "trade";
}

/** What a business of this classification needs: implemented apps and required modules. */
export function requirementsFor(industryFamilyId: string | undefined, businessType: string | undefined): { apps: readonly ImplementedApp[]; modules: readonly { id: string; name: string; privacy: boolean }[]; typeSpecific: boolean } {
  const industry = launcherIndustry(industryFamilyId, businessType);
  const type = businessType ? businessTypeByName(businessType) : undefined;
  const own = type && type.familyId === industry ? requirementsOf(type.name) : undefined;
  if (own) return { apps: own.apps, modules: own.modules.map((id: ModuleId) => ({ id, name: MODULES[id].name, privacy: "privacy" in MODULES[id] && MODULES[id].privacy === true })), typeSpecific: true };
  // No approved type for this industry: the industry's approved configuration (Trade: every app).
  const family = INDUSTRIES.find((i) => i.id === industry)!;
  const ids = [...new Set<string>([...family.requiredApps, ...family.optionalApps])];
  return {
    apps: ids.filter((id): id is ImplementedApp => IMPLEMENTED.has(id)),
    modules: ids.filter((id) => OLD_PLANNED.has(id)).map((id) => ({ id, name: INDUSTRY_APP_NAMES[id] ?? id, privacy: id === "patients" || id === "students" })),
    typeSpecific: false,
  };
}

/** The launcher for one business and one login. */
export function launcherFor({ industryFamilyId, businessType, account, hiddenApps = [] }: LauncherInput): Launcher {
  const industry = launcherIndustry(industryFamilyId, businessType);
  const need = requirementsFor(industryFamilyId, businessType);
  const capable = new Set<string>(need.apps);
  const permitted = account.staff ? new Set<string>(allowedApps(account.staff.permissions)) : undefined;
  // A cashier switched in by PIN at a shared till (till-cashier.ts) sees only the selling apps until their turn ends.
  const till = tillLimited();
  const mayView = (id: string) => (!permitted || permitted.has(id)) && (!till || TILL_APPS.includes(id));
  const apps = APPS.filter((a) => a.id !== "settings" && capable.has(a.id) && !hiddenApps.includes(a.id) && mayView(a.id));
  const settingsApp = APPS.find((a) => a.id === "settings");
  return {
    industry,
    typeSpecific: need.typeSpecific,
    apps,
    planned: need.modules.map((m) => ({ ...m })),
    settings: settingsApp && mayView("settings") ? settingsApp : undefined,
    locked: new Set(apps.filter((a) => !canOpen(account, a.tier)).map((a) => a.id)),
  };
}

/** Rows the launcher grid needs: four tiles to a row, plus Settings on a row of its own. */
export const launcherRows = (l: Pick<Launcher, "apps" | "planned" | "settings">) => Math.ceil((l.apps.length + l.planned.length) / APPS_PER_ROW) + (l.settings ? 1 : 0);

// ---------- Routes ----------
/** Pages that belong to an app under another name. */
const ROUTE_APP: Record<string, ImplementedApp> = { reconciliation: "accounting" };
/** The app a page belongs to, or undefined for pages outside the apps (sign-in, Apps launcher, businesses, plans, setup, legal, invites…). */
export function appOfPath(path: string): ImplementedApp | undefined {
  const first = path.split(/[/?#]/).filter(Boolean)[0] ?? "";
  const app = ROUTE_APP[first] ?? first;
  return IMPLEMENTED.has(app) ? (app as ImplementedApp) : undefined;
}
/** Whether this page may open for this business and login: the app must be on its launcher (required by the business type, allowed
 *  for the login, not hidden) and not locked by the plan. Pages outside the apps always open. */
export function mayOpenPath(path: string, launcher: Launcher): boolean {
  const app = appOfPath(path);
  if (!app) return true;
  if (app === "settings") return Boolean(launcher.settings);
  return launcher.apps.some((a) => a.id === app) && !launcher.locked.has(app);
}
