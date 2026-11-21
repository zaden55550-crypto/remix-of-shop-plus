// Server side of Settings › People & Access and of employee sign-in. Owner calls run as the signed-in person, so the
// database checks every one of them. The admin client is used only for what the sign-in system needs: creating a login,
// setting a password, and looking up a login before anyone is signed in.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { filterForStaff, staffScope, type BusinessMembership } from "@/lib/staff-access";
import { buildStaffChange } from "@/lib/staff-record";
import type { ErpState, StaffIntent } from "@/lib/erp";

const untyped = (c: unknown) => c as SupabaseClient; // These tables are newer than the generated types.
const admin = async () => untyped((await import("@/integrations/supabase/client.server")).supabaseAdmin);
const call = async <T = unknown>(c: SupabaseClient, fn: string, args: Record<string, unknown> = {}) => {
  const r = await c.rpc(fn, args);
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};
const inviteLink = (token: string) => `${new URL(getRequest().url).origin}/invite#${token}`;
const delivery = () => import("@/lib/people-delivery.server");
const firstRow = <T,>(d: T | T[]) => (Array.isArray(d) ? d[0] : d) as T;
type Issued = { invitation_id: string; token: string; expires_at: string; member_id?: string };

/** Sends the link if a provider is set up and records the true result. The link is handed back once, to the owner only. */
async function send(issued: Issued) {
  const a = await admin(), link = inviteLink(issued.token), { deliverLink } = await delivery();
  const result = await deliverLink(await call(a, "invitation_contact", { p_invitation: issued.invitation_id }), link);
  await call(a, "mark_invitation_sent", { p_invitation: issued.invitation_id, p_via: result.via, p_error: result.sent ? null : result.error });
  return { link, expiresAt: issued.expires_at, invitationId: issued.invitation_id, memberId: issued.member_id, delivery: result };
}

// ---------- Owner ----------
export const connectOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ accountName: z.string().min(1).max(160), fullName: z.string().max(160), legacyBusiness: z.string().min(1).max(160), businessName: z.string().min(1).max(160), currency: z.string().min(1).max(12), country: z.string().max(80).optional() }).parse(v))
  .handler(async ({ data, context }) => call<{ account: string; business: string }>(untyped(context.supabase), "connect_owner", { p_account_name: data.accountName, p_full_name: data.fullName, p_legacy_business: data.legacyBusiness, p_business_name: data.businessName, p_currency: data.currency, p_country: data.country ?? null }));

/** Completes an explicitly confirmed migration after client-side local-password verification and verified central sign-in.
 * The server RPC independently validates the central identity and every ownership/business conflict. */
export const reconcileLegacyOwner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ legacyBusiness: z.string().min(1).max(160), businessName: z.string().min(1).max(160), currency: z.string().min(1).max(12), country: z.string().max(80).optional(), confirm: z.literal(true) }).parse(v))
  .handler(async ({ data, context }) => call<{ status: "complete" | "manual_reconciliation"; account?: string; business?: string; reason?: string }>(untyped(context.supabase), "reconcile_legacy_owner", { p_legacy_business: data.legacyBusiness, p_business_name: data.businessName, p_currency: data.currency, p_country: data.country ?? null, p_confirm: data.confirm }));

export const ownerMigrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ legacyBusiness: z.string().min(1).max(160) }).parse(v))
  .handler(async ({ data, context }) => call<{ status: "not_started" | "pending" | "complete" | "manual_reconciliation"; account?: string; reason?: string }>(untyped(context.supabase), "owner_migration_status", { p_legacy_business: data.legacyBusiness }));

export const recordOwnerIdentityLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ provider: z.enum(["email", "google", "apple"]) }).parse(v))
  .handler(async ({ data, context }) => call<number>(untyped(context.supabase), "record_owner_identity_link", { p_provider: data.provider }));

export const loadPeople = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ account: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const c = untyped(context.supabase), overview = await call<Record<string, unknown>>(c, "people_overview", { p_account: data.account });
    return { overview: JSON.stringify({ ...overview, allowances: await call(c, "account_entitlements", { p_account: data.account }) }), providers: (await delivery()).providerStatus() };
  });

/** Plain changes. Each function named here checks the caller itself in the database. */
const OWNER_CALLS = ["sync_location", "revoke_invitation", "revoke_member_sessions", "revoke_member", "update_member_access", "update_member_profile", "set_member_permission", "clear_member_permissions", "set_role_permission"] as const;
export const peopleCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ fn: z.enum(OWNER_CALLS), args: z.record(z.unknown()) }).parse(v))
  .handler(async ({ data, context }) => { const out = await call<unknown>(untyped(context.supabase), data.fn, data.args); return { result: (out ?? null) as string | null }; });

export const createEmployeeLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ account: z.string().uuid(), employeeRef: z.string().min(1).max(100), fullName: z.string().min(1).max(160), phone: z.string().max(40).nullable(), email: z.string().max(200).nullable(), code: z.string().max(40).nullable(), role: z.string().max(40), businesses: z.array(z.string().uuid()), locations: z.array(z.string().uuid()) }).parse(v))
  .handler(async ({ data, context }) => send(firstRow(await call<Issued | Issued[]>(untyped(context.supabase), "create_login", { p_account: data.account, p_employee_ref: data.employeeRef, p_full_name: data.fullName, p_phone: data.phone, p_email: data.email, p_code: data.code, p_role: data.role, p_businesses: data.businesses, p_locations: data.locations }))));

export const renewInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ member: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => send(firstRow(await call<Issued | Issued[]>(untyped(context.supabase), "new_invitation", { p_member: data.member }))));

export const issueAccessReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ member: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => send(firstRow(await call<Issued | Issued[]>(untyped(context.supabase), "create_access_reset", { p_member: data.member }))));

/** The database decision comes first and stands by itself; the sign-in system is then told too, so a new sign-in is refused at the door. */
export const setLoginState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ member: z.string().uuid(), action: z.enum(["suspend", "reactivate", "terminate"]) }).parse(v))
  .handler(async ({ data, context }) => {
    const fn = { suspend: "suspend_member", reactivate: "reactivate_member", terminate: "terminate_member" }[data.action];
    const user = await call<string | null>(untyped(context.supabase), fn, { p_member: data.member });
    if (user) {
      const r = await (await admin()).auth.admin.updateUserById(user, { ban_duration: data.action === "reactivate" ? "none" : "876000h" });
      if (r.error) console.error("[people] sign-in block not updated", r.error.message);
    }
    return { ok: true };
  });

// ---------- Invitation page: nobody is signed in yet, so the link itself is the proof ----------
const Token = z.string().regex(/^[0-9a-f]{64}$/);
export const invitationInfo = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ token: Token }).parse(v))
  .handler(async ({ data }) => call<{ valid: boolean; kind?: string; shop?: string; name?: string; role?: string; expiresAt?: string; usesEmail?: boolean; usesPhone?: boolean }>(await admin(), "invitation_details", { p_token: data.token }));

export const acceptInvitation = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ token: Token, contact: z.string().min(3).max(200), password: z.string().min(8).max(200) }).parse(v))
  .handler(async ({ data }) => {
    const a = await admin();
    const check = await call<{ ok: boolean; reason?: string; kind?: string; loginEmail?: string; userId?: string | null }>(a, "verify_invitation", { p_token: data.token, p_contact: data.contact });
    if (!check.ok) throw new Error(check.reason === "contact" ? "That phone number or email doesn't match this invitation" : "This invitation is not valid");
    let user = check.userId ?? null, created = false;
    if (user) {
      const r = await a.auth.admin.updateUserById(user, { password: data.password, ban_duration: "none" });
      if (r.error) throw new Error(r.error.message);
    } else {
      const r = await a.auth.admin.createUser({ email: check.loginEmail ?? "", password: data.password, email_confirm: true });
      if (r.error || !r.data.user) throw new Error(/already/i.test(r.error?.message ?? "") ? "This email already has a Zakrio Systems login. Ask your employer to use another email or your phone number." : r.error?.message ?? "Could not create the login");
      user = r.data.user.id; created = true;
    }
    try { await call(a, "finish_invitation", { p_token: data.token, p_user: user }); }
    catch (e) { if (created) await a.auth.admin.deleteUser(user); throw e; }
    return { ok: true };
  });

// ---------- Employee sign-in: the same auth system as the owner's, with history and a limit on guessing ----------
const WRONG = "Business name, email or password is incorrect";
export const employeeSignIn = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ identifier: z.string().min(3).max(200), password: z.string().min(1).max(200) }).parse(v))
  .handler(async ({ data }) => {
    const a = await admin(), req = getRequest();
    const who = await call<{ found: boolean; failures: number; memberId?: string; account?: string; status?: string; loginEmail?: string }>(a, "resolve_login", { p_identifier: data.identifier });
    const log = (success: boolean, reason: string | null) => call(a, "record_login", { p_identifier: data.identifier, p_account: who.account ?? null, p_member: who.memberId ?? null, p_success: success, p_reason: reason, p_ip: req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for") ?? "", p_agent: req.headers.get("user-agent") ?? "" });
    if (who.failures >= 5) { await log(false, "Too many attempts"); throw new Error("Too many failed attempts. Wait 15 minutes and try again."); }
    if (!who.found || who.status !== "active") { await log(false, who.found ? `Login ${who.status}` : "Unknown login"); throw new Error(WRONG); }
    const url = process.env["SUPABASE_URL"], key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) throw new Error("Sign-in isn't available right now");
    const r = await createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth.signInWithPassword({ email: who.loginEmail ?? "", password: data.password });
    if (r.error || !r.data.session) { await log(false, "Wrong password"); throw new Error(WRONG); }
    await log(true, null);
    return { accessToken: r.data.session.access_token, refreshToken: r.data.session.refresh_token };
  });

// ---------- What an employee's device gets ----------
export type MyAccess = { kind: "owner"; account: string } | { kind: "none" } | { kind: "blocked"; reason: string } | { kind: "member"; account: string; memberId: string; employeeRef: string | null; fullName: string; email: string | null; phone: string | null; role: string; plan: string; subscription: string; trialEndsAt: string | null;
  /** False after the employer's trial has ended: the login still views and exports what it may, but records nothing. Missing on a database before 0014 (treated as true). */
  writable?: boolean; businesses: { id: string; name: string; currency: string }[]; locations: { id: string; name: string; kind: "shop" | "store" | "warehouse"; businessId: string; erpRef: string | null }[]; permissions: string[] };

export const myAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => call<MyAccess>(untyped(context.supabase), "my_access"));

/** Owner businesses and locations are derived from auth.uid() under the database's RLS, never from client-selected IDs. */
export const ownerBusinessContext = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const c = untyped(context.supabase), me = await call<MyAccess>(c, "my_access");
    if (me.kind !== "owner") throw new Error(me.kind === "blocked" ? me.reason : "This identity does not own a business");
    const [businesses, locations, subscription, syncBinding] = await Promise.all([
      c.from("businesses").select("id,name,currency,legacy_business_id").eq("owner_account_id", me.account).is("archived_at", null).order("created_at"),
      c.from("locations").select("id,name,kind,business_id,erp_ref,status").eq("owner_account_id", me.account).eq("status", "active").order("created_at"),
      c.from("owner_subscriptions").select("plan_id,status,billing_cycle,trial_ends_at").eq("owner_account_id", me.account).maybeSingle(),
      c.from("shopbook_sync_business").select("business_id").eq("user_id", context.userId).maybeSingle(),
    ]);
    if (businesses.error) throw new Error(businesses.error.message);
    if (locations.error) throw new Error(locations.error.message);
    if (subscription.error) throw new Error(subscription.error.message);
    if (syncBinding.error) throw new Error(syncBinding.error.message);
    return { kind: "owner" as const, account: me.account, businesses: businesses.data ?? [], locations: locations.data ?? [], subscription: subscription.data, syncBusiness: syncBinding.data?.business_id ?? null };
  });

/** The caller's business memberships (proposed 0020), or null on a database without them, where the seat's one access set applies as before. */
async function memberships(client: Parameters<typeof untyped>[0], account: string): Promise<BusinessMembership[] | null> {
  // The account my_access chose: a person with seats at two owners never mixes one owner's records with another's permissions.
  try { return await call<BusinessMembership[]>(untyped(client), "member_business_access", { p_account: account }); }
  catch (e) { if (/member_business_access|does not exist|Could not find the function/i.test((e as Error).message)) return null; throw e; }
}

/** Worked out from the caller's own verified access, never from anything the browser sends. The device may ask for a business or a
 *  location; it gets one only if the login holds it, and only that business's records. */
export const staffSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ location: z.string().uuid().optional(), business: z.string().regex(/^(biz-main|[a-z0-9]{6,40})$/).optional() }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    const me = await call<MyAccess>(untyped(context.supabase), "my_access");
    if (me.kind !== "member") throw new Error("Not allowed");
    const held = await memberships(context.supabase, me.account);
    const scope = staffScope(me, held, { location: data.location, business: data.business });
    const a = await admin();
    const owner = await a.from("owner_accounts").select("owner_user_id").eq("id", me.account).single();
    if (owner.error) throw new Error(owner.error.message);
    const row = await a.from("shopbook_shop_sync").select("payload,updated_at").eq("user_id", owner.data.owner_user_id).maybeSingle();
    if (row.error) throw new Error(row.error.message);
    const state = filterForStaff((row.data?.payload ?? {}) as Partial<ErpState>, { permissions: scope.permissions, employeeRef: me.employeeRef, locationRefs: scope.locationRefs, activeRef: scope.activeRef, business: scope.business, role: me.role });
    return { state: JSON.stringify(state), updatedAt: String(row.data?.updated_at ?? ""), business: scope.business ?? null, businesses: (held ?? []).map((m) => ({ erpRef: m.erpRef, name: m.name })) };
  });

const Money = z.number().finite().min(0).max(1e12);
const Intent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sale"), at: z.number().int().positive(), input: z.object({
    cart: z.array(z.object({ productId: z.string().min(1).max(100), qty: z.number().finite().positive(), price: Money.optional(), priceReason: z.string().max(200).optional() })).min(1).max(500),
    discount: Money, pay: z.object({ cash: Money, mpesa: Money, bank: Money, credit: Money }).catchall(Money).refine((p) => Object.keys(p).every((k) => ["cash", "mpesa", "bank", "credit"].includes(k) || /^acct-[a-z0-9]{1,40}$/.test(k)), "Unknown payment method"), customerId: z.string().max(100).optional(), channel: z.enum(["POS", "Sales"]), sellerId: z.string().max(100).optional(), vatRate: z.number().min(0).max(100).optional(),
  }) }),
  z.object({ type: z.literal("customer"), at: z.number().int().positive(), name: z.string().min(1).max(100), phone: z.string().max(40).optional() }),
]);

/** An employee's sale. Who they are, where they work and what they may do come from their verified login, never from what the device sends. */
export const staffRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => z.object({ id: z.string().uuid(), device: z.string().uuid(), location: z.string().uuid().optional(), intent: Intent }).parse(v))
  .handler(async ({ data, context }) => {
    const me = await call<MyAccess>(untyped(context.supabase), "my_access");
    if (me.kind !== "member") throw new Error("Not allowed");
    // The business of the location the sale is at decides what this login may do there (business memberships, 0020; the seat's one set without them).
    const scope = staffScope(me, await memberships(context.supabase, me.account), { location: data.location });
    if (!scope.permissions.includes("sales.process")) throw new Error("Not allowed");
    // Checked before anything is worked out; the database refuses the write as well (0014), so this is the message, not the only lock.
    if (me.writable === false) throw new Error("SUBSCRIPTION_INACTIVE: Your employer's free trial has ended. You can still view records. Ask your employer to subscribe to add new sales.");
    const shop = scope.shop ?? null;
    if (!shop) throw new Error("Not allowed");
    const a = await admin();
    const owner = await a.from("owner_accounts").select("owner_user_id").eq("id", me.account).single();
    if (owner.error) throw new Error(owner.error.message);
    const ownerId = owner.data.owner_user_id as string;
    // Records change while this runs, so a clash with another device just means working it out again on the newer records.
    for (let attempt = 0; ; attempt++) {
      const done = await a.from("shopbook_sync_operations").select("kind,request").eq("user_id", ownerId).eq("operation_id", data.id).maybeSingle();
      if (done.error) throw new Error(done.error.message);
      if (done.data) return { refused: done.data.kind === "STAFF REFUSED" ? String((done.data.request as { changes?: { after?: { detail?: string } }[] }).changes?.[0]?.after?.detail ?? "Refused") : null };
      const row = await a.from("shopbook_shop_sync").select("payload").eq("user_id", ownerId).maybeSingle();
      if (row.error) throw new Error(row.error.message);
      if (!row.data) throw new Error("The owner's records are not on the server yet");
      const change = buildStaffChange(row.data.payload as Partial<ErpState>, data.id, data.intent as StaffIntent, { shop, user: me.fullName });
      const sent = await a.rpc("apply_member_operation", { p_member: me.memberId, p_operation: data.id, p_device: data.device, p_kind: change.kind, p_changes: change.changes, p_seq: change.seq });
      if (!sent.error) return { refused: change.refused };
      if (!sent.error.message.includes("SYNC_CONFLICT") || attempt >= 4) throw new Error(sent.error.message);
    }
  });
