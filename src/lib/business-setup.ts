// Business / Shop Setup: the one page after the plan. It edits a device-local draft; nothing becomes a record until
// Activate, which saves the business details, every location and every added person in one all-or-nothing step.
import * as erp from "@/lib/erp";
import { ErpError, isStorageLocation, runErpTransaction, type ErpState, type LocationType } from "@/lib/erp";
import { listLocations, MAIN_LOCATION, saveLocation, setLocationActive, suggestCode } from "@/lib/locations";

export { suggestCode };
import { saveEmployeeProfile } from "@/lib/people";
import { isManagerRole } from "@/lib/staff-access";
import { BUSINESS_TYPES as CATALOGUE_BUSINESS_TYPES, GENERAL_TRADE, businessTypeByName, isIndustryFamilyId, type IndustryFamilyId } from "@/lib/industry-config";
import { saveFeatures, type Features } from "@/lib/trade-features";
import { saveSettings } from "@/lib/settings-config";
import { PLANS, loginAllowance, store, type Account, type BusinessDocument, type LocationCounts, type PlanId } from "@/lib/shopbook";

/** New subscriptions create Shops or Stores. Older warehouse records remain supported as storage locations. */
export const NEW_LOCATION_TYPES = ["shop", "store"] as const;

/** Backwards-compatible name list; the source of truth is the approved industry catalogue. */
export const BUSINESS_TYPES = CATALOGUE_BUSINESS_TYPES.map((type) => type.name) as readonly string[];
export const TYPE_LABEL: Record<LocationType, string> = { shop: "Shop", store: "Warehouse", warehouse: "Warehouse" };

/** A row on the page. `savedId` marks a location that already exists; `archive` asks to archive it on activation.
 *  `connected` (shops only) lists the keys of the warehouse rows whose stock the shop may view: no extra location is used.
 *  `photos` and `logo` are data URLs, left out to keep a saved location's as they are. `code` is optional: left empty, the
 *  next free number (S001, W001…) is given on activation. The row's identity is `key` (a saved location's id), never its position. */
export type SetupRow = { key: string; savedId?: string | undefined; slotNumber?: number | undefined; type: LocationType; name: string; code: string; archive?: boolean | undefined; connected?: string[] | undefined; photos?: string[] | undefined; logo?: string | undefined;
  /** Added with "+ Add location" and no type chosen yet (owner, 2026-11-24): the type box says Choose type until one is picked. */
  untyped?: boolean | undefined;
  /** A shop's counters (tills); left out keeps the saved number. */
  counters?: number | undefined;
  /** Which of the chosen business types this shop is (Supermarket, Butchery…); left out: the main type. */
  placeType?: string | undefined;
  /** The location's address (optional); left out keeps the saved one. */
  address?: string | undefined;
  /** This shop's or warehouse's own phone (optional), printed on its receipts instead of the business number; left out keeps the saved one. */
  phone?: string | undefined;
  /** Per-location receipt details (owner, 2026-11-23): a heading line, opening hours and a tax PIN printed on this location's receipts
   *  instead of the business's. Left out: the business's own. */
  receiptHeader?: string | undefined; hours?: string | undefined; taxPin?: string | undefined;
  /** A shop's usual warehouse: transfers and restocking start from it. Must be one of its connected warehouses. */
  defaultWarehouse?: string | undefined;
};
/** A person added here. They become an employee record on activation; their login is invited from People & Access. */
export type SetupUser = { key: string; name: string; phone: string; email: string; role: string; locations: string[];
  /** Counters this person may use, per shop row key; a shop left out (or an empty list) means any counter. */
  counters?: Record<string, number[]> | undefined;
  /** This person's own access, as differences from their role (access-levels.ts); sent to the server once their login exists. */
  access?: Record<string, boolean> | undefined };
/** One industry and any number of its business types: the main type, then the others. For Trade none is needed (General Trade).
 *  `features` holds only the switches the owner changed on this page; the rest follow the types (trade-features.ts). */
export type SetupDraft = { businessName: string; businessType: string; otherType: string; extraBusinessTypes: string[]; industryFamilyId?: IndustryFamilyId | undefined; features?: Partial<Features> | undefined;
  /** The business's phone numbers (the second is optional). Left out: the account keeps what it has. */
  phone?: string | undefined; phone2?: string | undefined; phone3?: string | undefined;
  /** The business's tax number (KRA PIN or similar), for receipts; saved in its settings. */
  taxPin?: string | undefined;
  businessDocuments?: BusinessDocument[] | undefined;
  rows: SetupRow[]; users: SetupUser[] };

/** The draft's types, main first, with a skipped Trade type saved as General Trade. */
export function draftTypes(d: Pick<SetupDraft, "businessType" | "otherType" | "extraBusinessTypes" | "industryFamilyId">): string[] {
  const primary = d.businessType === "Other" ? d.otherType.trim() : d.businessType.trim();
  const all = [...new Set([primary, ...(d.extraBusinessTypes ?? []).map((t) => t.trim())].filter(Boolean))];
  const family = isIndustryFamilyId(d.industryFamilyId) ? d.industryFamilyId : businessTypeByName(all[0] ?? "")?.familyId;
  return all.length ? all : family === "trade" || family === undefined ? [GENERAL_TRADE] : [];
}

const DRAFT_KEY = "shopbook.setupDraft";
const norm = (t: string) => t.trim().toLowerCase();
export const newKey = () => Math.random().toString(36).slice(2, 10);

/** The plan this setup is for: the paid plan, or during the trial the plan the owner picked (Business if none). */
export function setupPlan(a: Pick<Account, "plan" | "trialChoice"> | null) {
  const id: PlanId = a?.plan && a.plan !== "trial" ? a.plan : a?.trialChoice ?? "business";
  return PLANS.find((p) => p.id === id)!;
}

export const liveRows = (rows: readonly SetupRow[]) => rows.filter((r) => !r.archive);
export function countTypes(rows: readonly SetupRow[]): LocationCounts {
  const live = liveRows(rows);
  return { shops: live.filter((r) => r.type === "shop").length, stores: live.filter((r) => r.type === "store").length, warehouses: live.filter((r) => r.type === "warehouse").length };
}

/** One pool of logins for the whole plan (loginAllowance): a person counts once, wherever they work. No location has its own limit. */
export function loginSummary(
  planId: PlanId,
  users: readonly SetupUser[],
  existing: readonly { memberId?: string | undefined; accessRole?: string | undefined; active: boolean; status?: string | undefined; locationIds?: string[] | undefined }[] = [],
  rows: readonly SetupRow[] = [],
) {
  const active = existing.filter((e) => !!e.memberId && e.status !== "terminated" && (e.active || e.status === "suspended"));
  const people = [
    ...active.map((e) => ({ role: e.accessRole ?? "", locations: e.locationIds ?? [] })),
    ...users.map((u) => ({ role: u.role, locations: u.locations })),
  ];
  const usedManagers = people.filter((p) => isManagerRole(p.role)).length;
  const counts = countTypes(rows);
  const allow = loginAllowance({ plan: planId }, counts, usedManagers);
  const byKey = new Map(liveRows(rows).map((r) => [r.key, r]));
  const usedShopkeepers = people.reduce((n, p) => n + (p.role === "shopkeeper" ? p.locations.filter((k) => byKey.get(k)?.type === "shop").length : 0), 0);
  const usedStorekeepers = people.reduce((n, p) => n + (p.role === "warehouse_staff" ? p.locations.filter((k) => ["store", "warehouse"].includes(byKey.get(k)?.type ?? "")).length : 0), 0);
  return { ...allow, usedManagers, usedStaff: people.length - usedManagers, usedShopkeepers, usedStorekeepers, used: 1 + people.length };
}

/** Locations that exist now become the first rows, in their saved order; archived ones stay out of the table. */
export function rowsFromRecords(s: ErpState): SetupRow[] {
  return listLocations(s).filter((l) => l.active !== false).map((l, index) => ({ key: l.id, savedId: l.id, slotNumber: index + 1, type: l.type, name: l.name, code: l.id === MAIN_LOCATION && l.code === "MAIN" ? "" : l.code, ...(l.connected?.length ? { connected: [...l.connected] } : {}), ...(l.counters && l.counters > 1 ? { counters: l.counters } : {}), ...(l.placeType ? { placeType: l.placeType } : {}), ...(l.address ? { address: l.address } : {}), ...(l.phone ? { phone: l.phone } : {}), ...(l.receiptHeader ? { receiptHeader: l.receiptHeader } : {}), ...(l.hours ? { hours: l.hours } : {}), ...(l.taxPin ? { taxPin: l.taxPin } : {}), ...(l.defaultWarehouse ? { defaultWarehouse: l.defaultWarehouse } : {}) }));
}

/** Rows grow or shrink to the chosen number. New rows are shops with the next free number; trailing rows are removed,
 *  except saved ones, which are returned so the page can ask before archiving them. */
export function resize(rows: SetupRow[], count: number, otherCodes: readonly string[]): { rows: SetupRow[]; needsConfirm: SetupRow[] } {
  const live = liveRows(rows);
  if (count >= live.length) {
    const next = [...rows];
    while (liveRows(next).length < count) next.push({ key: newKey(), type: "shop", name: "", code: suggestCode("shop", [...otherCodes, ...next.map((r) => r.code)]) });
    return { rows: next, needsConfirm: [] };
  }
  const drop = live.slice(count);
  const saved = drop.filter((r) => r.savedId);
  return { rows: rows.filter((r) => !drop.includes(r) || r.savedId), needsConfirm: saved };
}

export type SetupProblem = { key?: string; field: string; message: string };
/** Everything Activate needs, checked on the device before the engine checks it again. */
/** `loginRoom` is how many more people with a login the plan has room for; `managerRoom` how many of those may be admins or managers. */
export function validate(
  d: SetupDraft,
  maxLocations: number,
  loginRoom: number,
  managerRoom: number,
  otherCodes: readonly string[],
  otherNames: readonly string[],
  staffing?: { planId: PlanId; existing: Parameters<typeof loginSummary>[2] },
): SetupProblem[] {
  const out: SetupProblem[] = [];
  if (!d.businessName.trim()) out.push({ field: "businessName", message: "Enter the business name" });
  for (const [field, v] of [["phone", d.phone], ["phone2", d.phone2], ["phone3", d.phone3]] as const) {
    const digits = (v ?? "").replace(/\D/g, "");
    if ((v ?? "").trim() && (digits.length < 7 || digits.length > 15 || !/^\+?[0-9][0-9 ()-]*[0-9]$/.test((v ?? "").trim()))) out.push({ field, message: "Enter a valid phone number" });
  }
  const primary = d.businessType === "Other" ? d.otherType.trim() : d.businessType.trim();
  const catalogType = businessTypeByName(primary);
  // For Trade the type is optional: a skipped type is saved as General Trade.
  const tradeFamily = (isIndustryFamilyId(d.industryFamilyId) ? d.industryFamilyId : "trade") === "trade";
  // "Other" (older drafts) still needs its own name typed.
  if (!primary && (!tradeFamily || d.businessType === "Other")) out.push({ field: "businessType", message: "Choose the business type" });
  else if (d.industryFamilyId !== undefined && !isIndustryFamilyId(d.industryFamilyId)) out.push({ field: "businessType", message: "Choose a valid industry" });
  else if (catalogType && d.industryFamilyId && catalogType.familyId !== d.industryFamilyId) out.push({ field: "businessType", message: "Choose a business type in the selected industry" });
  // Any number of business types, all in the selected industry. The extra list is optional. When the industry is not set
  // explicitly, it follows the primary type (as Activate does), so extras are checked against it.
  const familyId = isIndustryFamilyId(d.industryFamilyId) ? d.industryFamilyId : catalogType?.familyId;
  const extras = (d.extraBusinessTypes ?? []).map((t) => t.trim()).filter(Boolean);
  for (const name of extras) {
    const type = businessTypeByName(name);
    if (!type) out.push({ field: "businessType", message: `“${name}” is not a business type` });
    else if (familyId && type.familyId !== familyId) out.push({ field: "businessType", message: `“${name}” is not in the selected industry` });
  }
  const live = liveRows(d.rows);
  if (!live.length) out.push({ field: "rows", message: "Set up at least one location" });
  if (live.length > maxLocations) out.push({ field: "rows", message: `Your plan allows ${maxLocations} location${maxLocations === 1 ? "" : "s"}` });
  const codes = new Map<string, number>(), names = new Map<string, number>();
  for (const r of live) { if (r.code.trim()) codes.set(norm(r.code), (codes.get(norm(r.code)) ?? 0) + 1); names.set(norm(r.name), (names.get(norm(r.name)) ?? 0) + 1); }
  for (const r of live) {
    const label = TYPE_LABEL[r.type];
    if (r.untyped) out.push({ key: r.key, field: "type", message: "Choose the type of this location" });
    if (!r.name.trim()) out.push({ key: r.key, field: "name", message: `Enter the ${label.toLowerCase()} name` });
    else if ((names.get(norm(r.name)) ?? 0) > 1 || otherNames.some((n) => norm(n) === norm(r.name))) out.push({ key: r.key, field: "name", message: `“${r.name.trim()}” is used by another location` });
    // The number is optional; one that is given must be unique.
    if (r.code.trim() && ((codes.get(norm(r.code)) ?? 0) > 1 || otherCodes.some((c) => norm(c) === norm(r.code)))) out.push({ key: r.key, field: "code", message: `${r.code.trim()} is used by another location` });
    // The location's own phone is optional; one that is given must look like a phone number.
    const phone = (r.phone ?? "").trim(), phoneDigits = phone.replace(/\D/g, "");
    if (phone && (phoneDigits.length < 7 || phoneDigits.length > 15 || !/^\+?[0-9][0-9 ()-]*[0-9]$/.test(phone))) out.push({ key: r.key, field: "phone", message: "Enter a valid phone number" });
  }
  const managers = d.users.filter((u) => isManagerRole(u.role)).length;
  if (staffing) {
    const plan = PLANS.find((p) => p.id === staffing.planId)!;
    const before = loginSummary(staffing.planId, [], staffing.existing, live);
    const after = loginSummary(staffing.planId, d.users, staffing.existing, live);
    if (d.users.length && after.used > after.total) out.push({ field: "users", message: "Your plan does not have enough logins for these users" });
    if (d.users.length && after.usedManagers > plan.maxManagers) out.push({ field: "users", message: "Your plan does not have any more manager positions" });
    // Staff have their own part of the plan (Basic 1, Growth 10, Business 20): empty manager places never become staff places.
    if (d.users.length && after.usedStaff > after.staff && after.usedStaff > before.usedStaff) out.push({ field: "users", message: `Your plan allows ${after.staff} staff account${after.staff === 1 ? "" : "s"}, shared across all your businesses` });
    if (d.users.length && before.used > before.total) out.push({ field: "users", message: "Your account is already over its login allowance. Upgrade or remove a login before adding another" });
    for (const u of d.users) {
      for (const key of u.locations) {
        const row = live.find((r) => r.key === key);
        if (!row) continue;
        if (u.role === "shopkeeper" && row.type !== "shop") out.push({ key: u.key, field: "users", message: "A Shopkeeper can only be assigned to a Shop" });
        if (u.role === "warehouse_staff" && row.type === "shop") out.push({ key: u.key, field: "users", message: "A Storekeeper can only be assigned to a Warehouse" });
      }
    }
  } else if (d.users.length > loginRoom) out.push({ field: "users", message: loginRoom <= 0 ? "Your plan has no more login accounts" : `Your plan has room for ${loginRoom} more login account${loginRoom === 1 ? "" : "s"}` });
  else if (managers > managerRoom) out.push({ field: "users", message: managerRoom === 0 ? "This plan has no manager logins" : `This plan allows ${managerRoom} more manager login${managerRoom === 1 ? "" : "s"}` });
  for (const u of d.users) if (!u.locations.some((k) => live.some((r) => r.key === k))) out.push({ key: u.key, field: "users", message: `Choose a location for ${u.name}` });
  return out;
}

export const readDraft = (): SetupDraft | null => {
  try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); return d && Array.isArray(d.rows) && Array.isArray(d.users) ? d : null; } catch { return null; }
};
export const saveDraft = (d: SetupDraft) => localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
export const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

/** Activate: business details, locations and people in one step. If anything is refused, nothing is saved. */
export function activateSetup(d: SetupDraft) {
  const businessTypes = draftTypes(d);
  const businessType = businessTypes[0] ?? "";
  const industryFamilyId = isIndustryFamilyId(d.industryFamilyId) ? d.industryFamilyId : businessTypeByName(businessType)?.familyId;
  const businessId = store.get()?.businessId ?? "";
  const currentBefore = erp.load();
  const linkedPeople = currentBefore.employees.filter((e) => e.memberId && e.active && e.status !== "terminated" && e.accessRole);
  const plan = setupPlan(store.get());
  const staffingProblems = validate(d, plan.locations, 0, 0, [], [], { planId: plan.id, existing: linkedPeople });
  if (staffingProblems.length) throw new ErpError(staffingProblems[0]!.message);
  const ids = runErpTransaction(() => {
    const map: Record<string, string> = {};
    // Archive first, so a freed slot can take a new location.
    for (const r of d.rows.filter((x) => x.archive && x.savedId)) setLocationActive(r.savedId!, false);
    // An empty number gets the next free one, in row order, skipping every number already saved or typed on any row.
    const taken = [...listLocations(erp.load()).map((l) => l.code), ...liveRows(d.rows).map((r) => r.code.trim()).filter(Boolean)];
    const live = liveRows(d.rows).sort((a, b) => (a.slotNumber ?? 0) - (b.slotNumber ?? 0)).map((r) => { if (r.code.trim()) return r; const code = suggestCode(r.type, taken); taken.push(code); return { ...r, code }; });
    for (const r of live) {
      const saved = saveLocation({ id: r.savedId, name: r.name, code: r.code, type: r.type, photos: r.photos, logo: r.logo, ...(r.type === "shop" && r.counters !== undefined ? { counters: r.counters } : {}), ...(r.type === "shop" && r.placeType ? { placeType: r.placeType } : {}), ...(r.address !== undefined ? { address: r.address } : {}), ...(r.phone !== undefined ? { phone: r.phone.trim() || undefined } : {}), ...(r.receiptHeader !== undefined ? { receiptHeader: r.receiptHeader } : {}), ...(r.hours !== undefined ? { hours: r.hours } : {}), ...(r.taxPin !== undefined ? { taxPin: r.taxPin } : {}) });
      map[r.key] = saved.id;
    }
    // Connections need every warehouse saved first. They are shops' viewing rights only: no stock moves and no slot is used.
    const s = erp.load();
    for (const r of live.filter((x) => x.type === "shop")) {
      const want = (r.connected ?? []).map((k) => map[k] ?? k).filter((id) => listLocations(s).some((l) => l.id === id && isStorageLocation(l) && l.active !== false));
      const loc = listLocations(s).find((l) => l.id === map[r.key])!;
      const now = loc.connected ?? [];
      // The usual warehouse (suggestion 4) must be one of the shop's connections; otherwise it is cleared.
      const usualRaw = r.defaultWarehouse ? map[r.defaultWarehouse] ?? r.defaultWarehouse : "";
      const usual = usualRaw && want.includes(usualRaw) ? usualRaw : "";
      if (want.length !== now.length || want.some((id) => !now.includes(id)) || usual !== (loc.defaultWarehouse ?? "")) saveLocation({ id: loc.id, name: loc.name, code: loc.code, type: loc.type, address: loc.address, phone: loc.phone, managerId: loc.managerId, connected: want, defaultWarehouse: usual });
    }
    for (const u of d.users) {
      const locationIds = u.locations.map((k) => map[k]).filter((x): x is string => !!x);
      if (!locationIds.length) throw new ErpError(`Choose a location for ${u.name}`);
      const counters = u.counters ? Object.fromEntries(Object.entries(u.counters).map(([k, v]) => [map[k] ?? k, v])) : undefined;
      saveEmployeeProfile({ name: u.name, phone: u.phone, email: u.email, code: "", businessRefs: [businessId], locationIds, accessRole: u.role, startDate: "", employmentType: "Full-time", ...(counters ? { counters } : {}), ...(u.access && Object.keys(u.access).length ? { access: u.access } : {}) });
    }
    // Recheck the dynamic account total here too; backend check_login_allowance enforces each server login separately.
    const current = erp.load();
    const savedRows = rowsFromRecords(current);
    const people = current.employees.filter((e) => e.active && e.status !== "terminated" && e.memberId && e.accessRole);
    const usedManagers = people.filter((e) => isManagerRole(e.accessRole)).length;
    const total = loginAllowance(store.get(), countTypes(savedRows), usedManagers).total;
    const used = 1 + people.length;
    if (d.users.length && used > total) throw new ErpError(`Your plan allows ${total} login accounts, including the owner`);
    return map;
  });
  // The account lives outside the ERP records, so it is updated once the records are safely saved.
  const phones = { ...(d.phone !== undefined ? { phone: d.phone.trim() } : {}), ...(d.phone2 !== undefined ? { phone2: d.phone2.trim() || undefined } : {}), ...(d.phone3 !== undefined ? { phone3: d.phone3.trim() || undefined } : {}) };
  store.update({ shopName: d.businessName.trim(), businessType: undefined, businessTypes, ...(industryFamilyId ? { industryFamilyId } : {}), ...phones, ...(d.businessDocuments !== undefined ? { businessDocuments: d.businessDocuments } : {}), setupPending: undefined });
  // Only the switches the owner changed here are saved; the others keep following the business types.
  if (d.features && Object.keys(d.features).length) saveFeatures(d.features);
  if (d.taxPin !== undefined) saveSettings({ taxPin: d.taxPin.trim().toUpperCase() });
  clearDraft();
  return ids;
}
