// An employee's device: signing in, keeping access current, and leaving nothing behind when access ends.
// Whatever is stored here came from the server, already filtered, and is replaced on every refresh.
import { activeShop, empty, runIntent, type ErpState } from "@/lib/erp";
import { employeeSignIn, myAccess, staffRecord, staffSnapshot, type MyAccess } from "@/lib/people-access.functions";
import { ERP_KEY, getOutbox, persistErp, retryDelay, updateOperation, type Operation } from "@/lib/outbox";
import { canRecord, store, type PlanId } from "@/lib/shopbook";
import { clearAuthSession, installAuthSession } from "@/lib/auth-service";

const NOTICE = "shopbook.signOutNotice";
export const takeSignOutNotice = () => { try { const v = sessionStorage.getItem(NOTICE); sessionStorage.removeItem(NOTICE); return v; } catch { return null; } };

export const isStaffDevice = () => Boolean(store.get()?.staff);
const REFRESH_MS = 60000;
const REASONS: Record<string, string> = {
  suspended: "Your access has been suspended. Contact your employer.",
  revoked: "Your access has ended. Contact your employer.",
  session: "Your session was ended. Sign in again.",
  subscription: "Your employer's subscription is not active. Contact your employer.",
};

/** Applies what the server says about this login. */
export async function applyMember(me: Extract<MyAccess, { kind: "member" }>) {
  const old = store.get()?.staff;
  const places = me.locations, keep = places.some((l) => l.id === old?.activeLocationId) ? old?.activeLocationId : places.length === 1 ? places[0]?.id : undefined;
  const business = me.businesses.find((b) => b.id === places.find((l) => l.id === keep)?.businessId) ?? me.businesses[0];
  const place = places.find((l) => l.id === keep);
  const plan: PlanId | "trial" = me.subscription === "trial" ? "trial" : (me.plan as PlanId);
  // An employee signed in to one shop sees that shop's name; with no shop chosen yet, the business name.
  const account = { shopName: place?.name || business?.name || "DataQuill Solutions", email: me.email ?? "", phone: me.phone ?? "", currency: business?.currency ?? "KES", password: "", businessId: business?.id ?? me.account, plan, role: "staff",
    ...(me.trialEndsAt ? { trialStart: new Date(me.trialEndsAt).getTime() - 30 * 86400000 } : {}),
    staff: { memberId: me.memberId, fullName: me.fullName, role: me.role, permissions: me.permissions, businesses: me.businesses, locations: places, activeLocationId: keep, syncedAt: Date.now(), writable: me.writable !== false } };
  localStorage.setItem("shopbook.account", JSON.stringify(account));
  window.dispatchEvent(new Event("shopbook-staff"));
}

const unsent = (ops: Operation[]) => ops.filter((o) => o.intent && (o.phase === "pending" || o.phase === "failed"));
const QUEUE_EVENT = "shopbook-staff-queue";
const unsentKey = (member: string) => `shopbook.staffUnsent.${member}`;
let sending = false;

/** Sends waiting sales in order. A sale the server refuses is set aside with its reason so it can't hold up the others; a lost connection stops here and tries again later. */
export async function sendStaffQueue() {
  if (sending || !navigator.onLine) return;
  // After the employer's trial, sales made offline before it ended stay queued on this device, neither sent nor deleted, until a plan is paid for.
  if (!canRecord(store.get())) return;
  sending = true;
  try {
    const location = store.get()?.staff?.activeLocationId;
    for (const op of unsent(getOutbox())) {
      if (op.nextRetry > Date.now()) break;
      try {
        const r = await staffRecord({ data: { id: op.id, device: op.device, intent: op.intent!, ...(location ? { location } : {}) } });
        if (r.refused) {
          updateOperation(op.id, { phase: "conflict", error: r.refused }, r.refused);
          window.dispatchEvent(new CustomEvent("shopbook-staff-refused", { detail: r.refused }));
        } else updateOperation(op.id, { phase: "synced", error: undefined, acknowledgedAt: Date.now(), nextRetry: 0 }, "Server confirmed");
      } catch (e) {
        updateOperation(op.id, { phase: "failed", attempts: op.attempts + 1, error: e instanceof Error ? e.message : "Could not send", nextRetry: Date.now() + retryDelay(op.attempts + 1) }, "Upload failed");
        break;
      }
    }
  } finally { sending = false; }
}

export async function refreshStaffRecords() {
  const location = store.get()?.staff?.activeLocationId;
  const snap = await staffSnapshot({ data: location ? { location } : {} });
  let state: ErpState = { ...empty(), ...(JSON.parse(snap.state) as Partial<ErpState>) };
  // Anything still waiting to be sent stays on this copy, so an offline sale doesn't vanish from the screen.
  const outbox = getOutbox(), shop = activeShop(state), user = store.get()?.staff?.fullName || "Staff";
  for (const op of unsent(outbox)) { try { state = runIntent(state, op.id, op.intent!, { shop, user, copy: true }).after; } catch { /* The server will say why when it arrives. */ } }
  persistErp(state, outbox);
  window.dispatchEvent(new Event("shopbook-erp-remote")); window.dispatchEvent(new Event("shopbook-erp"));
}

/** One sign-in form: the owner's own device check runs first in the page, and this is the employee path. */
export async function signInEmployee(identifier: string, password: string) {
  const tokens = await employeeSignIn({ data: { identifier, password } });
  const device = store.get();
  if (device && !device.staff) throw new Error("This device holds the owner's records, so an employee can't sign in here. Use the employee's own device or browser.");
  await installAuthSession(tokens);
  await resumeEmployeeSession();
}

/** Completes the same server-authorized employee context after password or provider authentication. */
export async function resumeEmployeeSession() {
  const device = store.get();
  if (device && !device.staff) { await clearAuthSession().catch(() => undefined); throw new Error("This device holds the owner's records, so an employee can't sign in here. Use the employee's own device or browser."); }
  const me = await myAccess();
  if (me.kind !== "member") { await clearAuthSession().catch(() => undefined); throw new Error(me.kind === "blocked" ? REASONS[me.reason] ?? "Access denied" : "This login has no access"); }
  await applyMember(me);
  restoreUnsent(me.memberId);
  await sendStaffQueue();
  await refreshStaffRecords();
  store.signIn();
}

/** A sale made offline must survive signing out: it is kept for the same login's next sign-in, and for nobody else. */
function restoreUnsent(member: string) {
  const kept = localStorage.getItem(unsentKey(member));
  if (!kept) return;
  localStorage.removeItem(unsentKey(member));
  persistErp({ ...empty() }, [...getOutbox(), ...(JSON.parse(kept) as Operation[])]);
}

/** Removes the employee's copy of everything from this device, except sales that haven't reached the server yet. */
export async function endStaffSession(notice?: string) {
  if (!isStaffDevice()) return;
  const member = store.get()?.staff?.memberId, waiting = unsent(getOutbox());
  if (member && waiting.length) localStorage.setItem(unsentKey(member), JSON.stringify(waiting));
  if (notice) { try { sessionStorage.setItem(NOTICE, notice); } catch { /* the sign-in page just shows no message */ } }
  localStorage.removeItem(ERP_KEY);
  localStorage.removeItem("shopbook.account");
  store.signOut();
  await clearAuthSession().catch(() => undefined);
}

const denied = (e: unknown) => e instanceof Error && /Unauthorized|Not allowed|Sign-in required/i.test(e.message);

/** Checks with the server. Being offline keeps the current view; only a clear "no" ends the session. */
export async function checkStaffAccess() {
  if (!isStaffDevice() || !navigator.onLine) return;
  try {
    const me = await myAccess();
    if (me.kind === "blocked") return endStaffSession(REASONS[me.reason] ?? "Your access has ended.");
    if (me.kind !== "member") return endStaffSession("Your access has ended.");
    await applyMember(me);
    await sendStaffQueue();
    await refreshStaffRecords();
  } catch (e) { if (denied(e)) await endStaffSession(REASONS["session"]); }
}

export function startStaffMonitor() {
  const check = () => { void checkStaffAccess(); };
  const visible = () => { if (document.visibilityState === "visible") check(); };
  const session = () => { if (isStaffDevice() && !store.signedIn()) void endStaffSession(); };
  const timer = setInterval(check, REFRESH_MS);
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", check);
  window.addEventListener("shopbook-session", session);
  window.addEventListener(QUEUE_EVENT, check);
  check();
  return () => { clearInterval(timer); document.removeEventListener("visibilitychange", visible); window.removeEventListener("online", check); window.removeEventListener("shopbook-session", session); window.removeEventListener(QUEUE_EVENT, check); };
}

export function chooseStaffLocation(id: string) {
  const a = store.get();
  if (!a?.staff?.locations.some((l) => l.id === id)) return;
  const place = a.staff.locations.find((l) => l.id === id), business = a.staff.businesses.find((b) => b.id === place?.businessId) ?? a.staff.businesses[0];
  store.save({ ...a, shopName: place?.name || business?.name || a.shopName, staff: { ...a.staff, activeLocationId: id } });
  window.dispatchEvent(new Event("shopbook-staff"));
  // Each location is its own copy of the records. If this fails, the regular check brings it within a minute.
  void refreshStaffRecords().catch(() => undefined);
}
