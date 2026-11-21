// The owner's view of People & Access: one shared copy for all six panels. Every change goes to the server, then this reloads.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { load } from "@/lib/erp";
import { isActiveLocation, listLocations } from "@/lib/locations";
import { loadPeople, myAccess, ownerBusinessContext, peopleCall } from "@/lib/people-access.functions";
import { store } from "@/lib/shopbook";

export type Member = { id: string; employeeRef: string | null; code: string | null; name: string; email: string | null; phone: string | null; role: string; status: "invited" | "active" | "suspended" | "revoked"; hasLogin: boolean; lastLoginAt: string | null; terminatedAt: string | null; createdAt: string; businesses: string[]; locations: string[]; overrides: Record<string, boolean> };
export type Invitation = { id: string; memberId: string; kind: "invite" | "reset"; createdAt: string; expiresAt: string; sentVia: string | null; sentAt: string | null; sendError: string | null; status: "Pending" | "Accepted" | "Expired" | "Revoked" };
export type LoginEvent = { id: string; memberId: string | null; identifier: string; success: boolean; reason: string | null; ip: string | null; userAgent: string | null; at: string };
export type Overview = {
  usage: { plan_id: string; status: string; usable: boolean; max_users: number; active_users: number; available_users: number; excess_users: number; max_locations: number; active_locations: number; available_locations: number; excess_locations: number; shops: number; stores: number; warehouses: number; max_managers: number; active_managers: number; available_managers: number; excess_managers: number; employee_slots: number; active_employees: number; available_employees: number; excess_employees: number };
  plans: { id: string; name: string; locations: number }[];
  businesses: { id: string; name: string; legacyId: string | null }[];
  locations: { id: string; name: string; kind: "shop" | "store" | "warehouse"; businessId: string; erpRef: string | null; status: string }[];
  /** Each active location's employee logins against what its type allows. */
  allowances: { locationId: string; allowance: number; employees: number }[];
  members: Member[]; invitations: Invitation[];
  permissions: { key: string; ownerOnly: boolean }[];
  roleDefaults: { role: string; key: string }[]; roleChanges: { role: string; key: string; allowed: boolean }[];
  logins: LoginEvent[]; activity: { id: string; userId: string | null; action: string; recordId: string | null; at: string }[];
};
export type IssuedLink = { link: string; expiresAt: string; delivery: { sent: boolean; via: string | null; error: string | null } };
export type Cloud = { phase: "idle" | "checking" | "signed-out" | "ready" | "error"; account?: string | undefined; business?: string | undefined; data?: Overview | undefined; providers?: { email: boolean; sms: boolean } | undefined; error?: string | undefined; warning?: string | undefined; links: Record<string, IssuedLink> };

let cloud: Cloud = { phase: "idle", links: {} };
const EVT = "shopbook-people";
const publish = (next: Partial<Cloud>) => { cloud = { ...cloud, ...next }; window.dispatchEvent(new Event(EVT)); };

export function friendly(e: unknown) {
  const m = e instanceof Error ? e.message : "Failed";
  return m.replace(/^(USER_LIMIT|MANAGER_LIMIT|LOCATION_USER_LIMIT|LOCATION_LIMIT|SUBSCRIPTION_INACTIVE): /, "").replace(/^./, (c) => c.toUpperCase());
}

export async function reloadPeople() {
  if (!cloud.account) return;
  const r = await loadPeople({ data: { account: cloud.account } });
  publish({ phase: "ready", data: JSON.parse(r.overview) as Overview, providers: r.providers, error: undefined });
}

/** Copies this device's locations to the server, so they can be assigned and enforced there. */
async function mirrorLocations(business: string) {
  const problems: string[] = [];
  for (const l of listLocations(load())) {
    try { await peopleCall({ data: { fn: "sync_location", args: { p_business: business, p_ref: l.id, p_name: l.name, p_code: l.code, p_kind: l.type, p_active: isActiveLocation(l) } } }); }
    catch (e) { problems.push(`${l.name}: ${friendly(e)}`); }
  }
  return problems;
}

export async function connectPeople() {
  publish({ phase: "checking", error: undefined });
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { publish({ phase: "signed-out" }); return; }
    const a = store.get();
    if (!a || a.staff) return;
    const identity = await myAccess();
    if (identity.kind !== "owner") throw new Error("This central identity is not an owner. Employee access remains controlled by its invitation and permissions.");
    const context = await ownerBusinessContext();
    const business = context.businesses.find((b) => b.legacy_business_id === a.businessId);
    if (!business) throw new Error("This local business has not been verified and migrated to this central identity. Use Verify and migrate existing owner account first.");
    const problems = await mirrorLocations(business.id);
    publish({ account: context.account, business: business.id, warning: problems.join(" • ") || undefined });
    await reloadPeople();
  } catch (e) { publish({ phase: "error", error: friendly(e) }); }
}

/** The newest copy, for a step that has just reloaded. */
export const peopleData = () => cloud.data;
/** The whole connection state, for a step outside People & Access (Business Setup sends invitations too). */
export const peopleCloud = () => cloud;
export function rememberLink(memberId: string, issued: IssuedLink) { publish({ links: { ...cloud.links, [memberId]: issued } }); }
export const mirrorErpLocations = () => (cloud.business ? mirrorLocations(cloud.business) : Promise.resolve([]));

export function usePeopleCloud() {
  const [, tick] = useState(0);
  useEffect(() => {
    const f = () => tick((n) => n + 1);
    window.addEventListener(EVT, f);
    if (cloud.phase === "idle") void connectPeople();
    const auth = supabase.auth.onAuthStateChange(() => { if (cloud.phase === "signed-out") void connectPeople(); });
    return () => { window.removeEventListener(EVT, f); auth.data.subscription.unsubscribe(); };
  }, []);
  return cloud;
}
