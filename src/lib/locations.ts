// Organisation locations: shops, stores and warehouses sharing one allowance from the plan. They are ERP records, so they are audited
// and synced. The first location is the shop itself, built in with a fixed id like the default units, so an existing
// single-shop customer already has it and two devices can never create it twice.
import { activeBusiness, atBusiness, commit, ErpError, heldAt, isAdmin, isStorageLocation, MAIN_BUSINESS, MAIN_LOCATION, MAX_COUNTERS, uid, viewedBusiness, type ErpState, type Location, type LocationType } from "@/lib/erp";
import { counterLimit, locationAllowance, loginAllowance, store } from "@/lib/shopbook";

export { MAIN_LOCATION };
const key = (t: string) => t.trim().toLowerCase();
export const isActiveLocation = (l: Location) => l.active !== false;

/** Every location in these records. The whole state includes the first business's built-in main shop, so the plan's allowance
 *  is shared across all the owner's businesses. Another business's own view (`scopeToBusiness`) holds only its own locations. */
export function listLocations(s: ErpState): Location[] {
  const view = viewedBusiness(s);
  if (view && view !== MAIN_BUSINESS) return s.locations.filter((l) => atBusiness(l, view));
  const main = s.locations.find((l) => l.id === MAIN_LOCATION) ?? { id: MAIN_LOCATION, name: store.get()?.shopName || "Main Shop", code: "MAIN", type: "shop" as const, createdAt: store.get()?.trialStart ?? 0 };
  return [main, ...s.locations.filter((l) => l.id !== MAIN_LOCATION)];
}

/** The active locations past the plan's allowance: the main location first, then oldest first, the same order the server flags them in. Nothing about them is changed. */
export function overPlanLocations(s: ErpState): Location[] {
  const live = listLocations(s).filter(isActiveLocation);
  const others = live.filter((l) => l.id !== MAIN_LOCATION).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return [...live.filter((l) => l.id === MAIN_LOCATION), ...others].slice(locationAllowance(store.get()));
}

export function locationUsage(s: ErpState) {
  const rows = listLocations(s), live = rows.filter(isActiveLocation), max = locationAllowance(store.get());
  const counts = { shops: live.filter((l) => l.type === "shop").length, stores: live.filter((l) => l.type === "store").length, warehouses: live.filter((l) => l.type === "warehouse").length };
  const people = s.employees.filter((e) => e.active && e.status !== "terminated" && e.memberId && e.accessRole);
  const managers = people.filter((e) => e.accessRole === "manager" || e.accessRole === "admin").length;
  return { max, active: live.length, available: Math.max(0, max - live.length), over: Math.max(0, live.length - max), ...counts, archived: rows.length - live.length, logins: loginAllowance(store.get(), counts, managers) };
}

const needOwner = () => { if (!isAdmin()) throw new ErpError("Only the owner can manage locations"); };
const PREFIX: Record<LocationType, string> = { shop: "SHOP", store: "STORE", warehouse: "WH" };
/** The next free number for a type, such as SHOP-002 or WH-001, among the codes already taken. */
export function suggestCode(type: LocationType, taken: readonly string[]) {
  const used = new Set(taken.map(key));
  for (let n = 1; ; n++) { const code = `${PREFIX[type]}-${String(n).padStart(3, "0")}`; if (!used.has(key(code))) return code; }
}
const nextCode = (rows: Location[], type: LocationType) => suggestCode(type, rows.map((l) => l.code));

export type LocationInput = { id?: string | undefined; name: string; code?: string | undefined; type: LocationType; address?: string | undefined; phone?: string | undefined; managerId?: string | undefined; connected?: string[] | undefined;
  /** Leave out to keep the photos the location already has. */
  photos?: string[] | undefined;
  /** A shop's number of counters (tills). Leave out to keep it; stores and warehouses have none. */
  counters?: number | undefined;
  /** Which business type this shop is (display only). Leave out to keep it; "" clears it. */
  placeType?: string | undefined;
  /** Leave out to keep the current logo; "" removes it. */
  logo?: string | undefined;
  /** A new location's business, when it is not the one being worked in (a new business's first location). A saved location keeps its own. */
  businessId?: string | undefined };
export const MAX_LOCATION_PHOTOS = 4;
export const saveLocation = (input: LocationInput) => commit((s, c) => {
  needOwner();
  const name = input.name.trim();
  if (!name) throw new ErpError("Enter a location name");
  if (input.type !== "shop" && input.type !== "store" && input.type !== "warehouse") throw new ErpError("Choose Shop, Store or Warehouse");
  const rows = listLocations(s), old = input.id ? rows.find((l) => l.id === input.id) : undefined;
  if (input.id && !old) throw new ErpError("Location not found");
  if (store.get()?.plan === "basic" && input.type !== "shop" && (!old || old.type !== input.type)) throw new ErpError("Basic allows one Shop and no Warehouse. Upgrade your plan to add a Warehouse");
  const others = rows.filter((l) => l.id !== input.id);
  // The business this location belongs to: a saved one keeps its own; a new one goes to the named business or the one being worked in.
  const business = old ? old.businessId ?? MAIN_BUSINESS : input.businessId ?? activeBusiness(s);
  if (!old && input.businessId && input.businessId !== MAIN_BUSINESS && !s.businesses.some((b) => b.id === input.businessId && b.active !== false)) throw new ErpError("Business not found");
  // Two businesses may each have a "Main Shop"; within one business the names differ.
  if (others.some((l) => atBusiness(l, business) && key(l.name) === key(name))) throw new ErpError("A location with this name already exists");
  const code = input.code?.trim() || old?.code || nextCode(rows, input.type);
  if (others.some((l) => key(l.code) === key(code))) throw new ErpError("A location with this code already exists");
  if (input.managerId && !s.employees.some((e) => e.id === input.managerId)) throw new ErpError("That manager was not found");
  const connected = input.type === "shop" ? (input.connected ?? old?.connected ?? []) : [];
  if (connected.some((id) => !others.some((l) => l.id === id && isStorageLocation(l)))) throw new ErpError("A shop can only connect to a store or warehouse");
  // A shop sees connected stock, so it may only connect to its own business's stores and warehouses.
  if (connected.some((id) => !others.some((l) => l.id === id && atBusiness(l, business)))) throw new ErpError("A shop can only connect to a store or warehouse of the same business");
  if (!old) {
    const u = locationUsage(s);
    if (u.active >= u.max) throw new ErpError(`Your plan allows ${u.max} active location${u.max === 1 ? "" : "s"}. Upgrade your plan or archive a location to add another`);
  }
  // Saves that don't mention photos (the setup page, imports) keep the ones already there.
  const photos = (input.photos ?? old?.photos ?? []).filter((p) => typeof p === "string" && p.startsWith("data:image/"));
  if (photos.length > MAX_LOCATION_PHOTOS) throw new ErpError(`A location can have up to ${MAX_LOCATION_PHOTOS} photos`);
  const logo = input.logo === undefined ? old?.logo : input.logo.startsWith("data:image/") ? input.logo : undefined;
  // A field the caller leaves out keeps its saved value, so a save from the setup page never wipes an address, phone or manager.
  const address = input.address === undefined ? old?.address : input.address.trim() || undefined;
  const phone = input.phone === undefined ? old?.phone : input.phone.trim() || undefined;
  const managerId = input.managerId === undefined ? old?.managerId : input.managerId || undefined;
  const counters = input.type === "shop" ? checkCounters(s, old, input.counters) : 1;
  const placeType = input.type !== "shop" ? undefined : input.placeType === undefined ? old?.placeType : input.placeType.trim().slice(0, 80) || undefined;
  const record: Location = { id: old?.id ?? uid(), name, code, type: input.type, address, phone, managerId, ...(connected.length ? { connected } : {}), ...(photos.length ? { photos } : {}), ...(logo ? { logo } : {}), ...(counters > 1 ? { counters } : {}), ...(placeType ? { placeType } : {}), createdAt: old?.createdAt || Date.now() };
  if (old?.active === false) record.active = false;
  // Kept on every save, so editing another business's location never moves it into the first business.
  if (business !== MAIN_BUSINESS) record.businessId = business;
  const i = s.locations.findIndex((l) => l.id === record.id);
  if (i >= 0) s.locations[i] = record; else s.locations.push(record);
  // The allowance is worked out from the current type on every read. Nobody assigned here is removed by a change of type.
  if (old && old.type !== input.type) c.audit("LOCATION TYPE CHANGED", `${code} • ${name} • ${old.type} → ${input.type}`);
  c.audit(old ? "LOCATION EDITED" : "LOCATION CREATED", `${code} • ${name} • ${input.type}`);
  return record;
});

/** A shop's counters within the plan: Basic 1, Growth up to 10 across all shops, Business up to 10 at each shop. Only a rise is
 *  checked, so after a smaller plan a shop keeps the counters it has (they show as over) and can still be edited or lowered. */
function checkCounters(s: ErpState, old: Location | undefined, wanted: number | undefined) {
  const before = Math.max(1, old?.counters ?? 1);
  if (wanted === undefined) return old?.type === "shop" ? before : 1;
  if (!Number.isInteger(wanted) || wanted < 1 || wanted > MAX_COUNTERS) throw new ErpError("Enter a number of counters from 1");
  if (wanted <= before) return wanted;
  const limit = counterLimit(store.get());
  if (limit.perShop) {
    if (wanted > limit.max) throw new ErpError(`Your plan allows up to ${limit.max} counters at each shop`);
  } else {
    const others = s.locations.filter((l) => l.id !== old?.id && l.type === "shop" && l.active !== false).reduce((n, l) => n + Math.max(1, l.counters ?? 1), 0);
    const mainCounted = s.locations.some((l) => l.id === MAIN_LOCATION) || old?.id === MAIN_LOCATION ? 0 : 1;
    if (others + mainCounted + wanted > limit.max) throw new ErpError(limit.max === 1 ? "Your plan allows 1 counter. Upgrade your plan to add counters" : `Your plan allows up to ${limit.max} counters in total`);
  }
  return wanted;
}

/** Archiving frees a slot and keeps the record. Bringing one back takes a free slot, and the last active location must stay. */
export const setLocationActive = (id: string, active: boolean) => commit((s, c) => {
  needOwner();
  const loc = listLocations(s).find((l) => l.id === id);
  if (!loc) throw new ErpError("Location not found");
  const u = locationUsage(s);
  if (active && !isActiveLocation(loc) && u.active >= u.max) throw new ErpError(`Your plan allows ${u.max} active location${u.max === 1 ? "" : "s"}. Upgrade your plan or archive another location first`);
  if (!active && isActiveLocation(loc) && u.active <= 1) throw new ErpError("At least one location must stay active");
  const next: Location = { ...loc }; if (active) delete next.active; else next.active = false;
  const i = s.locations.findIndex((l) => l.id === id);
  if (i >= 0) s.locations[i] = next; else s.locations.push(next);
  c.audit(active ? "LOCATION ACTIVATED" : "LOCATION ARCHIVED", `${loc.code} • ${loc.name}`);
});

export type StorageStock = { key: string; location: Location; productId: string; name: string; unit: string; qty: number };
/** Read-only: what each store and warehouse this device can see is holding. An employee's copy has only their own and their connected ones. */
export function storageStock(s: ErpState): StorageStock[] {
  const rows: StorageStock[] = [];
  for (const location of s.locations.filter((l) => isStorageLocation(l) && isActiveLocation(l))) {
    const here = new Set(s.movements.filter((m) => m.locationId === location.id).map((m) => m.productId));
    for (const p of s.products) {
      if (!here.has(p.id) || p.archived) continue;
      const qty = heldAt(s, p.id, location.id);
      if (qty > 0) rows.push({ key: `${location.id}:${p.id}`, location, productId: p.id, name: p.name, unit: p.unit ?? "", qty });
    }
  }
  return rows;
}
/** The shops allowed to view this store or warehouse. */
export const connectedShops = (s: ErpState, id: string) => listLocations(s).filter((l) => l.connected?.includes(id));
