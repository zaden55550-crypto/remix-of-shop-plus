// Settings › People & Access. The employee is the ERP record payroll already uses, so it works with no login and no connection.
// A login account is the server's, and every change to one is checked there; this screen only asks.
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Ban, KeyRound, MailCheck, Plus, ShieldAlert, UserCheck, Users, UserX, X } from "lucide-react";
import { Badge, Empty, type Tr } from "@/components/shopbook/erp-shell";
import { GlassPage } from "@/components/shopbook/glass-page";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useErp } from "@/components/shopbook/product-search";
import { Act, ListScreen, dayText, type Col } from "@/components/shopbook/purchase-ui";
import { run } from "@/components/shopbook/selling";
import type { Employee, ErpState } from "@/lib/erp";
import { isActiveLocation, listLocations } from "@/lib/locations";
import { createEmployeeLogin, issueAccessReset, peopleCall, renewInvitation, setLoginState } from "@/lib/people-access.functions";
import { connectPeople, friendly, mirrorErpLocations, peopleData, rememberLink, reloadPeople, usePeopleCloud, type Cloud, type Invitation, type IssuedLink, type Member, type Overview } from "@/lib/people-cloud";
import { EMPLOYMENT_TYPES, employeeStatus, linkEmployeeLogin, saveEmployeeProfile, setEmployeeAssignments, setEmploymentStatus, type EmployeeProfile } from "@/lib/people";
import { ACTIONS, MODULES, OWNER_ONLY, ROLES, SENSITIVE, isManagerRole, moduleKey, roleLabel, rolesForIndustry } from "@/lib/staff-access";
import { businessTypeByName, type IndustryFamilyId } from "@/lib/industry-config";
import { PLANS, store, type PlanId } from "@/lib/shopbook";
import { SlotsFull } from "@/components/shopbook/slots-full";
import { applyAccess } from "@/lib/access-levels";
import { supabase } from "@/integrations/supabase/client";
import { authMessage, linkProvider, registerEmailIdentity, signInEmail, signInProvider } from "@/lib/auth-service";

export const PEOPLE_SECTIONS = ["Employees", "Users & Login Accounts", "Roles & Permissions", "Location Assignments", "Invitations", "Access & Security"];
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const contact = (m: { phone?: string | null | undefined; email?: string | null | undefined }) => [m.phone, m.email].filter(Boolean).join(" • ");
const STATUS: Record<Member["status"], string> = { invited: "Invited", active: "Active", suspended: "Suspended", revoked: "Removed" };

function Head({ title, onClose, tr }: { title: string; onClose: () => void; tr: Tr }) {
  return <div className="pw-page-head"><span /><h2>{title}</h2><button type="button" className="pw-btn" aria-label={tr("Close")} onClick={onClose}><X /></button></div>;
}
const Facts = ({ rows }: { rows: [string, string][] }) => <dl className="pm-facts">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
const memberOf = (d: Overview | undefined, e: Employee) => d?.members.find((m) => m.employeeRef === e.id);

/** Shows what went wrong as a message, then brings the screen up to date either way. */
async function act(fn: () => Promise<unknown>, tr: Tr, ok?: string) {
  try { await fn(); if (ok) toast.success(tr(ok)); await reloadPeople(); return true; }
  catch (e) { toast.error(tr(friendly(e))); await reloadPeople().catch(() => undefined); return false; }
}

// ---------- Connection and limits ----------
function CloudGate({ cloud, tr, children }: { cloud: Cloud; tr: Tr; children: ReactNode }) {
  if (cloud.phase === "ready" && cloud.data) return <>{cloud.warning && <p className="settings-note" role="status">{tr("Some locations couldn't be copied to the server")}: {cloud.warning}</p>}{children}</>;
  if (cloud.phase === "error") return <div className="pm-form"><p className="settings-note" role="alert">{cloud.error}</p><div className="people-actions"><button type="button" className="pw-btn" onClick={() => void connectPeople()}>{tr("Try again")}</button></div></div>;
  if (cloud.phase === "signed-out") return <CloudIdentitySignIn tr={tr} />;
  return <p className="settings-note">{tr("Connecting...")}</p>;
}

function CloudIdentitySignIn({ tr }: { tr: Tr }) {
  const [email, setEmail] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [creating, setCreating] = useState(false);
  const emailSignIn = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await signInEmail(email, password);
      await connectPeople();
    } catch (x) { setError(authMessage(x)); }
    finally { setBusy(false); }
  };
  const createEmailIdentity = async () => {
    setBusy(true); setError(""); setNotice("");
    try {
      if (password.length < 8) throw new Error(tr("Use a password with at least 8 characters"));
      const result = await registerEmailIdentity(email, password, store.get()?.shopName ?? "ZAKRIO SYSTEMS owner");
      if (result.session) await connectPeople();
      else setNotice(tr("Check your email to verify this sign-in, then return to Settings and connect again. Existing account identities are never linked by email alone."));
    } catch (x) { setError(authMessage(x)); }
    finally { setBusy(false); }
  };
  const oauth = async (provider: "google" | "apple") => {
    setBusy(true); setError("");
    try { await signInProvider(provider, `${window.location.origin}/settings`); }
    catch (x) { setError(authMessage(x)); setBusy(false); }
  };
  return <div className="pm-form" aria-label={tr("Connect an account")}>
    <p className="settings-note">{tr("Connect an owner identity to manage server-backed employee logins. Your local shop password is not automatically a cloud account. Use an existing email, Google or Apple identity; only the owner identity can manage this business.")}</p>
    <form className="pm-form" onSubmit={(e) => void emailSignIn(e)}>
      <label className="inventory-field"><span>{tr("Central identity email")}</span><input className="inventory-input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="inventory-field"><span>{tr(creating ? "Create cloud account password" : "Cloud account password")}</span><input className="inventory-input" type="password" autoComplete={creating ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {creating ? <button type="button" className="pw-btn is-primary" disabled={busy || !email.trim()} onClick={() => void createEmailIdentity()}>{tr("Create Email Sign-in")}</button> : <button type="submit" className="pw-btn is-primary" disabled={busy}>{tr("Connect with Email")}</button>}
    </form>
    <button type="button" className="pw-btn" disabled={busy} onClick={() => { setCreating((v) => !v); setError(""); setNotice(""); }}>{tr(creating ? "I already have an email sign-in" : "Create an email sign-in")}</button>
    <div className="people-actions"><button type="button" className="pw-btn" disabled={busy} onClick={() => void oauth("apple")}>{tr("Continue with Apple")}</button><button type="button" className="pw-btn" disabled={busy} onClick={() => void oauth("google")}>{tr("Continue with Google")}</button></div>
    {error && <p className="settings-note" role="alert">{error}</p>}
    {notice && <p className="settings-note" role="status">{notice}</p>}
  </div>;
}

function CloudIdentitySummary({ tr }: { tr: Tr }) {
  const [identity, setIdentity] = useState<{ email: string; provider: string; verified: string } | null>(null);
  const [linkError, setLinkError] = useState("");
  const [linking, setLinking] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active || !data.user) return;
      const user = data.user, providers = user.app_metadata?.providers;
      const provider = user.app_metadata?.provider ?? (Array.isArray(providers) ? providers.join(", ") : "email");
      setIdentity({ email: user.email ?? "", provider: String(provider), verified: user.email_confirmed_at ? tr("Verified") : tr("Not verified") });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [tr]);
  const link = async (provider: "google" | "apple") => {
    setLinking(true); setLinkError("");
    try { await linkProvider(provider, `${window.location.origin}/settings`); }
    catch (e) { setLinkError(authMessage(e)); setLinking(false); }
  };
  return identity ? <div className="pm-form"><div className="settings-inline"><span>{tr("Connected sign-in")}</span><b>{identity.provider} · {identity.email} · {identity.verified}</b></div><p className="settings-note">{tr("Link an additional sign-in method only while signed in to this verified identity. Conflicts require manual reconciliation.")}</p><div className="people-actions"><button type="button" className="pw-btn" disabled={linking} onClick={() => void link("google")}>{tr("Link Google")}</button><button type="button" className="pw-btn" disabled={linking} onClick={() => void link("apple")}>{tr("Link Apple")}</button></div>{linkError && <p role="alert" className="settings-note">{linkError}</p>}</div> : null;
}

const kindLabel = (k: Overview["locations"][number]["kind"]) => (k === "shop" ? "Shop" : "Warehouse");
/** Logins (2026-11-20): a role fits when the plan has a free login, a free manager or staff place, and the location suits it.
 *  No location has its own staff limit. */
const roomFor = (d: Overview | undefined, role: string, refs: string[] = [], member?: Member) => {
  const u = d?.usage;
  if (!d || !u?.usable || role === "staff") return false;
  if (isManagerRole(role)) return member?.role === role || (u.excess_users === 0 && u.available_managers > 0 && (u.plan_id === "business" || member || u.available_users > 0));
  if (!member && u.available_users <= 0) return false;
  if (role !== "shopkeeper" && role !== "warehouse_staff") return false;
  // Staff have their own part of the plan (Basic 1, Growth 10, Business 20); empty manager places never become staff places.
  if (!(member && (member.role === "shopkeeper" || member.role === "warehouse_staff")) && u.active_employees >= u.employee_slots) return false;
  return refs.some((ref) => {
    const place = d.locations.find((l) => l.erpRef === ref && l.status === "active");
    return !!place && (role === "shopkeeper" ? place.kind === "shop" : place.kind !== "shop");
  });
};

function SeatLine({ d, tr }: { d: Overview; tr: Tr }) {
  const u = d.usage, name = d.plans.find((p) => p.id === u.plan_id)?.name ?? u.plan_id;
  const row = (label: string, used: number, max: number | string, left: number | string) => <tr key={label}><td>{tr(label)}</td><td>{used}</td><td>{max}</td><td>{left}</td></tr>;
  const over = u.excess_users > 0 || u.excess_locations > 0;
  const someFull = u.available_locations === 0 || u.available_managers === 0;
  return <div className="people-seats">
    <p><b>{u.active_users}</b> {tr("of")} <b>{u.max_users}</b> {tr("user accounts in use, including the owner")} • {tr(name)}{u.status === "trial" ? ` (${tr("free trial")})` : ""}</p>
    <div className="pm-table-wrap people-plain"><table className="pm-table">
      <thead><tr><th>{tr("Allowance")}</th><th>{tr("In use")}</th><th>{tr("Allowed")}</th><th>{tr("Remaining")}</th></tr></thead>
      <tbody>
        {row("Locations", u.active_locations, u.max_locations, u.available_locations)}
        {row("Shops", u.shops, "—", "—")}
        {row("Warehouses", u.stores + u.warehouses, "—", "—")}
        {row("Managers", u.active_managers, u.max_managers, u.available_managers)}
        {row("Staff", u.active_employees, u.employee_slots, Math.max(0, u.employee_slots - u.active_employees))}
        {row("Total active users", u.active_users, u.max_users, u.available_users)}
      </tbody>
    </table></div>
    <p className="pw-note">{tr("Each person counts once, whatever shops or warehouses they are assigned to.")}</p>
    {u.usable && !over && u.available_users > 0 && someFull && <p>{tr("One of your allowances is fully used.")} <Link to="/plans" className="dash-link">{tr("Upgrade")}</Link></p>}
    {!u.usable ? <p role="alert">{tr("The subscription is not active, so no new logins can be created.")} <Link to="/plans" className="dash-link">{tr("View plans")}</Link></p>
      : over ? <p role="alert">{tr("You have more logins than this plan allows. Nobody is removed, but you can't add more until you are within the limit.")} <Link to="/plans" className="dash-link">{tr("Upgrade")}</Link></p>
      : u.available_users === 0 || (u.available_managers === 0 && u.active_employees >= u.employee_slots) ? <SlotsFull tr={tr} planId={(PLANS.some((p) => p.id === u.plan_id) ? u.plan_id : "business") as PlanId} /> : null}
  </div>;
}

// ---------- The link, shown once ----------
function LinkResult({ issued, name, onClose, tr }: { issued: IssuedLink; name: string; onClose: () => void; tr: Tr }) {
  return <GlassPage label={tr("Invitation link")} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pm-form">
    <Head title={tr("Invitation link")} onClose={onClose} tr={tr} />
    {issued.delivery.sent
      ? <p className="settings-note" role="status">{tr("Sent to")} {name} {tr("by")} {issued.delivery.via === "sms" ? "SMS" : tr("email")}.</p>
      : <p className="settings-note" role="alert"><b>{tr("Not sent.")}</b> {tr(issued.delivery.error ?? "No provider is configured")}. {tr("Copy this link and give it to")} {name} {tr("yourself.")}</p>}
    <label className="inventory-field"><span>{tr("Link: works once")}</span><input className="inventory-input" readOnly value={issued.link} onFocus={(e) => e.target.select()} /></label>
    <p className="pw-note">{tr("Expires")} {when(issued.expiresAt)}. {tr("For safety this link is shown only now and isn't stored. If it is lost, generate a new one.")}</p>
    {/* Suggestion 7: send the link by WhatsApp or SMS from this phone's own apps (no paid provider needed). */}
    <div className="pw-share">
      <a className="pw-btn is-whatsapp" href={`https://wa.me/?text=${encodeURIComponent(`${tr("You're invited to join our business on Zakrio Systems. Open this link to set up your login (it works once):")} ${issued.link}`)}`} target="_blank" rel="noopener">{tr("Send by WhatsApp")}</a>
      <a className="pw-btn is-sms" href={`sms:?&body=${encodeURIComponent(`${tr("You're invited to join our business on Zakrio Systems. Open this link to set up your login (it works once):")} ${issued.link}`)}`}>{tr("Send by SMS")}</a>
    </div>
    <div className="pw-foot"><span /><span className="pw-foot-right"><button type="button" className="pw-btn" onClick={() => void copy(issued.link, tr)}>{tr("Copy invitation link")}</button><button type="button" className="pw-btn is-primary" onClick={onClose}>{tr("Done")}</button></span></div>
  </div></GlassPage>;
}
async function copy(text: string, tr: Tr) {
  try { await navigator.clipboard.writeText(text); toast.success(tr("Link copied")); }
  catch { toast.error(tr("Select the link and copy it")); }
}

// ---------- Forms ----------
const Checks = ({ title, rows, picked, onChange, tr }: { title: string; rows: { id: string; label: string }[]; picked: string[]; onChange: (v: string[]) => void; tr: Tr }) => <fieldset className="people-checks">
  <legend>{tr(title)}</legend>
  {rows.map((r) => <label key={r.id}><input type="checkbox" checked={picked.includes(r.id)} onChange={(e) => onChange(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} /><span>{r.label}</span></label>)}
</fieldset>;

const businessRows = (d: Overview | undefined) => d?.businesses.map((b) => ({ id: b.id, label: b.name })) ?? [{ id: "local", label: store.get()?.shopName ?? "" }];

/** The active business's industry family, so the role picker shows the right staff positions. */
const industryFamilyOf = (s: { businesses: { id: string; businessType?: string | undefined; industryFamilyId?: string | undefined }[] } | undefined, acct: { businessId?: string | undefined; businessType?: string | undefined; businessTypes?: readonly string[] | undefined; industryFamilyId?: string | undefined } | null): IndustryFamilyId | undefined => {
  const biz = s?.businesses.find((b) => b.id === (acct?.businessId ?? "local")) ?? s?.businesses[0];
  const direct = biz?.industryFamilyId ?? acct?.industryFamilyId;
  if (direct) return direct as IndustryFamilyId;
  const t = biz?.businessType ?? acct?.businessTypes?.[0] ?? acct?.businessType;
  return t ? businessTypeByName(t)?.familyId : undefined;
};
/** Every active place. Places have no login quota of their own: the plan's one total covers them all. */
const placeRows = (s: ErpState, tr: Tr, _d?: Overview) => listLocations(s).filter(isActiveLocation).map((l) => ({ id: l.id, label: `${l.name} • ${tr(kindLabel(l.type))}` }));
/** The server's ids for the ERP locations chosen on screen. */
const serverLocations = (d: Overview, refs: string[]) => d.locations.filter((l) => l.status === "active" && l.erpRef && refs.includes(l.erpRef)).map((l) => l.id);
const serverBusinesses = (d: Overview, refs: string[], cloud: Cloud) => { const ids = d.businesses.filter((b) => refs.includes(b.id)).map((b) => b.id); return ids.length ? ids : cloud.business ? [cloud.business] : []; };

/** Copies locations up first, so a location added a moment ago can be assigned. A place the plan doesn't leave room for stops here rather than being dropped quietly. */
async function refreshedOverview(refs: string[]) {
  const problems = await mirrorErpLocations();
  await reloadPeople();
  const d = peopleData();
  if (!d) throw new Error("Connect your owner account first");
  if (refs.some((p) => !d.locations.some((l) => l.erpRef === p && l.status === "active"))) throw new Error(problems[0] ?? "That location isn't on the server yet");
  return d;
}
async function makeLogin(e: Employee, cloud: Cloud) {
  if (!cloud.data || !cloud.account) throw new Error("Connect your owner account first");
  const refs = e.locationIds ?? [], d = await refreshedOverview(refs);
  const issued = await createEmployeeLogin({ data: { account: cloud.account, employeeRef: e.id, fullName: e.name, phone: e.phone || null, email: e.email || null, code: e.code ?? null, role: e.accessRole ?? "staff", businesses: serverBusinesses(d, e.businessRefs ?? [], cloud), locations: serverLocations(d, refs) } });
  linkEmployeeLogin(e.id, issued.memberId ?? null);
  // Access chosen on Business Setup before the login existed.
  if (issued.memberId && e.access && Object.keys(e.access).length) { const failed = await applyAccess(issued.memberId, e.access); if (failed) toast.error(`${failed} access setting(s) weren't saved. Set them in Manage permissions`); }
  rememberLink(issued.memberId ?? e.id, issued);
  await reloadPeople();
  return issued;
}

function EmployeeForm({ s, cloud, item, tr, onClose, onIssued }: { s: ErpState; cloud: Cloud; item?: Employee | undefined; tr: Tr; onClose: () => void; onIssued: (i: IssuedLink, name: string) => void }) {
  const acct = store.get();
  const family = industryFamilyOf(s, acct);
  const roleOptions = rolesForIndustry(family);
  const d = cloud.data, member = item && memberOf(d, item);
  const [f, setF] = useState({ name: item?.name ?? "", phone: item?.phone ?? "", email: item?.email ?? "", code: item?.code ?? "", startDate: item?.startDate ?? new Date().toISOString().slice(0, 10), employmentType: item?.employmentType ?? EMPLOYMENT_TYPES[0], accessRole: item?.accessRole ?? "shopkeeper" });
  const businesses = businessRows(d);
  const [biz, setBiz] = useState<string[]>(item?.businessRefs?.filter((b) => businesses.some((x) => x.id === b)) ?? (businesses.length === 1 ? [businesses[0]!.id] : []));
  const [places, setPlaces] = useState<string[]>(item?.locationIds ?? []);
  const [login, setLogin] = useState(false), [busy, setBusy] = useState(false);
  const canLogin = cloud.phase === "ready" && !!d && roomFor(d, f.accessRole, places, member);
  const field = (k: keyof typeof f, label: string, req = false, type = "text") => <label className="inventory-field"><span>{tr(label)}{req && <span className="text-destructive"> *</span>}</span><input className="inventory-input" type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  const title = tr(item ? "Edit Employee" : "Add Employee");
  const save = async () => {
    const profile: EmployeeProfile = { ...f, businessRefs: biz, locationIds: places };
    const saved = run(() => saveEmployeeProfile(profile, item?.id));
    if (!saved) return;
    setBusy(true);
    try {
      if (member && member.status !== "revoked") {
        if (!await act(() => peopleCall({ data: { fn: "update_member_profile", args: { p_member: member.id, p_full_name: saved.name, p_phone: saved.phone || null, p_email: saved.email || null, p_code: saved.code ?? null } } }), tr)) return;
      }
      if (login) {
        try { const issued = await makeLogin(saved, cloud); toast.success(tr("Employee saved")); onClose(); onIssued(issued, saved.name); return; }
        catch (e) { toast.error(`${tr("Employee saved, but the login wasn't created")}: ${tr(friendly(e))}`); onClose(); return; }
      }
      toast.success(tr("Employee saved")); onClose();
    } finally { setBusy(false); }
  };
  return <GlassPage label={title} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pw-form pm-form">
    <Head title={title} onClose={onClose} tr={tr} />
    <div className="people-form-row">{field("name", "Full Name", true)}{field("phone", "Phone Number", true, "tel")}</div>
    <div className="people-form-row">{field("email", "Email", false, "email")}{field("code", "Employee ID")}</div>
    {!item && <p className="pw-note">{tr("Leave Employee ID empty and one is made for you.")}</p>}
    <Checks title="Business assignment *" rows={businesses} picked={biz} onChange={setBiz} tr={tr} />
    <Checks title="Location assignment" rows={placeRows(s, tr, d)} picked={places} onChange={setPlaces} tr={tr} />
    <div className="people-form-row">
      <label className="inventory-field"><span>{tr("Role Template")}</span><select className="inventory-input" value={f.accessRole} onChange={(e) => setF({ ...f, accessRole: e.target.value })}>{roleOptions.filter(([id]) => id !== "staff").map(([id, l]) => <option key={id} value={id}>{tr(l)}</option>)}</select></label>
      <label className="inventory-field"><span>{tr("Employment Type")}</span><select className="inventory-input" value={f.employmentType} onChange={(e) => setF({ ...f, employmentType: e.target.value })}>{EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{tr(t)}</option>)}</select></label>
    </div>
    {field("startDate", "Employment Start Date", false, "date")}
    {!member && <label className="people-toggle"><input type="checkbox" checked={login} disabled={!canLogin} onChange={(e) => setLogin(e.target.checked)} /><span>{tr("Enable Login Access")}</span></label>}
    {!member && !canLogin && <p className="pw-note">{tr(cloud.phase === "ready" ? "This plan has no room for another login. The employee can still be saved without a login." : "Connect your owner account under Users & Login Accounts to enable logins. The employee can still be saved without one.")}</p>}
    <div className="pw-foot"><span /><span className="pw-foot-right"><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="button" className="pw-btn is-primary" disabled={busy} onClick={() => void save()}>{tr("Save Employee")}</button></span></div>
  </div></GlassPage>;
}

function AssignForm({ e, s, cloud, tr, locationId, onClose }: { e: Employee; s: ErpState; cloud: Cloud; tr: Tr; locationId?: string | undefined; onClose: () => void }) {
  const d = cloud.data, member = memberOf(d, e), businesses = businessRows(d);
  const start = member && d ? member.businesses : e.businessRefs ?? [];
  const startPlaces = member && d ? d.locations.filter((l) => member.locations.includes(l.id) && l.erpRef).map((l) => l.erpRef as string) : e.locationIds ?? [];
  const [biz, setBiz] = useState<string[]>(start.filter((b) => businesses.some((x) => x.id === b)).length ? start : businesses.length === 1 ? [businesses[0]!.id] : []);
  const [places, setPlaces] = useState<string[]>(() => locationId ? [...new Set([...startPlaces, locationId])] : startPlaces);
  const [role, setRole] = useState(member?.role ?? e.accessRole ?? "shopkeeper");
  const family = industryFamilyOf(s, store.get());
  const roleOptions = rolesForIndustry(family);
  const save = async () => {
    if (member && member.status !== "revoked") {
      let fresh: Overview;
      try { fresh = await refreshedOverview(places); } catch (x) { toast.error(tr(friendly(x))); return; }
      if (!await act(() => peopleCall({ data: { fn: "update_member_access", args: { p_member: member.id, p_role: role, p_businesses: serverBusinesses(fresh, biz, cloud), p_locations: serverLocations(fresh, places) } } }), tr)) return;
    }
    if (run(() => setEmployeeAssignments(e.id, biz, places, role), tr("Assignments saved"))) onClose();
  };
  const title = `${tr("Assign location")}: ${e.name}`;
  return <GlassPage label={title} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pw-form pm-form">
    <Head title={title} onClose={onClose} tr={tr} />
    <Checks title="Businesses" rows={businesses} picked={biz} onChange={setBiz} tr={tr} />
    <Checks title="Shops, stores and warehouses" rows={placeRows(s, tr, d)} picked={places} onChange={setPlaces} tr={tr} />
    <label className="inventory-field"><span>{tr("Role Template")}</span><select className="inventory-input" value={role} onChange={(x) => setRole(x.target.value)}>{roleOptions.filter(([id]) => id !== "staff").map(([id, l]) => <option key={id} value={id}>{tr(l)}</option>)}</select></label>
    <p className="pw-note">{tr("An employee reaches only what is ticked here.")}</p>
    <div className="pw-foot"><span /><span className="pw-foot-right"><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="button" className="pw-btn is-primary" onClick={() => void save()}>{tr("Save Assignments")}</button></span></div>
  </div></GlassPage>;
}

// ---------- Permissions ----------
const templateAllows = (d: Overview, role: string, key: string) => { const own = d.roleChanges.find((r) => r.role === role && r.key === key); return own ? own.allowed : d.roleDefaults.some((r) => r.role === role && r.key === key); };

function PermissionGrid({ d, account, role, member, tr }: { d: Overview; account: string; role: string; member?: Member | undefined; tr: Tr }) {
  const on = (key: string) => member?.overrides[key] ?? templateAllows(d, role, key);
  const known = new Set(d.permissions.map((p) => p.key));
  const set = (key: string, allowed: boolean) => act(() => member
    ? peopleCall({ data: { fn: "set_member_permission", args: { p_member: member.id, p_key: key, p_allowed: allowed } } })
    : peopleCall({ data: { fn: "set_role_permission", args: { p_account: account, p_role: role, p_key: key, p_allowed: allowed } } }), tr);
  return <div className="people-grid">
    <div className="pm-table-wrap people-matrix"><table className="pm-table">
      <thead><tr><th>{tr("App")}</th>{ACTIONS.map((a) => <th key={a}>{tr(a[0]!.toUpperCase() + a.slice(1))}</th>)}</tr></thead>
      <tbody>{MODULES.map(([id, label]) => <tr key={id}><td>{tr(label)}</td>{ACTIONS.map((a) => { const key = moduleKey(id, a); return <td key={a}><input type="checkbox" aria-label={`${tr(label)} ${tr(a)}`} disabled={!known.has(key)} checked={on(key)} onChange={(e) => void set(key, e.target.checked)} /></td>; })}</tr>)}</tbody>
    </table></div>
    <p className="money-heading">{tr("Sensitive permissions")}</p>
    <div className="people-sensitive">{SENSITIVE.map(([key, label]) => <label key={key} className="people-toggle"><input type="checkbox" checked={on(key)} onChange={(e) => void set(key, e.target.checked)} /><span>{tr(label)}</span></label>)}</div>
    <p className="money-heading">{tr("Always kept by the owner")}</p>
    <div className="people-sensitive">{OWNER_ONLY.map((label) => <label key={label} className="people-toggle is-locked"><input type="checkbox" checked={false} disabled aria-label={tr(label)} /><span>{tr(label)}</span></label>)}</div>
  </div>;
}

function PermissionPage({ m, cloud, tr, onClose }: { m: Member; cloud: Cloud; tr: Tr; onClose: () => void }) {
  const title = `${tr("Manage permissions")}: ${m.name}`, d = cloud.data;
  const current = d?.members.find((x) => x.id === m.id) ?? m;
  return <GlassPage label={title} onClose={onClose}><div className="inventory-box dash-panel pw-page pm-form">
    <Head title={title} onClose={onClose} tr={tr} />
    <p className="pw-note">{tr("Starts from the role")} {tr(roleLabel(current.role))}. {tr("Changes here apply only to this person, and take effect on their next check with the server, within a minute.")}</p>
    {d && cloud.account && <PermissionGrid d={d} account={cloud.account} role={current.role} member={current} tr={tr} />}
    <div className="pw-foot"><span /><span className="pw-foot-right"><button type="button" className="pw-btn" disabled={!Object.keys(current.overrides).length} onClick={() => void act(() => peopleCall({ data: { fn: "clear_member_permissions", args: { p_member: m.id } } }), tr, "Back to the role's permissions")}>{tr("Reset to role")}</button><button type="button" className="pw-btn is-primary" onClick={onClose}>{tr("Done")}</button></span></div>
  </div></GlassPage>;
}

function RolesPanel({ cloud, tr }: { cloud: Cloud; tr: Tr }) {
  const [role, setRole] = useState<string>("manager");
  const d = cloud.data;
  const family = industryFamilyOf(d, store.get());
  const roleOptions = rolesForIndustry(family);
  return <CloudGate cloud={cloud} tr={tr}><div className="pm-form">
    <label className="inventory-field people-narrow"><span>{tr("Role template")}</span><select className="inventory-input" value={role} onChange={(e) => setRole(e.target.value)}><option value="owner">{tr("Owner")}</option>{roleOptions.filter(([id]) => id !== "staff").map(([id, l]) => <option key={id} value={id}>{tr(l)}</option>)}</select></label>
    {role === "owner" ? <p className="settings-note">{tr("The owner has full access, controls every permission, manages the subscription and keeps the owner-only actions. This role can't be changed or given to anyone else.")}</p>
      : d && cloud.account && <><p className="pw-note">{tr("Changing a template affects everyone on that role, unless they have their own setting.")}</p><PermissionGrid d={d} account={cloud.account} role={role} tr={tr} /></>}
  </div></CloudGate>;
}

// ---------- One employee ----------
function loginLabel(m?: Member) { return m ? STATUS[m.status] : "No login"; }

function EmployeeCard({ e, s, cloud, tr, onClose, onEdit, onAssign, onPermissions, onIssued }: { e: Employee; s: ErpState; cloud: Cloud; tr: Tr; onClose: () => void; onEdit: () => void; onAssign: () => void; onPermissions: (m: Member) => void; onIssued: (i: IssuedLink, name: string) => void }) {
  const m = memberOf(cloud.data, e), status = employeeStatus(e), live = m && m.status !== "revoked";
  const places = listLocations(s).filter((l) => e.locationIds?.includes(l.id)).map((l) => l.name).join(", ");
  const login = async () => { try { onIssued(await makeLogin(e, cloud), e.name); } catch (x) { toast.error(tr(friendly(x))); } };
  const suspend = async () => {
    if (live && m.status === "active" && !await act(() => setLoginState({ data: { member: m.id, action: "suspend" } }), tr)) return;
    run(() => setEmploymentStatus(e.id, "suspended"), tr("Employee suspended"));
  };
  const reactivate = async () => {
    if (live && m.status === "suspended" && !await act(() => setLoginState({ data: { member: m.id, action: "reactivate" } }), tr)) return;
    run(() => setEmploymentStatus(e.id, "active"), tr("Employee reactivated"));
  };
  const terminate = async () => {
    if (!window.confirm(`${tr("End employment for")} ${e.name}? ${tr("Their access stops immediately. Their sales, purchases, stock movements and payroll history are all kept.")}`)) return;
    if (live) {
      if (cloud.phase !== "ready") { toast.error(tr("Connect your owner account first, so their login can be ended")); return; }
      if (!await act(() => setLoginState({ data: { member: m.id, action: "terminate" } }), tr)) return;
    }
    if (run(() => setEmploymentStatus(e.id, "terminated"), tr("Employment ended"))) onClose();
  };
  return <GlassPage label={e.name} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pm-form">
    <Head title={e.name} onClose={onClose} tr={tr} />
    <Facts rows={[[tr("Employee ID"), e.code ?? ""], [tr("Phone Number"), e.phone ?? ""], [tr("Email"), e.email ?? ""], [tr("Assigned location"), places], [tr("Role"), tr(roleLabel(m?.role ?? e.accessRole))], [tr("Login status"), tr(loginLabel(m))], [tr("Last sign-in"), m?.lastLoginAt ? when(m.lastLoginAt) : ""], [tr("Employment status"), tr(status)], [tr("Employment type"), e.employmentType ? tr(e.employmentType) : ""], [tr("Start date"), e.startDate ?? ""]]} />
    <div className="people-actions">
      <button type="button" className="pw-btn" onClick={onEdit}>{tr("Edit employee")}</button>
      {status !== "Terminated" && <button type="button" className="pw-btn" onClick={onAssign}>{tr("Assign location")}</button>}
      {live && <button type="button" className="pw-btn" onClick={() => onPermissions(m)}>{tr("Manage permissions")}</button>}
      {!live && status !== "Terminated" && <button type="button" className="pw-btn" disabled={cloud.phase !== "ready"} onClick={() => void login()}>{tr("Create login account")}</button>}
      {status === "Active" && <button type="button" className="pw-btn" onClick={() => void suspend()}>{tr("Suspend employee")}</button>}
      {status === "Suspended" && <button type="button" className="pw-btn" onClick={() => void reactivate()}>{tr("Reactivate employee")}</button>}
      {status === "Terminated" && <button type="button" className="pw-btn" onClick={() => void run(() => setEmploymentStatus(e.id, "active"), tr("Employee reactivated. Create a new login if they need one."))}>{tr("Reactivate employee")}</button>}
      {status !== "Terminated" && <button type="button" className="pw-btn" onClick={() => void terminate()}>{tr("Terminate employment")}</button>}
    </div>
    {!live && status !== "Terminated" && cloud.phase !== "ready" && <p className="pw-note">{cloud.phase === "error" ? cloud.error : tr("Connect your owner account under Users & Login Accounts to create a login.")}</p>}
  </div></GlassPage>;
}

// ---------- Screens ----------
type Dialog = { kind: "add" } | { kind: "edit" | "card"; e: Employee } | { kind: "assign"; e: Employee; locationId?: string | undefined } | { kind: "perms"; m: Member } | { kind: "link"; issued: IssuedLink; name: string } | null;

function useDialogs(s: ErpState, cloud: Cloud, tr: Tr) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const issued = (i: IssuedLink, name: string) => setDialog({ kind: "link", issued: i, name });
  const fresh = (e: Employee) => s.employees.find((x) => x.id === e.id) ?? e;
  const node = !dialog ? null
    : dialog.kind === "add" ? <EmployeeForm s={s} cloud={cloud} tr={tr} onClose={close} onIssued={issued} />
    : dialog.kind === "edit" ? <EmployeeForm s={s} cloud={cloud} item={fresh(dialog.e)} tr={tr} onClose={close} onIssued={issued} />
    : dialog.kind === "assign" ? <AssignForm e={fresh(dialog.e)} s={s} cloud={cloud} tr={tr} locationId={dialog.locationId} onClose={close} />
    : dialog.kind === "card" ? <EmployeeCard e={fresh(dialog.e)} s={s} cloud={cloud} tr={tr} onClose={close} onEdit={() => setDialog({ kind: "edit", e: dialog.e })} onAssign={() => setDialog({ kind: "assign", e: dialog.e })} onPermissions={(m) => setDialog({ kind: "perms", m })} onIssued={issued} />
    : dialog.kind === "perms" ? <PermissionPage m={dialog.m} cloud={cloud} tr={tr} onClose={close} />
    : dialog.kind !== "link" ? null
    : <LinkResult issued={dialog.issued} name={dialog.name} tr={tr} onClose={close} />;
  return { open: setDialog, node };
}

function Employees({ s, cloud, tr }: { s: ErpState; cloud: Cloud; tr: Tr }) {
  const { open, node } = useDialogs(s, cloud, tr), d = cloud.data;
  const live = (e: Employee) => { const m = memberOf(d, e); return m && m.status !== "revoked" ? m : undefined; };
  const places = (e: Employee) => listLocations(s).filter((l) => e.locationIds?.includes(l.id)).map((l) => l.name).join(", ");
  const business = (e: Employee) => businessRows(d).filter((b) => e.businessRefs?.includes(b.id) || e.businessRefs?.includes(d?.businesses.find((x) => x.id === b.id)?.legacyId ?? "")).map((b) => b.label).join(", ") || (d ? "" : store.get()?.shopName ?? "");
  const withLogin = s.employees.filter((e) => live(e)).length;
  const pending = d?.invitations.filter((i) => i.status === "Pending" && i.kind === "invite").length ?? 0;
  const columns: Col<Employee>[] = [
    { label: "Employee ID", value: (e) => e.code ?? "" }, { label: "Employee Name", value: (e) => e.name }, { label: "Phone Number", value: (e) => e.phone ?? "" }, { label: "Email", value: (e) => e.email ?? "" },
    { label: "Assigned Business", value: business }, { label: "Assigned Location", value: places }, { label: "Role", value: (e) => { const r = live(e)?.role ?? e.accessRole; return r ? tr(roleLabel(r)) : e.role; } }, // Someone made in Payroll keeps their job title until a template is chosen.
    { label: "Login Status", value: (e) => loginLabel(memberOf(d, e)), render: (e) => <Badge s={loginLabel(memberOf(d, e))} /> }, { label: "Employment Status", value: (e) => employeeStatus(e), render: (e) => <Badge s={employeeStatus(e)} /> },
  ];
  return <div className="pm-form people-screen">
    {cloud.phase === "signed-out" && <p className="settings-note">{tr("Employee records work now. To give someone a login, connect your owner account under Users & Login Accounts.")}</p>}
    <KpiRow>
      <Kpi tone="info" label={tr("Total Employees")} value={String(s.employees.length)} icon={<Users />} />
      <Kpi tone="good" label={tr("Active Employees")} value={String(s.employees.filter((e) => employeeStatus(e) === "Active").length)} icon={<UserCheck />} />
      <Kpi tone="profit" label={tr("With Login Access")} value={String(withLogin)} icon={<KeyRound />} />
      <Kpi tone="warn" label={tr("Without Login Access")} value={String(s.employees.length - withLogin)} icon={<UserX />} />
      <Kpi tone="info" label={tr("Pending Invitations")} value={String(pending)} icon={<MailCheck />} />
    </KpiRow>
    <ListScreen title="Employees" shop={store.get()?.shopName ?? ""} items={s.employees} columns={columns} idOf={(e) => e.id} money={String} tr={tr} empty="No employees yet" ph="Search employees..." text={(e) => `${e.name} ${e.code ?? ""} ${e.phone ?? ""} ${e.email ?? ""}`}
      filters={[{ label: "Employment Status", get: employeeStatus, options: ["Active", "Suspended", "Terminated"] }, { label: "Login Status", get: (e) => loginLabel(memberOf(d, e)) }]}
      primary={{ label: "Add Employee", icon: <Plus />, onClick: () => open({ kind: "add" }) }}
      actions={(e) => <Act label={`${tr("Manage")} ${e.name}`} onClick={() => open({ kind: "card", e })}>{tr("Manage")}</Act>} />
    {node}
  </div>;
}

function placeNames(d: Overview, m: Member) { return d.locations.filter((l) => m.locations.includes(l.id)).map((l) => l.name).join(", "); }
function bizNames(d: Overview, m: Member) { return d.businesses.filter((b) => m.businesses.includes(b.id)).map((b) => b.name).join(", "); }

function LoginAccounts({ s, cloud, tr }: { s: ErpState; cloud: Cloud; tr: Tr }) {
  const { open, node } = useDialogs(s, cloud, tr), d = cloud.data;
  if (!d) return <CloudGate cloud={cloud} tr={tr}><span /></CloudGate>;
  const employee = (m: Member) => s.employees.find((e) => e.id === m.employeeRef);
  const columns: Col<Member>[] = [
    { label: "Employee Name", value: (m) => m.name }, { label: "Sign-in With", value: contact }, { label: "Role", value: (m) => tr(roleLabel(m.role)) }, { label: "Business", value: (m) => bizNames(d, m) }, { label: "Locations", value: (m) => placeNames(d, m) },
    { label: "Login Status", value: (m) => STATUS[m.status], render: (m) => <Badge s={STATUS[m.status]} /> }, { label: "Last Sign-in", value: (m) => when(m.lastLoginAt) },
  ];
  return <CloudGate cloud={cloud} tr={tr}><div className="pm-form people-screen">
    <SeatLine d={d} tr={tr} />
    <p className="pw-note">{tr("Every employee signs in with their own account. Never share the owner's login.")}</p>
    <ListScreen title="Users & Login Accounts" shop={store.get()?.shopName ?? ""} items={d.members} columns={columns} idOf={(m) => m.id} money={String} tr={tr} empty="No employee logins yet. Create one from an employee's Manage button." ph="Search logins..." text={(m) => `${m.name} ${contact(m)}`}
      filters={[{ label: "Login Status", get: (m) => STATUS[m.status], options: Object.values(STATUS) }]}
      actions={(m) => <>{employee(m) && <Act label={`${tr("Manage")} ${m.name}`} onClick={() => open({ kind: "card", e: employee(m)! })}>{tr("Manage")}</Act>}{m.status !== "revoked" && <Act label={`${tr("Permissions")} ${m.name}`} onClick={() => open({ kind: "perms", m })}>{tr("Permissions")}</Act>}</>} />
    {node}
  </div></CloudGate>;
}

function Assignments({ s, cloud, tr, locationId }: { s: ErpState; cloud: Cloud; tr: Tr; locationId?: string | undefined }) {
  const { open, node } = useDialogs(s, cloud, tr), d = cloud.data;
  const all = listLocations(s), scope = locationId ? all.find((l) => l.id === locationId) : undefined;
  const refs = (e: Employee) => { const m = memberOf(d, e); return m && d && m.status !== "revoked" ? d.locations.filter((l) => m.locations.includes(l.id)).map((l) => l.erpRef ?? "") : e.locationIds ?? []; };
  const names = (e: Employee) => all.filter((l) => refs(e).includes(l.id)).map((l) => l.name).join(", ");
  const rows = s.employees.filter((e) => employeeStatus(e) !== "Terminated").filter((e) => {
    if (!scope) return true;
    const role = memberOf(d, e)?.role ?? e.accessRole ?? "";
    return refs(e).includes(scope.id) || isManagerRole(role) || (scope.type === "shop" ? role === "shopkeeper" : role === "warehouse_staff");
  });
  const access = (e: Employee) => { const m = memberOf(d, e); return !m ? "No login" : STATUS[m.status]; };
  const remove = async (e: Employee) => {
    if (!window.confirm(`${tr("Remove all location assignments for")} ${e.name}?`)) return;
    const m = memberOf(d, e);
    if (m && m.status !== "revoked" && d) {
      if (!await act(() => peopleCall({ data: { fn: "update_member_access", args: { p_member: m.id, p_role: m.role, p_businesses: m.businesses, p_locations: [] } } }), tr)) return;
    }
    run(() => setEmployeeAssignments(e.id, e.businessRefs ?? [], [], e.accessRole ?? "staff"), tr("Assignments removed"));
  };
  const columns: Col<Employee>[] = [
    { label: "Employee Name", value: (e) => e.name }, { label: "Assigned Business", value: (e) => { const m = memberOf(d, e); return m && d ? bizNames(d, m) : d?.businesses.filter((b) => e.businessRefs?.includes(b.id)).map((b) => b.name).join(", ") ?? store.get()?.shopName ?? ""; } },
    { label: "Assigned Locations", value: names }, { label: "Role", value: (e) => tr(roleLabel(memberOf(d, e)?.role ?? e.accessRole)) }, { label: "Access Status", value: access, render: (e) => <Badge s={access(e)} /> },
  ];
  return <div className="pm-form people-screen">
    <p className="pw-note">{tr("An employee assigned to one shop doesn't reach another. A manager can be given several.")}</p>
    {scope && <p className="pw-note"><b>{tr("Location")}: {scope.name}</b> · {tr("Only compatible employees are listed for this location.")}</p>}
    <ListScreen title={scope ? `${tr("Location Assignments")} · ${scope.name}` : "Location Assignments"} shop={store.get()?.shopName ?? ""} items={rows} columns={columns} idOf={(e) => e.id} money={String} tr={tr} empty="No employees yet" ph="Search employees..." text={(e) => `${e.name} ${names(e)}`}
      actions={(e) => <><Act label={`${tr(refs(e).length ? "Edit" : "Add")} ${e.name}`} onClick={() => open({ kind: "assign", e, ...(scope ? { locationId: scope.id } : {}) })}>{tr(refs(e).length ? "Edit" : "Add")}</Act>{refs(e).length > 0 && <Act label={`${tr("Remove")} ${e.name}`} onClick={() => void remove(e)}>{tr("Remove")}</Act>}</>} />
    {node}
  </div>;
}

function Invitations({ s, cloud, tr }: { s: ErpState; cloud: Cloud; tr: Tr }) {
  const { open, node } = useDialogs(s, cloud, tr), d = cloud.data;
  if (!d) return <CloudGate cloud={cloud} tr={tr}><span /></CloudGate>;
  const memberFor = (i: Invitation) => d.members.find((m) => m.id === i.memberId);
  const newest = new Map<string, string>(); for (const i of d.invitations) if (!newest.has(i.memberId)) newest.set(i.memberId, i.id);
  const label = (i: Invitation) => (i.kind === "reset" ? `${i.status} (${tr("password reset")})` : i.status);
  const renew = async (i: Invitation) => {
    const m = memberFor(i);
    try {
      const issued = i.kind === "reset" && m ? await issueAccessReset({ data: { member: m.id } }) : await renewInvitation({ data: { member: i.memberId } });
      rememberLink(i.memberId, issued); await reloadPeople();
      open({ kind: "link", issued, name: m?.name ?? "" });
    } catch (e) { toast.error(tr(friendly(e))); }
  };
  const columns: Col<Invitation>[] = [
    { label: "Employee Name", value: (i) => memberFor(i)?.name ?? "" }, { label: "Phone/Email", value: (i) => contact(memberFor(i) ?? {}) }, { label: "Invitation Date", value: (i) => when(i.createdAt) }, { label: "Expires", value: (i) => when(i.expiresAt) },
    { label: "Status", value: label, render: (i) => <Badge s={i.status} /> }, { label: "Delivery", value: (i) => (i.sentAt ? `${i.sentVia === "sms" ? "SMS" : tr("Email")} • ${when(i.sentAt)}` : tr("Not sent")) },
    { label: "Assigned Role", value: (i) => tr(roleLabel(memberFor(i)?.role)) }, { label: "Assigned Location", value: (i) => { const m = memberFor(i); return m ? placeNames(d, m) : ""; } },
  ];
  return <CloudGate cloud={cloud} tr={tr}><div className="pm-form people-screen">
    {cloud.providers && !cloud.providers.email && !cloud.providers.sms && <p className="settings-note people-warn" role="alert"><ShieldAlert /> <span><b>{tr("No email or SMS provider is configured.")}</b> {tr("Invitations can't be sent automatically. Each new invitation gives you a one-time link to copy and share with the employee yourself.")}</span></p>}
    <ListScreen title="Invitations" shop={store.get()?.shopName ?? ""} items={d.invitations} columns={columns} idOf={(i) => i.id} money={String} tr={tr} empty="No invitations yet" ph="Search invitations..." text={(i) => `${memberFor(i)?.name ?? ""} ${contact(memberFor(i) ?? {})}`}
      filters={[{ label: "Status", get: (i) => i.status, options: ["Pending", "Accepted", "Expired", "Revoked"] }]}
      actions={(i) => { const m = memberFor(i), known = cloud.links[i.memberId], isNewest = newest.get(i.memberId) === i.id, ended = m?.terminatedAt; return <>
        {i.status === "Pending" && <Act label={`${tr("Resend invitation")} ${m?.name ?? ""}`} onClick={() => void renew(i)}>{tr("Resend")}</Act>}
        {i.status === "Pending" && known && isNewest && <Act label={`${tr("Copy invitation link")} ${m?.name ?? ""}`} onClick={() => void copy(known.link, tr)}>{tr("Copy Link")}</Act>}
        {i.status === "Pending" && <Act label={`${tr("Revoke invitation")} ${m?.name ?? ""}`} onClick={() => void act(() => peopleCall({ data: { fn: "revoke_invitation", args: { p_invitation: i.id } } }), tr, "Invitation revoked")}>{tr("Revoke")}</Act>}
        {i.status !== "Pending" && i.status !== "Accepted" && isNewest && !ended && m?.status !== "active" && <Act label={`${tr("Generate a new invitation")} ${m?.name ?? ""}`} onClick={() => void renew(i)}>{tr("New Invitation")}</Act>}
      </>; }} />
    {node}
  </div></CloudGate>;
}

function Security({ s, cloud, tr, history }: { s: ErpState; cloud: Cloud; tr: Tr; history: ReactNode }) {
  const { open, node } = useDialogs(s, cloud, tr), d = cloud.data;
  if (!d) return <><CloudGate cloud={cloud} tr={tr}><span /></CloudGate><p className="money-heading">{tr("Access History")}</p>{history}</>;
  const name = (id: string | null) => d.members.find((m) => m.id === id)?.name ?? "";
  const byUser = (record: string | null) => d.members.find((m) => m.id === record)?.name ?? "";
  const emp = (m: Member) => s.employees.find((e) => e.id === m.employeeRef);
  const change = async (m: Member, action: "suspend" | "reactivate") => {
    if (!await act(() => setLoginState({ data: { member: m.id, action } }), tr, action === "suspend" ? "Login suspended" : "Login reactivated")) return;
    const e = emp(m); if (e && employeeStatus(e) !== "Terminated") run(() => setEmploymentStatus(e.id, action === "suspend" ? "suspended" : "active"));
  };
  const reset = async (m: Member) => { try { const issued = await issueAccessReset({ data: { member: m.id } }); rememberLink(m.id, issued); await reloadPeople(); open({ kind: "link", issued, name: m.name }); } catch (e) { toast.error(tr(friendly(e))); } };
  const logins = d.logins.filter((l) => l.success), failed = d.logins.filter((l) => !l.success);
  const pending = d.invitations.filter((i) => i.status === "Pending");
  return <CloudGate cloud={cloud} tr={tr}><div className="pm-form people-screen">
    <p className="money-heading">{tr("Owner account")}</p><CloudIdentitySummary tr={tr} />
    <p className="money-heading">{tr("Login access")}</p>
    {d.members.filter((m) => m.status !== "revoked").length ? <div className="pm-table-wrap people-plain"><table className="pm-table"><thead><tr><th>{tr("Employee Name")}</th><th>{tr("Login Status")}</th><th>{tr("Last Sign-in")}</th><th>{tr("Actions")}</th></tr></thead><tbody>
      {d.members.filter((m) => m.status !== "revoked").map((m) => <tr key={m.id}><td data-label={tr("Employee Name")}>{m.name}</td><td data-label={tr("Login Status")}><Badge s={STATUS[m.status]} /></td><td data-label={tr("Last Sign-in")}>{when(m.lastLoginAt)}</td><td className="pm-actions" data-label={tr("Actions")}>
        {m.status === "active" && <Act label={`${tr("Suspend")} ${m.name}`} onClick={() => void change(m, "suspend")}><Ban />{tr("Suspend")}</Act>}
        {m.status === "suspended" && <Act label={`${tr("Reactivate")} ${m.name}`} onClick={() => void change(m, "reactivate")}>{tr("Reactivate")}</Act>}
        {m.status === "active" && <Act label={`${tr("Revoke sessions")} ${m.name}`} onClick={() => void act(() => peopleCall({ data: { fn: "revoke_member_sessions", args: { p_member: m.id } } }), tr, "Sessions revoked. They must sign in again.")}>{tr("Revoke Sessions")}</Act>}
        {m.status === "active" && <Act label={`${tr("Reset access")} ${m.name}`} onClick={() => void reset(m)}>{tr("Reset Access")}</Act>}
        {pending.some((i) => i.memberId === m.id) && <Act label={`${tr("Revoke invitation")} ${m.name}`} onClick={() => void act(() => peopleCall({ data: { fn: "revoke_invitation", args: { p_invitation: pending.find((i) => i.memberId === m.id)!.id } } }), tr, "Invitation revoked")}>{tr("Revoke Invitation")}</Act>}
      </td></tr>)}
    </tbody></table></div> : <Empty>{tr("No employee logins yet")}</Empty>}
    <p className="pw-note">{tr("When someone leaves, use Terminate employment on their record. Access stops at once, and their sales, purchases, stock movements and payroll history stay.")}</p>
    <p className="money-heading">{tr("Login history")}</p>
    <EventList rows={logins.map((l) => [when(l.at), name(l.memberId) || l.identifier, l.ip ?? ""])} empty={tr("No sign-ins yet")} />
    <p className="money-heading">{tr("Failed login attempts")}</p>
    <EventList rows={failed.map((l) => [when(l.at), name(l.memberId) || l.identifier, tr(l.reason ?? "Failed")])} empty={tr("No failed attempts")} />
    <p className="money-heading">{tr("Employee activity")}</p>
    <EventList rows={d.activity.map((a) => [when(a.at), tr(a.action), byUser(a.recordId)])} empty={tr("No activity yet")} />
    <p className="money-heading">{tr("Access History")}</p>
    {history}
    {node}
  </div></CloudGate>;
}
const EventList = ({ rows, empty }: { rows: string[][]; empty: string }) => rows.length ? <ul className="people-events">{rows.map((r, i) => <li key={i}>{r.filter(Boolean).map((v, j) => <span key={j}>{v}</span>)}</li>)}</ul> : <Empty>{empty}</Empty>;

export function PeoplePanel({ name, tr, history, locationId }: { name: string; tr: Tr; history: ReactNode; locationId?: string | undefined }) {
  const s = useErp(), cloud = usePeopleCloud();
  if (name === "Employees") return <Employees s={s} cloud={cloud} tr={tr} />;
  if (name === "Users & Login Accounts") return <LoginAccounts s={s} cloud={cloud} tr={tr} />;
  if (name === "Roles & Permissions") return <RolesPanel cloud={cloud} tr={tr} />;
  if (name === "Location Assignments") return <Assignments s={s} cloud={cloud} tr={tr} locationId={locationId} />;
  if (name === "Invitations") return <Invitations s={s} cloud={cloud} tr={tr} />;
  return <Security s={s} cloud={cloud} tr={tr} history={history} />;
}
