// Business / Shop Setup: the one page after the plan. Heading and the two actions on top; business name, type and the plan's
// usage in one compact row; the shop and warehouse entries the plan allows; people; and an optional, collapsed product import.
// It edits a device-local draft. Save keeps the draft; Activate checks every field and then saves everything at once (src/lib/business-setup.ts).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Camera, ChevronDown, CircleCheck, Crown, FileText, ImagePlus, Info, MoreHorizontal, Paperclip, Pencil, Plus, Save, ShieldCheck, Store, Trash2, Upload, UserPlus, Users, Warehouse } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { GlassNotice } from "@/components/shopbook/plan-loss";
import { SearchableCountryPicker, SearchableCurrencyPicker, ZakrioMark } from "@/components/shopbook/ui";
import { findByCountry, findByCurrency } from "@/lib/world-data";
import { readSettings } from "@/lib/settings-config";
import { ImportCenter } from "@/components/shopbook/import-center";
import { PEOPLE_SECTIONS, PeoplePanel } from "@/components/shopbook/people-access";
import { useErp } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { NEW_LOCATION_TYPES, TYPE_LABEL, activateSetup, draftTypes, countTypes, liveRows, loginSummary, newKey, readDraft, rowsFromRecords, saveDraft, setupPlan, suggestCode, validate, type SetupDraft, type SetupProblem, type SetupRow, type SetupUser } from "@/lib/business-setup";
import { GENERAL_TRADE, INDUSTRIES, businessTypeByName, isIndustryFamilyId, type IndustryFamilyId } from "@/lib/industry-config";
import { FeatureChecks, IndustrySelect, TypePicker } from "@/components/shopbook/type-picker";
import { GlassPage } from "@/components/shopbook/glass-page";
import { ReadyButton, ReadyToSell } from "@/components/shopbook/ready-to-sell";
import { currentFeatures, placeName, sellingPlaceName, type Features } from "@/lib/trade-features";
import { listLocations, MAIN_LOCATION, saveLocation } from "@/lib/locations";
import { NeedsConnection, sendSetupInvitation, stageOf, type InviteStage } from "@/lib/setup-invite";
import { friendly } from "@/lib/people-cloud";
import { readProductImage } from "@/lib/product-export";
import { ROLES, isManagerRole, roleLabel } from "@/lib/staff-access";
import { businessTypesOf, canOpen, planAllowanceLines, planCounterLine, planEmployeeRule, planPrice, store, type Account, type BusinessDocument } from "@/lib/shopbook";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "Business / Shop Setup — Zakrio Systems" }] }),
  component: Setup,
});

type Tr = (t: string, x?: string) => string;
const TYPE_ICON = { shop: Store, store: Building2, warehouse: Warehouse } as const;
/** What this page calls each kind of location. A selling place follows the business type (a Supermarket's shops are
 *  "Supermarket"); stores and older warehouses are both "Warehouse". Set by SetupScreen on each render, read by its rows. */
let shopWord = "Shop";
let shopTypes: string[] = [];
/** A row's own place name: a shop is the type chosen for it (Supermarket, Butchery…, while that type is still ticked), else the main type. */
const placeTypeOf = (x: { type: erp.LocationType; placeType?: string | undefined }) => (x.placeType && shopTypes.includes(x.placeType) ? x.placeType : shopTypes[0]);
const placeOf = (x: { type: erp.LocationType; placeType?: string | undefined }) => (x.type === "shop" ? placeName(placeTypeOf(x)) : TYPE_LABEL[x.type]);
const isStorage = (r: SetupRow) => r.type !== "shop";

function Setup() {
  const nav = useNavigate();
  const { dir } = useLanguage();
  const [acct, setAcct] = useState<Account | null>(null);

  useEffect(() => {
    const a = store.get();
    if (!a || !store.signedIn()) { nav({ to: "/", replace: true }); return; }
    if (!a.plan) { nav({ to: "/plans", replace: true }); return; }
    if (a.staff || !canOpen(a, "basic")) { nav({ to: "/apps", replace: true }); return; }
    setAcct(a);
  }, [nav]);

  return <main dir={dir} className="bsetup-page">{acct && <SetupScreen acct={acct} onDone={() => nav({ to: "/apps" })} />}</main>;
}

function SetupScreen({ acct, onDone }: { acct: Account; onDone: () => void }) {
  const { tr } = useLanguage();
  const s = useErp();
  const plan = setupPlan(acct);
  // Locations this business already has that are not rows on the page (archived ones keep their name and number).
  const records = useMemo(() => listLocations(s), [s]);
  const [d, setD] = useState<SetupDraft>(() => {
    const saved = readDraft();
    const savedType = saved?.businessType === "Other" && saved.otherType.trim() ? saved.otherType.trim() : saved?.businessType;
    const businessType = savedType ?? businessTypesOf(acct)[0] ?? GENERAL_TRADE;
    const industryFamilyId = businessTypeByName(businessType)?.familyId
      ?? (isIndustryFamilyId(saved?.industryFamilyId) ? saved.industryFamilyId : undefined)
      ?? (isIndustryFamilyId(acct.industryFamilyId) ? acct.industryFamilyId : undefined)
      ?? "trade";
    if (saved) return { ...saved, businessType, otherType: "", extraBusinessTypes: saved.extraBusinessTypes ?? [], industryFamilyId, businessDocuments: saved.businessDocuments ?? acct.businessDocuments ?? [] };
    // An empty number stays empty: its placeholder shows the number it will be given on activation, and nothing generated is typed in for the owner.
    const rows = rowsFromRecords(erp.load());
    // Every type already saved on the account comes back ticked, not only the main one.
    const extraBusinessTypes = businessTypesOf(acct).filter((t) => t !== businessType);
    return { businessName: acct.shopName ?? "", businessType, otherType: "", extraBusinessTypes, industryFamilyId, phone: acct.phone ?? "", phone2: acct.phone2 ?? "", phone3: acct.phone3 ?? "", taxPin: readSettings().taxPin, businessDocuments: acct.businessDocuments ?? [], rows, users: [] };
  });
  const [problems, setProblems] = useState<SetupProblem[]>([]);
  const [access, setAccess] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  // "Ready to sell": payment details, tax, opening stock and cash, receipt, numbering, hours, PINs, sample data, moving in.
  const [readyOpen, setReadyOpen] = useState(false);
  // A short welcome the first time this owner opens Setup on this device; dismissed for good with one tap.
  const welcomeKey = `shopbook.setupWelcome@${acct.businessId || acct.email || "owner"}`;
  const [welcome, setWelcome] = useState(() => { try { return !localStorage.getItem(welcomeKey); } catch { return false; } });
  const closeWelcome = () => { setWelcome(false); try { localStorage.setItem(welcomeKey, "1"); } catch { /* shown again next time; harmless */ } };
  const [importing, setImporting] = useState<null | { kind: "Products" | "Opening Stock"; at?: string | undefined }>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ rows: SetupRow[]; next: SetupRow[] } | null>(null);
  // An unsaved entry is removed only after a named confirmation too.
  const [confirmDraft, setConfirmDraft] = useState<SetupRow | null>(null);
  const [managing, setManaging] = useState<string | null>(null), [ownerInfo, setOwnerInfo] = useState(false);
  const [editingUser, setEditingUser] = useState<SetupUser | "new" | null>(null);
  const [newUserLocation, setNewUserLocation] = useState<string | null>(null);
  const [accessSiteId, setAccessSiteId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<{ key: string; focus?: "name" | "code" } | null>(null);
  // Set while Activate is saving, so a second click can't save twice.
  const [activating, setActivating] = useState(false);
  const [info, setInfo] = useState(false);
  const [viewingLogo, setViewingLogo] = useState<string | null>(null);

  const rowKeys = new Set(d.rows.map((r) => r.savedId).filter(Boolean));
  const others = records.filter((l) => !rowKeys.has(l.id));
  const otherCodes = others.map((l) => l.code), otherNames = others.map((l) => l.name);
  const live = liveRows(d.rows);
  const counts = countTypes(d.rows);
  const existingPeople = s.employees.filter((e) => e.memberId && e.active && e.status !== "terminated" && e.accessRole);
  const logins = loginSummary(plan.id, d.users, existingPeople, live);
  const loginFull = logins.used >= logins.total || (logins.usedStaff >= logins.staff && logins.usedManagers >= logins.managers);
  const set = (p: Partial<SetupDraft>) => { setD((x) => ({ ...x, ...p })); setProblems([]); };
  // Auto-save: every change is kept on this device about a second later, quietly ("Saved just now" beside Save). Photos too big
  // for the device's storage are left out of the saved copy and stay on the page until Activate.
  const [savedAt, setSavedAt] = useState<number | null>(null), [, tick] = useState(0);
  const firstDraft = useRef(true);
  useEffect(() => {
    if (firstDraft.current) { firstDraft.current = false; return; }
    const t = window.setTimeout(() => {
      try { saveDraft(d); setSavedAt(Date.now()); }
      catch { try { saveDraft({ ...d, rows: d.rows.map(({ photos: _p, logo: _l, ...r }) => r) }); setSavedAt(Date.now()); } catch { /* the Save button says so */ } }
    }, 1200);
    return () => window.clearTimeout(t);
  }, [d]);
  useEffect(() => { if (!savedAt) return; const t = window.setInterval(() => tick((n) => n + 1), 30_000); return () => window.clearInterval(t); }, [savedAt]);
  const savedText = savedAt == null ? "" : Date.now() - savedAt < 60_000 ? tr("Saved just now") : tr("Saved {x} min ago", String(Math.floor((Date.now() - savedAt) / 60_000)));
  // The business logo (no longer asked on Create Account): tap the header mark to add or change it. Saved on the account at once.
  const logoFile = useRef<HTMLInputElement>(null), businessFiles = useRef<HTMLInputElement>(null);
  const [headLogo, setHeadLogo] = useState(acct.logo ?? "");
  const pickHeadLogo = (f?: File) => {
    if (!f) return;
    if (f.size > 1_500_000) { toast.error(tr("Logo must be under 1.5 MB")); return; }
    const r = new FileReader();
    r.onload = () => { const v = String(r.result); try { store.update({ logo: v }); setHeadLogo(v); toast.success(tr("Logo saved")); } catch { toast.error(tr("This device has no room to save the setup")); } };
    r.readAsDataURL(f);
  };
  const pickBusinessDocuments = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (!picked.length) return;
    if (picked.some((f) => f.size > 600_000)) { toast.error(tr("Each business document must be 600 KB or smaller")); return; }
    const current = d.businessDocuments ?? [];
    const total = current.reduce((sum, f) => sum + f.size, 0) + picked.reduce((sum, f) => sum + f.size, 0);
    if (picked.length + current.length > 4 || total > 1_200_000) { toast.error(tr("Choose up to four business documents, 1.2 MB total")); return; }
    try {
      const documents = await Promise.all(picked.map((file) => new Promise<BusinessDocument>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ id: newKey(), name: file.name, mime: file.type || "application/octet-stream", size: file.size, dataUrl: String(reader.result) });
        reader.onerror = () => reject(reader.error ?? new Error("Document could not be read"));
        reader.readAsDataURL(file);
      })));
      set({ businessDocuments: [...current, ...documents] });
    } catch { toast.error(tr("This device could not read that document")); }
  };
  // Country and currency come from Create Account and can be corrected here (the same pickers); saved on the account at once.
  const [place, setPlace] = useState({ country: acct.country ?? "", currency: acct.currency ?? "" });
  const [placeOpen, setPlaceOpen] = useState(false);
  const savePlace = (next: { country: string; currency: string }) => { setPlace(next); try { store.update(next); } catch { toast.error(tr("This device has no room to save the setup")); } };
  const countryName = findByCountry(place.country)?.countryName ?? place.country;
  const currencyShown = findByCurrency(place.currency)?.currencyCode ?? place.currency;
  // Second and third phones stay behind "+ Add another phone" until wanted.
  const [morePhones, setMorePhones] = useState(() => !!(d.phone2?.trim() || d.phone3?.trim()));
  const selectedIndustry = isIndustryFamilyId(d.industryFamilyId) ? d.industryFamilyId : "trade";
  const selectedIndustryConfig = INDUSTRIES.find((industry) => industry.id === selectedIndustry);
  const setupFamily = selectedIndustry as IndustryFamilyId | undefined;
  // The chosen types, main first (a legacy "Other" label is kept as typed); the feature ticks start from them.
  const chosenTypes = [...new Set([d.businessType === "Other" ? d.otherType.trim() : d.businessType, ...d.extraBusinessTypes].filter(Boolean))];
  const features: Features = { ...currentFeatures(draftTypes(d)), ...(d.features ?? {}) };
  shopWord = sellingPlaceName(draftTypes(d));
  shopTypes = draftTypes(d);
  const setRow = (key: string, p: Partial<SetupRow>) => set({ rows: d.rows.map((r) => (r.key === key ? { ...r, ...p } : r)) });
  const problem = (key: string | undefined, field: string) => problems.find((x) => x.key === key && x.field === field)?.message;
  const savedPhotos = (r: SetupRow) => r.photos ?? records.find((l) => l.id === r.savedId)?.photos ?? [];

  const addRowAt = (slot: number, type: "shop" | "store", placeType?: string) => {
    const existing = live.find((r, index) => (r.slotNumber ?? index + 1) === slot);
    if (existing) { if (existing.type !== type) changeType(existing, type); if (placeType) setRow(existing.key, { placeType }); return; }
    if (live.length >= plan.locations) return;
    set({ rows: [...d.rows, { key: newKey(), slotNumber: slot, type, name: "", code: "", ...(placeType ? { placeType } : {}) }] });
  };
  const addRow = (type: "shop" | "store") => {
    if (live.length >= plan.locations) return;
    const occupied = new Set(live.map((r, index) => r.slotNumber ?? index + 1));
    let slot = 1;
    while (occupied.has(slot)) slot++;
    addRowAt(slot, type);
  };
  /** The number a row would get if left empty, among every number already taken or typed. */
  const suggestedCode = (r: SetupRow) => {
    const taken = [...otherCodes, ...live.filter((x) => x.key !== r.key && x.code).map((x) => x.code)];
    // Empty rows above this one take their numbers first, so each placeholder is the number it will really get.
    for (const x of live) { if (x.key === r.key) break; if (!x.code && x.type === r.type) taken.push(suggestCode(x.type, taken)); }
    return suggestCode(r.type, taken);
  };
  /** Removing a row also takes it out of every connection and every person's locations. */
  const withoutKey = (rows: SetupRow[], key: string) => rows.map((x) => (x.connected?.includes(key) ? { ...x, connected: x.connected.filter((k) => k !== key) } : x));
  const removeRow = (r: SetupRow) => {
    if (r.savedId) { setConfirmRemove({ rows: [r], next: withoutKey(d.rows, r.key).map((x) => (x.key === r.key ? { ...x, archive: true } : x)) }); return; }
    setConfirmDraft(r);
  };
  const removeDraft = (r: SetupRow) => set({ rows: withoutKey(d.rows.filter((x) => x.key !== r.key), r.key), users: d.users.map((u) => ({ ...u, locations: u.locations.filter((k) => k !== r.key) })) });
  const changeType = (r: SetupRow, type: erp.LocationType) => {
    // The number stays exactly as it is (a saved SHOP-001 is never renumbered); an empty one's placeholder follows the new type by itself.
    // A shop's connections are to warehouses, so a change of type clears the ones that no longer make sense.
    const rows = d.rows.map((x) => (x.key === r.key ? { ...x, type, connected: type === "shop" ? x.connected : undefined } : type === "shop" && x.connected?.includes(r.key) ? { ...x, connected: x.connected.filter((k) => k !== r.key) } : x));
    set({ rows, users: d.users.map((u) => ({ ...u, locations: u.locations.filter((k) => k !== r.key || fitsRole(u.role, type)) })) });
  };
  /** The most counters a shop row may have: the plan's per-shop number, or what is left of its total. Always shown on Setup. */
  const counterMax = (r: SetupRow) => {
    if (!features.counters) return 0;
    if (r.type !== "shop") return 1;
    if (plan.countersPerShop) return plan.counters;
    const others = live.filter((x) => x.type === "shop" && x.key !== r.key).reduce((n, x) => n + Math.max(1, x.counters ?? 1), 0);
    return Math.max(1, plan.counters - others);
  };
  const savedLogo = (r: SetupRow) => r.logo ?? records.find((l) => l.id === r.savedId)?.logo;

  /** The sites a person is being invited to must be real locations first. Only those are saved (nothing else is activated); the rows
   *  keep their place and become saved rows, and the draft is kept so a reload shows the same page. */
  const persistSites = (keys: string[], current: SetupRow[] = []) => {
    // `current` carries an open editor's unsaved name and number, so a site named there can be invited to straight away.
    const want = live.map((r) => current.find((x) => x.key === r.key) ?? r).filter((r) => keys.includes(r.key));
    if (want.some((r) => !r.name.trim())) throw new Error("Give each chosen site a name first");
    const fresh = want.filter((r) => !r.savedId), codes: Record<string, string> = {};
    const ids = fresh.length ? erp.runErpTransaction(() => Object.fromEntries(fresh.map((r) => { const code = r.code.trim() || suggestedCode(r); codes[r.key] = code; return [r.key, saveLocation({ name: r.name.trim(), code, type: r.type, photos: r.photos, logo: r.logo, ...(r.address !== undefined ? { address: r.address } : {}), ...(r.type === "shop" && r.placeType ? { placeType: r.placeType } : {}) }).id]; }))) : {};
    if (fresh.length) {
      const next = { ...d, rows: d.rows.map((r) => (ids[r.key] ? { ...r, name: want.find((x) => x.key === r.key)?.name ?? r.name, savedId: ids[r.key], code: codes[r.key] ?? r.code } : r)) };
      setD(next); saveDraft(next);
    }
    return want.map((r) => r.savedId ?? ids[r.key]!).filter(Boolean);
  };
  /** Add & Send Invitation: save the chosen sites, then the server creates the login and sends the email. The person then shows as a
   *  saved employee, so they leave this page's draft list and activation won't add them again. */
  const sendInvite = async (u: SetupUser, stage: InviteStage, current: SetupRow[] = []) => {
    const ids = persistSites(u.locations, current);
    // persistSites returns the saved ids in page order, so each row key maps to its saved location for the person's counters.
    const keys = live.filter((r) => u.locations.includes(r.key)).map((r) => r.key);
    const counters = u.counters ? Object.fromEntries(Object.entries(u.counters).filter(([k]) => keys.includes(k)).map(([k, v]) => [ids[keys.indexOf(k)]!, v])) : undefined;
    const next = await sendSetupInvitation({ ...u, ...(counters ? { counters } : {}) }, ids, stage).catch((e) => { const st = stageOf(e); if (st?.employeeId) setD((x) => ({ ...x, users: x.users.filter((y) => y.key !== u.key) })); throw e; });
    setD((x) => { const out = { ...x, users: x.users.filter((y) => y.key !== u.key) }; try { saveDraft(out); } catch { /* the draft is a convenience; the employee is saved */ } return out; });
    return next;
  };
  /** Keep the draft, then open the shared People & Access sign-in choices over this page. */
  const connectServer = async (u: SetupUser) => {
    const next = { ...d, users: d.users.some((x) => x.key === u.key) ? d.users.map((x) => (x.key === u.key ? u : x)) : [...d.users, u] };
    setD(next);
    try { saveDraft(next); } catch { toast.error(tr("This device has no room to save the setup")); return; }
    setEditingUser(null); setEditingRow(null);
    setAccess("Users & Login Accounts");
  };

  const check = () => {
    const room = logins.total - logins.used;
    const found = validate(d, plan.locations, room, Math.max(0, plan.maxManagers - logins.usedManagers), otherCodes, otherNames, { planId: plan.id, existing: existingPeople });
    setProblems(found);
    const first = found[0];
    if (first) {
      // Say which entry, and bring its field into view.
      const n = first.key ? live.find((r, index) => r.key === first.key)?.slotNumber ?? live.findIndex((r) => r.key === first.key) + 1 : 0;
      const empty = live.filter((r) => !r.savedId && !r.name.trim());
      const onlyEmpty = empty.length > 0 && found.every((p) => p.key && empty.some((r) => r.key === p.key));
      toast.error(n > 0 ? `${tr("Entry")} ${n}: ${tr(first.message)}` : tr(first.message), onlyEmpty ? {
        action: { label: tr(empty.length === 1 ? "Remove the empty location" : "Remove the {x} empty locations", String(empty.length)), onClick: () => set({ rows: d.rows.filter((r) => r.savedId || r.name.trim()) }) },
      } : undefined);
      const id = first.key && n > 0 ? `bsetup-${first.field === "code" ? "code" : "name"}-${first.key}` : first.field === "businessName" ? "bsetup-business-name" : first.field === "phone" ? "bsetup-phone" : first.field === "phone2" ? "bsetup-phone2" : first.field === "phone3" ? "bsetup-phone3" : first.field === "businessType" ? (d.businessType === "Other" ? "bsetup-other-type" : "bsetup-business-type") : first.field === "users" ? "bsetup-users" : "";
      const el = id ? document.getElementById(id) : null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    }
    return !found.length;
  };
  // Manage Access opens over this page (the same People & Access panels as Settings); nothing navigates away.
  const openAccess = (section = "Users & Login Accounts", locationId: string | null = null) => { setManaging(null); setAccessSiteId(locationId); setAccess(section); };
  const saveLater = () => {
    try { saveDraft(d); toast.success(tr("Setup saved on this device. Continue any time.")); }
    catch {
      // Photos can be larger than the device lets a draft keep: save the rest, and keep the photos on this page until activation.
      try { saveDraft({ ...d, rows: d.rows.map(({ photos: _p, logo: _l, ...r }) => r) }); toast.success(tr("Setup saved on this device. Photos are kept only until you leave this page.")); }
      catch { toast.error(tr("This device has no room to save the setup")); }
    }
  };
  /** Activate first checks every field (the first problem is focused), then shows a short summary to confirm; only "Activate now"
   *  saves locations, people and the account in one go. Success is said only after it saved. */
  const activate = () => {
    if (activating || !check()) return;
    setConfirmActivate(true);
  };
  const activateNow = () => {
    if (activating) return;
    setConfirmActivate(false);
    setActivating(true);
    try {
      activateSetup(d);
      toast.success(tr("Your business is set up"), { description: tr("Next steps are on your Dashboard: add products, make a test sale and invite your staff.") });
      onDone();
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Setup could not be saved")); setActivating(false); }
  };

  // What Activate needs, ticked as it is filled in (Activate still checks everything itself).
  const ready = [
    { label: "Business Name", ok: !!d.businessName.trim() },
    { label: "Business Type", ok: selectedIndustry === "trade" || !!chosenTypes.length },
    { label: "Primary phone", ok: !!d.phone?.trim() },
    { label: "Name every location", ok: live.length > 0 && live.every((r) => !!r.name.trim()) },
  ];
  const readyCount = ready.filter((x) => x.ok).length;
  const price = planPrice(plan, acct.plan === plan.id ? acct.billing : "monthly");
  const trial = acct.plan === "trial";
  const stores = counts.warehouses + counts.stores;
  const full = live.length >= plan.locations;
  const bySlot = new Map(live.map((r, index) => [r.slotNumber ?? index + 1, r]));
  const tableSlots = Array.from({ length: Math.max(plan.locations, live.length) }, (_, index) => ({ n: index + 1, r: bySlot.get(index + 1) }));
  const links = live.filter(isStorage).map((w) => ({ w, shops: live.filter((r) => r.type === "shop" && r.connected?.includes(w.key)) })).filter((x) => x.shops.length);
  const placeName = (k: string) => { const r = live.find((x) => x.key === k); return r ? r.name || r.code : ""; };
  const savedPlaceName = (id: string) => live.find((r) => r.savedId === id)?.name || records.find((l) => l.id === id)?.name || "";
  const userProblems = problems.filter((p) => p.field === "users");
  const peopleAt = (r: SetupRow) => existingPeople.filter((e) => !!r.savedId && (e.locationIds ?? []).includes(r.savedId));
  const editing = editingRow ? live.find((r) => r.key === editingRow.key) : undefined;
  /** Emails already on this business; a new person can't reuse one. `except` is the person being edited. */
  const takenEmails = (except?: string) => [acct.email ?? "", ...existingPeople.map((e) => e.email ?? ""), ...d.users.filter((x) => x.key !== except).map((x) => x.email)].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const putUser = (u: SetupUser) => set({ users: d.users.some((x) => x.key === u.key) ? d.users.map((x) => (x.key === u.key ? u : x)) : [...d.users, u] });

  return <div className="bsetup">
    <header className="bsetup-head">
      {/* Left: the business's own logo from Create Account (or the Zakrio mark), the title, and the country and currency given at
          sign-up. Middle: where this page sits in getting started. Right: what Activate does, then Activate. */}
      <div className="bsetup-head-id">
        <button type="button" className="bsetup-head-logo-btn" title={tr(headLogo ? "Change logo" : "Upload logo")} aria-label={tr(headLogo ? "Change logo" : "Upload logo")} onClick={() => logoFile.current?.click()}>
          {headLogo ? <img className="bsetup-head-logo" src={headLogo} alt="" /> : <ZakrioMark compact />}
          <span className="bsetup-head-logo-edit" aria-hidden><Camera /></span>
        </button>
        <input ref={logoFile} hidden type="file" accept="image/*" onChange={(e) => { pickHeadLogo(e.target.files?.[0]); e.target.value = ""; }} />
        <h1 className="bsetup-title">{tr("Business Setup")}</h1>
        <span className="bsetup-head-sub">
        <button type="button" className="bsetup-head-meta bsetup-place-btn" title={tr("Change country and currency")} onClick={() => setPlaceOpen(true)}>{[countryName, currencyShown].filter(Boolean).join(" · ") || tr("Country & currency")} <Pencil aria-hidden /></button>
        {savedText && <span className="bsetup-saved" role="status">{savedText}</span>}
        </span>
      </div>
      <ol className="bsetup-steps" aria-label={tr("Getting started")}>
        <li className="is-done"><CircleCheck aria-hidden /> {tr("Create Account")}</li>
        <li className="is-done"><CircleCheck aria-hidden /> {tr("Choose plan")}</li>
        <li className="is-now" aria-current="step"><span>3</span> {tr("Business Setup")}</li>
        <li><span>4</span> {tr("Activate")}</li>
      </ol>
      <div className="bsetup-head-actions">
        <ul className={cn("bsetup-ready", readyCount === ready.length && "is-all")} aria-label={tr("Ready to activate?")} title={tr("{x} of 4 ready", String(readyCount))}>
          {ready.map((x) => <li key={x.label} className={x.ok ? "is-ok" : undefined}>{x.ok ? <CircleCheck aria-hidden /> : <span className="bsetup-ready-dot" aria-hidden />} {tr(x.label)}</li>)}
        </ul>
        <ReadyButton s={s} onOpen={() => setReadyOpen(true)} />
        <ShopButton className="bsetup-review" disabled={activating} aria-busy={activating} title={tr("Saves all shops, warehouses and people, then opens your apps")} onClick={activate}>{tr(activating ? "Activating…" : "Activate")} <CircleCheck aria-hidden /></ShopButton>
      </div>
    </header>

    <section className="bsetup-toprow bsetup-profile" aria-label={tr("Business details")}>
      <div className="bsetup-profile-grid">
        <label className="bsetup-field bsetup-name"><span>{tr("Business Name")} <i aria-hidden>*</i></span>
          <input id="bsetup-business-name" className="inventory-input" required value={d.businessName} aria-invalid={!!problem(undefined, "businessName")} onChange={(e) => set({ businessName: e.target.value })} placeholder={tr("Enter business name")} />
        </label>
        <div className="bsetup-profile-phone">
          <label className="bsetup-field bsetup-phone"><span>{tr("Primary phone")}</span>
            <input id="bsetup-phone" className="inventory-input" inputMode="tel" autoComplete="tel" value={d.phone ?? ""} aria-invalid={!!problem(undefined, "phone")} onChange={(e) => set({ phone: e.target.value })} placeholder="+254 7XX XXX XXX" />
          </label>
          {morePhones ? <div className="bsetup-extra-phones">
            <label className="bsetup-field bsetup-phone2"><span>{tr("Second phone")}</span><input id="bsetup-phone2" className="inventory-input" inputMode="tel" value={d.phone2 ?? ""} aria-invalid={!!problem(undefined, "phone2")} onChange={(e) => set({ phone2: e.target.value })} placeholder={tr("Optional")} /></label>
            <label className="bsetup-field bsetup-phone3"><span>{tr("Third phone")}</span><input id="bsetup-phone3" className="inventory-input" inputMode="tel" value={d.phone3 ?? ""} aria-invalid={!!problem(undefined, "phone3")} onChange={(e) => set({ phone3: e.target.value })} placeholder={tr("Optional")} /></label>
          </div> : <button type="button" className="bsetup-link-btn bsetup-more-phones" onClick={() => setMorePhones(true)}><Plus aria-hidden /> {tr("Add another phone")}</button>}
        </div>
        <label className="bsetup-field"><span>{tr("Industry")} <i aria-hidden>*</i></span>
          <IndustrySelect id="bsetup-industry" value={selectedIndustry} keep={isIndustryFamilyId(acct.industryFamilyId) ? acct.industryFamilyId : undefined} onChange={(id) => {
            if (!isIndustryFamilyId(id) || id === selectedIndustry) return;
            set({ industryFamilyId: id, businessType: "", otherType: "", extraBusinessTypes: [] });
          }} />
        </label>
        <div className="bsetup-field"><span>{tr("Business Type")}{selectedIndustry === "trade" ? <small> ({tr("Optional")})</small> : <i aria-hidden> *</i>}</span>
          <TypePicker id="bsetup-business-type" industry={selectedIndustry} value={chosenTypes} invalid={!!problem(undefined, "businessType")}
            onChange={(types) => set({ businessType: types[0] ?? "", otherType: "", extraBusinessTypes: types.slice(1) })} />
          {selectedIndustryConfig?.implementationStatus === "configuration-only" && <small className="bsetup-note">{tr("This records your industry and business type; its specialized operating modules are not available yet.")}</small>}
        </div>
        <div className="bsetup-field bsetup-documents"><span>{tr("Business Documents")} <small>({tr("Optional")})</small></span>
          <input ref={businessFiles} hidden type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => { void pickBusinessDocuments(e.target.files); e.target.value = ""; }} />
          <button type="button" className="bsetup-doc-upload" title={tr("Upload KRA certificates and other business files")} onClick={() => businessFiles.current?.click()}><Paperclip aria-hidden /> {tr("Upload files")}</button>
          {!!d.businessDocuments?.length && <ul className="bsetup-doc-list">{d.businessDocuments.map((doc) => <li key={doc.id}><FileText aria-hidden /><a href={doc.dataUrl} download={doc.name} title={doc.name}>{doc.name}</a><button type="button" aria-label={`${tr("Remove")} ${doc.name}`} title={tr("Remove")} onClick={() => set({ businessDocuments: (d.businessDocuments ?? []).filter((x) => x.id !== doc.id) })}><Trash2 aria-hidden /></button></li>)}</ul>}
        </div>
      </div>
      {selectedIndustry === "trade" && <div className="bsetup-feature-row"><span>{tr("Business Features")}</span><FeatureChecks className="bsetup-feature-checks" value={features} onChange={(p) => set({ features: { ...(d.features ?? {}), ...p } })} /></div>}
      <div className="bsetup-save-row">
        <ShopButton variant="outline" className="bsetup-later" disabled={activating} onClick={saveLater}><Save /> {tr("Save")}</ShopButton>
      </div>
    </section>
    {readyOpen && <GlassPage label={tr("Ready to sell")} onClose={() => setReadyOpen(false)}><ReadyToSell s={s} onClose={() => setReadyOpen(false)} /></GlassPage>}

    <section className="bsetup-card bsetup-entries" aria-label={tr("Shops & Warehouses")}>
      <header className="bsetup-entries-head">
        <h2>{tr("Shops & Warehouses")} <small>{counts.shops} {tr(shopWord)} · {stores} {tr(stores === 1 ? "Warehouse" : "Warehouses")}</small></h2>
        <span className="bsetup-slot-usage">{live.length}/{plan.locations} {tr("used")} · {Math.max(0, plan.locations - live.length)} {tr("remaining")}</span>
        {!full && <span className="bsetup-add">{NEW_LOCATION_TYPES.map((t) => { const I = TYPE_ICON[t]; return <button key={t} type="button" className={cn("bsetup-add-btn", `is-${t}`)} onClick={() => addRow(t)}><Plus /> <I aria-hidden /> {t === "shop" ? `${tr("Add")} ${tr("Shop")}` : tr("Add Warehouse")}</button>; })}</span>}
      </header>
      <div className={cn("bsetup-table", features.counters && "has-counters")} role="table" aria-label={tr("Shops & Warehouses")}>
        <div className={cn("bsetup-entry bsetup-entry-head", features.counters && "has-counters")} role="row">
          <span role="columnheader" className="bsetup-rownum-head">#</span><span role="columnheader">{tr("Shop / Warehouse")}</span><span role="columnheader">{tr("Location Name")}</span><span role="columnheader">{tr("Phone")}</span><span role="columnheader">{tr("Location Number")}</span><span role="columnheader">{tr("Logo")}</span>
          {features.counters && <span role="columnheader">{tr("Counters")}</span>}
          <span role="columnheader">{tr("Upload Products")}</span><span role="columnheader">{tr("Edit")}</span><span className="bsetup-divider" role="separator" aria-hidden="true" /><span role="columnheader">{tr("More Options")}</span><span className="bsetup-divider" role="separator" aria-hidden="true" /><span role="columnheader">{tr("Assign Users")}</span><span role="columnheader">{tr("Delete")}</span>
        </div>
        {tableSlots.map(({ n, r }) => r ? <LocationEntryRow key={r.key} r={r} n={n} tr={tr} nameProblem={problem(r.key, "name")} codeProblem={problem(r.key, "code")} phoneProblem={problem(r.key, "phone")} logo={savedLogo(r)} placeholder={suggestedCode(r)} counterMax={counterMax(r)} onCounters={(value) => setRow(r.key, { counters: value })} canImport={!!r.savedId} onImport={() => setImporting({ kind: "Products", at: r.savedId })} canRemove={r.savedId !== MAIN_LOCATION && live.length > 1} selected={editingRow?.key === r.key} onType={(type) => changeType(r, type)} onPlace={(type) => setRow(r.key, { placeType: type || undefined })} onName={(name) => setRow(r.key, { name })} onPhone={(phone) => setRow(r.key, { phone })} onCode={(code) => setRow(r.key, { code })} onViewLogo={() => setViewingLogo(r.key)} onEdit={() => setEditingRow({ key: r.key })} onManageUsers={() => setManaging(r.key)} onManageAccess={() => r.savedId ? openAccess("Location Assignments", r.savedId) : setManaging(r.key)} onAssignUsers={() => r.savedId ? openAccess("Location Assignments", r.savedId) : setManaging(r.key)} onRemove={() => removeRow(r)} />
          : <LocationEntryRow key={`slot-${n}`} n={n} tr={tr} counterMax={features.counters ? 1 : 0} onType={(type) => addRowAt(n, type as "shop" | "store")} onPlace={(type) => addRowAt(n, "shop", type)} />)}
      </div>
      {problems.filter((p) => p.key && (p.field === "name" || p.field === "code" || p.field === "phone")).slice(0, 3).map((p) => <p key={p.key! + p.field} role="alert" className="bsetup-problem">{tr("Entry")} {live.find((r) => r.key === p.key)?.slotNumber ?? live.findIndex((r) => r.key === p.key) + 1}: {tr(p.message)}</p>)}
      {links.length > 0 && <p className="bsetup-links" title={links.map(({ w, shops }) => `${w.name || w.code} → ${shops.map((x) => x.name || x.code).join(", ")}`).join(" · ")}>{links.map(({ w, shops }) => `${w.name || w.code} → ${shops.map((x) => x.name || x.code).join(", ")}`).join(" · ")} · {tr("Authorized inventory visibility")}</p>}
    </section>

    <footer className={cn("bsetup-card bsetup-footer", (live.length > plan.locations || logins.used > logins.total) && "has-problem")}>
      <div className="bsetup-footer-summary" role="group" aria-label={tr("Plan Usage & Summary")}>
        <p className="bsetup-plan-line"><Crown aria-hidden /> <b>{plan.name}</b><span>· {trial ? <>{tr("Free trial")} · </> : null}${price.amount} {tr(price.period === "year" ? "/ year" : "/ month")}</span><button type="button" className="bsetup-info" aria-label={tr("How plan limits work")} title={tr("How plan limits work")} onClick={() => setInfo(true)}><Info /></button></p>
        <p className="bsetup-plan-sub"><span>{tr("Accounts")} <b>{logins.used}/{logins.total}</b></span><span>· {tr("Managers")} <b>{logins.usedManagers}/{logins.managers}</b></span><span>· {tr("Staff")} <b>{logins.usedStaff}/{logins.staff}</b></span></p>
        <p className="bsetup-plan-sub"><span>{tr("Sites")} <b>{live.length}/{plan.locations}</b> · {Math.max(0, plan.locations - live.length)} {tr("remaining")}</span><span>· {counts.shops} {tr("Shop")}</span><span>· {stores} {tr(stores === 1 ? "Warehouse" : "Warehouses")}</span></p>
      </div>
      <div className="bsetup-footer-actions" aria-label={tr("Company-wide actions")}>
        <button type="button" className="bsetup-link-btn" onClick={() => setOwnerInfo(true)}><Pencil aria-hidden /> {tr("Edit Owner")}</button>
        <button type="button" className="bsetup-link-btn" onClick={() => setManaging("company")}><Users aria-hidden /> {tr("Manage Users")}</button>
        <button type="button" className="bsetup-link-btn" title={tr("Set role templates and individual employee permissions, review invitations, reset access and suspend or reactivate logins. Business Setup and Settings use the same employee and permission records.")} onClick={() => openAccess()}><ShieldCheck aria-hidden /> {tr("Manage Access")}</button>
        <ShopButton className="bsetup-user-btn" disabled={loginFull} title={loginFull ? tr("Your plan has no more login accounts") : undefined} onClick={() => { setNewUserLocation(null); setEditingUser("new"); }}><UserPlus /> {tr("Add User")}</ShopButton>
      </div>
      {userProblems.slice(0, 2).map((p) => <p key={p.message} role="alert" className="bsetup-problem">{tr(p.message)}</p>)}
    </footer>

    {confirmRemove && <GlassNotice title={confirmRemove.rows.length === 1 ? `${tr("Delete")} · ${confirmRemove.rows[0]?.name || confirmRemove.rows[0]?.code || tr("Location")}` : tr("Remove saved locations?")} onClose={() => setConfirmRemove(null)}>
      <p>{tr("These locations already exist. They will be archived when you activate, not deleted: their sales, stock and history are kept and you can bring them back in Settings.")}</p>
      <ul className="bsetup-confirm-list">{confirmRemove.rows.map((r) => <li key={r.key}>{r.code} · {r.name}</li>)}</ul>
      <div className="flex gap-2 pt-1">
        <ShopButton variant="outline" className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" onClick={() => setConfirmRemove(null)}>{tr("Keep them")}</ShopButton>
        <ShopButton className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" onClick={() => { set({ rows: confirmRemove.next, users: d.users.map((u) => ({ ...u, locations: u.locations.filter((k) => !confirmRemove.rows.some((r) => r.key === k)) })) }); setConfirmRemove(null); }}>{tr("Archive on activation")}</ShopButton>
      </div>
    </GlassNotice>}

    {confirmDraft && <GlassNotice title={`${tr("Remove")} · ${confirmDraft.name || `${tr(placeOf(confirmDraft))} ${live.findIndex((r) => r.key === confirmDraft.key) + 1}`}`} onClose={() => setConfirmDraft(null)}>
      <p>{tr("This entry hasn't been activated yet, so nothing is saved for it. It is taken off this page and out of every person's and shop's choices.")}</p>
      <div className="flex gap-2 pt-1">
        <ShopButton variant="outline" className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" onClick={() => setConfirmDraft(null)}>{tr("Keep it")}</ShopButton>
        <ShopButton className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" onClick={() => { removeDraft(confirmDraft); setConfirmDraft(null); }}>{tr("Remove")}</ShopButton>
      </div>
    </GlassNotice>}

    {editing && <EntryEditor key={editing.key} tr={tr} r={editing} rows={live} focus={editingRow?.focus} codeProblem={problem(editing.key, "code")}
      placeholder={suggestedCode(editing)} logo={savedLogo(editing)} users={d.users} people={peopleAt(editing)}
      canManager={plan.managerRoles} business={d.businessName.trim() || acct.shopName || ""} full={loginFull} takenEmails={takenEmails()} counterMax={counterMax(editing)}
      onLogo={() => setViewingLogo(editing.key)} onSend={(u, st, current) => sendInvite(u, st, current)} onConnect={(u) => void connectServer(u)}
      onClose={() => setEditingRow(null)}
      onSave={(rows, users) => { set({ rows: d.rows.map((x) => rows.find((y) => y.key === x.key) ?? x), users }); setEditingRow(null); }} />}

    {editingUser && <UserEditor tr={tr} rows={live} canManager={plan.managerRoles} initial={editingUser === "new" ? (newUserLocation ? { key: newKey(), name: "", phone: "", email: "", role: "staff", locations: [newUserLocation] } : undefined) : editingUser} business={d.businessName.trim() || acct.shopName || ""}
      onSend={sendInvite} onConnect={(u) => void connectServer(u)} takenEmails={takenEmails(editingUser === "new" ? undefined : editingUser.key)}
      onClose={() => { setEditingUser(null); setNewUserLocation(null); }} onSave={(u) => { putUser(u); setEditingUser(null); setNewUserLocation(null); }} />}

    {managing && (() => {
      const site = managing === "company" ? undefined : live.find((r) => r.key === managing);
      const scopedUsers = site ? d.users.filter((u) => u.locations.includes(site.key)) : d.users;
      const otherUsers = site ? d.users.filter((u) => !u.locations.includes(site.key)) : [];
      return <ManageUsers tr={tr} owner={acct.email || tr("Owner")} site={site} siteName={site ? site.name || site.code : undefined} people={site ? peopleAt(site) : existingPeople} users={scopedUsers} others={otherUsers} placeName={placeName} savedPlaceName={savedPlaceName} logins={logins}
        onEdit={(u) => { setManaging(null); setEditingUser(u); }} onRemove={(u) => set({ users: d.users.filter((x) => x.key !== u.key) })}
        onAssign={site ? (u) => set({ users: d.users.map((x) => x.key === u.key ? { ...x, locations: [...new Set([...x.locations, site.key])] } : x) }) : undefined}
        onAdd={() => { setManaging(null); setNewUserLocation(site?.key ?? null); setEditingUser("new"); }} onAccess={() => openAccess("Location Assignments", site?.savedId ?? null)} onClose={() => setManaging(null)} />;
    })()}
    {welcome && <GlassNotice title={tr("Welcome to Business Setup")} onClose={closeWelcome} className="bsetup-dialog bsetup-welcome">
      <p>{tr("Four short steps, all on this page:")}</p>
      <ol className="bsetup-welcome-steps">
        <li><b>{tr("Your business")}</b> · {tr("check the name, pick your business type and add your phone numbers.")}</li>
        <li><b>{tr("Shops & Warehouses")}</b> · {tr("add each one with the green buttons and choose its counters.")}</li>
        <li><b>{tr("Your people")}</b> · {tr("add managers and staff with Add User (optional, you can do it later).")}</li>
        <li><b>{tr("Activate")}</b> · {tr("check the summary and activate. Your apps open straight after.")}</li>
      </ol>
      <p className="bsetup-note">{tr("Save keeps your work on this device at any time, so you can finish later.")}</p>
      <div className="flex justify-end pt-1"><ShopButton className="bsetup-welcome-go" onClick={closeWelcome}>{tr("Let's start")}</ShopButton></div>
    </GlassNotice>}
    {confirmActivate && <ActivateSummary tr={tr} d={d} live={live} plan={plan} logins={logins} existing={existingPeople.length} onBack={() => setConfirmActivate(false)} onGo={activateNow} />}
    {access && <AccessDialog tr={tr} section={access} siteId={accessSiteId ?? undefined} siteName={accessSiteId ? savedPlaceName(accessSiteId) : undefined} onSection={setAccess} onClose={() => { setAccess(null); setAccessSiteId(null); }} />}

    {ownerInfo && <GlassNotice title={tr("Owner")} onClose={() => setOwnerInfo(false)} className="bsetup-dialog">
      <dl className="bsetup-review-facts"><dt>{tr("Email")}</dt><dd>{acct.email || "—"}</dd><dt>{tr("Role")}</dt><dd>{tr("Owner")}</dd><dt>{tr("Access")}</dt><dd>{tr("All Shops and Warehouses")}</dd></dl>
      <p className="bsetup-note">{tr("The owner can't be removed, suspended or given another role here. Your sign-in email changes only through your own sign-in, with the new address verified first.")}</p>
      <div className="flex gap-2 pt-1"><ShopButton className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" onClick={() => setOwnerInfo(false)}>{tr("Close")}</ShopButton></div>
    </GlassNotice>}


    {importing && <ImportPanel tr={tr} kind={importing.kind} start={importing.at} onClose={() => setImporting(null)} />}
    {viewingLogo && (() => { const r = live.find((x) => x.key === viewingLogo); if (!r) return null; return <LogoDialog tr={tr} name={r.name || tr(placeOf(r))} logo={savedLogo(r)} photos={savedPhotos(r)} onSave={(logo) => { setRow(r.key, { logo }); toast.success(tr("Logo saved for this entry")); setViewingLogo(null); }} onClose={() => setViewingLogo(null)} />; })()}

    {placeOpen && <GlassNotice title={tr("Country & currency")} onClose={() => setPlaceOpen(false)} className="bsetup-dialog bsetup-place">
      <div className="bsetup-place-pickers">
        <SearchableCountryPicker value={place.country || "KEN"} onChange={(country, currency) => savePlace({ country, currency: currency || place.currency })} />
        <SearchableCurrencyPicker value={place.currency || "KSH"} onChange={(currency, country) => savePlace({ currency, country: country || place.country })} />
      </div>
      <p className="bsetup-note">{tr("Choosing a country also sets its currency. Amounts already recorded are not converted.")}</p>
      <div className="flex justify-end pt-1"><ShopButton className="h-auto min-h-11 px-5 py-2 text-sm" onClick={() => setPlaceOpen(false)}>{tr("Done")}</ShopButton></div>
    </GlassNotice>}

    {info && <GlassNotice title={tr("How plan limits work")} onClose={() => setInfo(false)} className="bsetup-dialog">
      <p>{[...planAllowanceLines(plan), planCounterLine(plan)].map((l) => tr(l)).join(" · ")}</p>
      <p>{tr("Every Shop or Warehouse uses one location allowance. Choose any mix within the plan's total location limit.")}</p>
      <p>{tr(planEmployeeRule(plan))}</p>
      {counts.warehouses > 0 && counts.shops > 0 && <p>{tr("Use ✎ on a Warehouse to let Shops view its stock. Connecting uses no extra location.")}</p>}
      <p>{tr("Each person counts once for the account, even if assigned to several locations. Staff can be placed at any shop or warehouse.")}</p>
    </GlassNotice>}

  </div>;
}

/** One shop or warehouse, left to right: type, name, optional number, its own logo (opens the logo window), import products,
 *  edit (name, number, logo, stock visibility and this site's users) and delete last. Long names and numbers show in full as a tooltip and in the editor. */
function LegacyEntryRow({ r, n, tr, nameProblem, codeProblem, phoneProblem, onPhone, logo, placeholder, counterMax, canImport, onImport, canRemove, selected, onType, onPlace, onName, onCode, onViewLogo, onCounters, onEdit, onRemove }: {
  r: SetupRow; n: number; tr: Tr; nameProblem?: string | undefined; codeProblem?: string | undefined; logo?: string | undefined; placeholder: string;
  /** This location's own phone, printed on its receipts instead of the business number (optional). */
  phoneProblem?: string | undefined; onPhone: (phone: string) => void;
  /** The most counters this shop may have (0 while Counters is off or for a warehouse). */
  counterMax: number; canRemove: boolean; selected: boolean;
  /** Upload products for this location: only once it is saved (after Activate). */
  canImport: boolean; onImport: () => void;
  onType: (t: erp.LocationType) => void; onPlace: (type: string) => void; onName: (name: string) => void; onCode: (code: string) => void; onViewLogo: () => void; onCounters: (n: number) => void; onEdit: () => void; onRemove: () => void;
}) {
  const counters = r.counters ?? 1, showCounters = r.type === "shop" && counterMax > 0;
  const label = placeOf(r), title = r.name || `${tr(label)} ${n}`;
  // One choice per ticked business type (each a shop), then Warehouse; an older warehouse keeps its own entry.
  const choices = [...new Set(shopTypes.length ? shopTypes : [""])].map((t) => ({ value: `shop:${t}`, label: placeName(t) }));
  const value = r.type === "shop" ? `shop:${placeTypeOf(r) ?? ""}` : r.type;
  return <div className={cn("bsetup-entry", `is-${r.type}`, selected && "is-selected", (nameProblem || codeProblem || phoneProblem) && "has-problem")} role="row">
    {/* Where the row sits on the page (1-5 left, 6-10 middle). It is not the location's number and is never saved. */}
    <span className="bsetup-rownum" role="cell" aria-label={`${tr("Row")} ${n}`}>{n}</span>
    <select className="inventory-input bsetup-type" role="cell" aria-label={`${tr("Type")} · ${title}`} title={tr(label)} value={value} onChange={(e) => { const v = e.target.value; if (v.startsWith("shop:")) onPlace(v.slice(5)); else onType(v as erp.LocationType); }}>
      {choices.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}
      <option value="store">{tr("Warehouse")}</option>
      {r.type === "warehouse" && <option value="warehouse">{`${tr("Warehouse")} (${tr("older")})`}</option>}
    </select>
    {/* Name and the location's own phone share the name column, so every row layout (laptop table, phone two-line) keeps working. */}
    <span className="bsetup-entry-name bsetup-name-cell" role="cell">
    <input id={`bsetup-name-${r.key}`} className="inventory-input bsetup-name-input" required aria-label={`${tr(`${label} Name`)} ${n}`} aria-invalid={!!nameProblem}
      title={nameProblem ? tr(nameProblem) : r.name || undefined} value={r.name} placeholder={r.type === "shop" ? `${tr(label)} · ${tr("Name")}` : tr("Warehouse name")} onChange={(e) => onName(e.target.value)} />
    <input id={`bsetup-phone-${r.key}`} type="tel" inputMode="tel" autoComplete="off" className="inventory-input bsetup-loc-phone" aria-label={`${tr("Phone")} · ${title} (${tr("Optional")})`} aria-invalid={!!phoneProblem}
      title={phoneProblem ? tr(phoneProblem) : tr("This location's phone, printed on its receipts. Empty: the business number.")} value={r.phone ?? ""} placeholder={tr("Phone (optional)")} onChange={(e) => onPhone(e.target.value)} />
    </span>
    <input id={`bsetup-code-${r.key}`} role="cell" className="inventory-input bsetup-code" aria-label={`${tr(`${label} No.`)} ${n} (${tr("Optional")})`} aria-invalid={!!codeProblem}
      title={codeProblem ? tr(codeProblem) : r.code || `${placeholder} · ${tr("given on activation if left empty")}`} value={r.code} placeholder={placeholder} onChange={(e) => onCode(e.target.value)} />
    {/* This entry's own logo, never the business logo, shown whole (contain) so no branding is cropped. It opens the logo window. */}
    <button type="button" role="cell" className={cn("bsetup-logo", logo && "has-logo")} aria-label={`${tr(logo ? "Change logo" : "Add logo")} · ${title}`} title={tr(logo ? "Change logo" : "Add logo")} onClick={onViewLogo}>
      {logo ? <img src={logo} alt="" /> : <ImagePlus aria-hidden />}
    </button>
    <span className="bsetup-actions" role="cell">
      {/* A shop's counters (tills), within the plan; a warehouse keeps the space so the rows line up. */}
      {showCounters ? <select className="bsetup-counter" aria-label={`${tr("Counters")} · ${title}`} title={`${tr("Counters")} (≤ ${counterMax})`} value={counters}
        onChange={(e) => onCounters(Number(e.target.value))}>
        {Array.from({ length: Math.max(counterMax, counters) }, (_, i) => i + 1).map((x) => <option key={x} value={x} disabled={x > counterMax}>{x}</option>)}
      </select> : <span className="bsetup-counter is-empty" aria-hidden />}
      <button type="button" aria-label={`${tr("Upload products")} · ${title}`} title={canImport ? tr("Upload products for this location") : tr("Upload products here after Activate")} disabled={!canImport} onClick={onImport}><Upload /></button>
      {/* This site's users are managed inside its editor (the pencil); business-wide Manage Users and Add User stay at the bottom. */}
      <button type="button" aria-label={`${tr("Edit")} · ${title}`} title={tr("Edit details, stock visibility and users")} onClick={onEdit}><Pencil /></button>
      <button type="button" className="is-danger" aria-label={`${tr("Remove")} · ${title}`} disabled={!canRemove} title={canRemove ? tr("Remove") : tr("The first location stays. Rename it or change its type.")} onClick={onRemove}><Trash2 /></button>
    </span>
  </div>;
}

type LocationEntryProps = {
  r?: SetupRow | undefined; n: number; tr: Tr; nameProblem?: string | undefined; codeProblem?: string | undefined; phoneProblem?: string | undefined; logo?: string | undefined; placeholder?: string | undefined;
  counterMax?: number | undefined; canImport?: boolean | undefined; canRemove?: boolean | undefined; selected?: boolean | undefined;
  onType: (t: erp.LocationType) => void; onPlace: (type: string) => void; onName?: (name: string) => void; onPhone?: (phone: string) => void; onCode?: (code: string) => void;
  onViewLogo?: (() => void) | undefined; onCounters?: (n: number) => void; onImport?: (() => void) | undefined; onEdit?: (() => void) | undefined; onManageUsers?: (() => void) | undefined; onManageAccess?: (() => void) | undefined; onAssignUsers?: (() => void) | undefined; onRemove?: (() => void) | undefined;
};
function LocationEntryRow({ r, n, tr, nameProblem, codeProblem, phoneProblem, logo, placeholder, counterMax = 0, canImport = false, canRemove = false, selected = false, onType, onPlace, onName, onPhone, onCode, onViewLogo, onCounters, onImport, onEdit, onManageUsers, onManageAccess, onAssignUsers, onRemove }: LocationEntryProps) {
  const label = r ? placeOf(r) : shopWord;
  const title = r ? r.name || `${tr(label)} ${n}` : `${tr("Location")} ${n}`;
  const choices = [...new Set(shopTypes.length ? shopTypes : [""])].map((t) => ({ value: `shop:${t}`, label: placeName(t) }));
  const value = r ? r.type === "shop" ? `shop:${placeTypeOf(r) ?? ""}` : r.type : "";
  const showCounters = !!r && r.type === "shop" && counterMax > 0;
  const counters = r?.counters ?? 1;
  const pickType = (v: string) => { if (v.startsWith("shop:")) onPlace(v.slice(5)); else if (v) onType(v as erp.LocationType); };
  return <div className={cn("bsetup-entry", r && `is-${r.type}`, !r && "is-empty-slot", selected && "is-selected", (nameProblem || codeProblem || phoneProblem) && "has-problem")} role="row">
    <span className="bsetup-rownum" role="cell" aria-label={`${tr("Row")} ${n}`}>{n}</span>
    <select className="inventory-input bsetup-type" role="cell" aria-label={`${tr("Type")} · ${title}`} title={r ? tr(label) : tr("Choose Shop or Warehouse")} value={value} onChange={(e) => pickType(e.target.value)}>
      {!r && <option value="">{tr("Choose…")}</option>}
      {choices.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}
      <option value="store">{tr("Warehouse")}</option>
      {r?.type === "warehouse" && <option value="warehouse">{`${tr("Warehouse")} (${tr("older")})`}</option>}
    </select>
    <span className="bsetup-cell-name" role="cell">{r ? <input id={`bsetup-name-${r.key}`} className="inventory-input bsetup-name-input" required aria-label={`${tr(`${label} Name`)} ${n}`} aria-invalid={!!nameProblem} title={nameProblem ? tr(nameProblem) : r.name || undefined} value={r.name} placeholder={r.type === "shop" ? `${tr(label)} · ${tr("Name")}` : tr("Warehouse name")} onChange={(e) => onName?.(e.target.value)} /> : <span className="bsetup-empty-cell" aria-hidden />}</span>
    <span className="bsetup-cell-phone" role="cell">{r ? <input id={`bsetup-phone-${r.key}`} type="tel" inputMode="tel" autoComplete="off" className="inventory-input bsetup-loc-phone" aria-label={`${tr("Phone")} · ${title} (${tr("Optional")})`} aria-invalid={!!phoneProblem} title={phoneProblem ? tr(phoneProblem) : tr("This location's phone, printed on its receipts. Empty: the business number.")} value={r.phone ?? ""} placeholder={tr("Optional")} onChange={(e) => onPhone?.(e.target.value)} /> : <span className="bsetup-empty-cell" aria-hidden />}</span>
    <span className="bsetup-cell-code" role="cell">{r ? <input id={`bsetup-code-${r.key}`} className="inventory-input bsetup-code" aria-label={`${tr(`${label} No.`)} ${n} (${tr("Optional")})`} aria-invalid={!!codeProblem} title={codeProblem ? tr(codeProblem) : r.code || `${placeholder ?? ""} · ${tr("given on activation if left empty")}`} value={r.code} placeholder={placeholder} onChange={(e) => onCode?.(e.target.value.toUpperCase())} /> : <span className="bsetup-empty-cell" aria-hidden />}</span>
    <span className="bsetup-cell-logo" role="cell">{r ? <button type="button" className={cn("bsetup-logo", logo && "has-logo")} aria-label={`${tr(logo ? "Change logo" : "Add logo")} · ${title}`} title={tr(logo ? "Change logo" : "Add logo")} onClick={onViewLogo}>{logo ? <img src={logo} alt="" /> : <ImagePlus aria-hidden />}</button> : <span className="bsetup-empty-cell" aria-hidden />}</span>
    {counterMax > 0 && <span className="bsetup-cell-counters" role="cell">{showCounters ? <select className="bsetup-counter" aria-label={`${tr("Counters")} · ${title}`} title={`${tr("Counters")} (≤ ${counterMax})`} value={counters} onChange={(e) => onCounters?.(Number(e.target.value))}>{Array.from({ length: Math.max(counterMax, counters) }, (_, i) => i + 1).map((x) => <option key={x} value={x} disabled={x > counterMax}>{x}</option>)}</select> : <span className="bsetup-counter is-empty" aria-hidden />}</span>}
    <span className="bsetup-cell-upload" role="cell">{r ? <button type="button" aria-label={`${tr("Upload products")} · ${title}`} title={canImport ? tr("Upload products for this location") : tr("Upload products here after Activate")} disabled={!canImport} onClick={onImport}><Upload /><span>{tr("Upload Products")}</span></button> : <span className="bsetup-empty-cell" aria-hidden />}</span>
    <span className="bsetup-cell-edit" role="cell">{r ? <button type="button" aria-label={`${tr("Edit")} · ${title}`} title={tr("Edit Location")} onClick={onEdit}><Pencil /><span>{tr("Edit")}</span></button> : <span className="bsetup-empty-cell" aria-hidden />}</span>
    <span className="bsetup-divider" role="separator" aria-hidden="true" />
    <span className="bsetup-cell-more" role="cell">{r ? <details className="bsetup-more-menu"><summary><MoreHorizontal aria-hidden /><span>{tr("More Options")}</span><ChevronDown aria-hidden /></summary><div className="bsetup-more-pop" role="menu"><button type="button" role="menuitem" onClick={onManageUsers}>{tr("Manage Users")}</button><button type="button" role="menuitem" onClick={onManageAccess}>{tr("Manage Access")}</button><button type="button" role="menuitem" onClick={onEdit}>{tr("Edit Location")}</button></div></details> : <span className="bsetup-empty-cell" aria-hidden />}</span>
    <span className="bsetup-divider" role="separator" aria-hidden="true" />
    <span className="bsetup-cell-assign" role="cell">{r ? <button type="button" onClick={onAssignUsers}><Users aria-hidden /><span>{tr("Assign Users")}</span></button> : <span className="bsetup-empty-cell" aria-hidden />}</span>
    <span className="bsetup-cell-delete" role="cell">{r ? <button type="button" className="is-danger" disabled={!canRemove} aria-label={`${tr("Delete")} · ${title}`} title={canRemove ? `${tr("Delete")} · ${title}` : tr("The first location stays. Rename it or change its type.")} onClick={onRemove}>{tr("Delete")}</button> : <span className="bsetup-empty-cell" aria-hidden />}</span>
  </div>;
}
void LegacyEntryRow;

/** Upload products (or opening stock) for one location, from its row. The device works at that location while this is open. */
function ImportPanel({ tr, kind, start, onClose }: { tr: Tr; kind: "Products" | "Opening Stock"; start?: string | undefined; onClose: () => void }) {
  const s = useErp();
  const places = listLocations(s).filter((l) => l.active !== false);
  const [before] = useState(() => erp.selectedShop(s));
  const [at, setAt] = useState<string>(start ?? before ?? MAIN_LOCATION);
  useEffect(() => { erp.selectShop(at); }, [at]);
  const close = () => { erp.selectShop(before); onClose(); };
  return <GlassNotice title={tr(kind === "Products" ? "Upload products" : "Opening stock for a location")} onClose={close} className="bsetup-dialog is-wide">
    <label className="bsetup-field"><span>{tr(kind === "Products" ? "Products are added at" : "Opening stock goes to")}</span>
      <select className="inventory-input" value={at} onChange={(e) => setAt(e.target.value)}>{places.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}</select>
    </label>
    <ImportCenter tr={tr} only={kind} />
  </GlassNotice>;
}

/** What Activate will save, shown once every field has passed its checks, so nothing is activated by mistake. */
function ActivateSummary({ tr, d, live, plan, logins, existing, onBack, onGo }: { tr: Tr; d: SetupDraft; live: SetupRow[]; plan: ReturnType<typeof setupPlan>; logins: ReturnType<typeof loginSummary>; existing: number; onBack: () => void; onGo: () => void }) {
  const shops = live.filter((r) => r.type === "shop"), warehouses = live.length - shops.length;
  const byPlace = new Map<string, number>();
  for (const r of shops) { const k = placeOf(r); byPlace.set(k, (byPlace.get(k) ?? 0) + 1); }
  const counters = shops.reduce((n, r) => n + Math.max(1, r.counters ?? 1), 0);
  const types = draftTypes(d);
  const phones = [d.phone, d.phone2, d.phone3].map((x) => x?.trim()).filter(Boolean);
  const Row = ({ k, v }: { k: string; v: string }) => <><dt>{tr(k)}</dt><dd>{v}</dd></>;
  return <GlassNotice title={tr("Ready to activate?")} onClose={onBack} className="bsetup-dialog bsetup-confirm-activate">
    <dl className="bsetup-review-facts">
      <Row k="Business Name" v={d.businessName.trim()} />
      <Row k="Business Type" v={types.map((t) => tr(t)).join(", ")} />
      <Row k="Shops & Warehouses" v={[...[...byPlace].map(([k, n]) => `${n} ${tr(k)}`), `${warehouses} ${tr(warehouses === 1 ? "Warehouse" : "Warehouses")}`].join(" · ")} />
      <Row k="Counters" v={String(counters)} />
      <Row k="Accounts" v={`${logins.used}/${logins.total} · ${tr("Managers")} ${logins.usedManagers}/${logins.managers} · ${tr("Staff")} ${logins.usedStaff}/${logins.staff}${existing ? "" : ""}`} />
      <Row k="Phone Number" v={phones.join(" · ") || "—"} />
      <Row k="Tax PIN" v={d.taxPin?.trim() || "—"} />
      <Row k="Plan" v={`${plan.name} · ${live.length}/${plan.locations} ${tr("Sites")}`} />
    </dl>
    <p className="bsetup-note">{tr("Activate saves all of this at once and opens your apps. You can change any of it later in Settings.")}</p>
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      <ShopButton variant="outline" onClick={onBack}>{tr("Go back")}</ShopButton>
      <ShopButton className="bsetup-welcome-go" onClick={onGo}><CircleCheck aria-hidden /> {tr("Activate now")}</ShopButton>
    </div>
  </GlassNotice>;
}

/** Manage Access over the Setup page: the same People & Access panels as Settings (employees, logins, roles and permissions,
 *  locations, invitations, access and security), on the same records, so the two never differ. */
function AccessDialog({ tr, section, siteId, siteName, onSection, onClose }: { tr: Tr; section: string; siteId?: string | undefined; siteName?: string | undefined; onSection: (s: string) => void; onClose: () => void }) {
  const s = useErp();
  const history = <div>{s.audit.slice(0, 30).map((x) => <div className="settings-audit" key={x.id}><b>{tr(x.action)}</b><span>{x.detail}</span><small>{x.user} • {new Date(x.at).toLocaleString("en-GB")}</small></div>)}</div>;
  return <GlassNotice title={tr("Manage Access")} onClose={onClose} className="bsetup-dialog is-wide bsetup-access-dialog">
    <div className="bsetup-access-tabs" role="tablist" aria-label={tr("Manage Access")}>
      {PEOPLE_SECTIONS.map((x) => <button key={x} type="button" role="tab" aria-selected={x === section} className={cn("bsetup-access-tab", x === section && "is-on")} onClick={() => onSection(x)}>{tr(x)}</button>)}
    </div>
    {siteName && <p className="bsetup-note">{tr("Location")}: <b>{siteName}</b></p>}
    <div className="bsetup-access-body"><PeoplePanel name={section} tr={tr} history={history} locationId={siteId} /></div>
  </GlassNotice>;
}

/** Largest logo file accepted before it is shrunk on the device. */
const LOGO_MAX_BYTES = 5 * 1024 * 1024;
/** One entry's logo: a 160px preview, upload or take a photo (a computer without a camera opens the file picker instead), or pick one of
 *  the location photos explicitly. Nothing changes until Save; Cancel keeps the logo as it was. The location photos stay separate. */
function LogoDialog({ tr, name, logo, photos, onSave, onClose }: { tr: Tr; name: string; logo?: string | undefined; photos: string[]; onSave: (logo: string | undefined) => void; onClose: () => void }) {
  const [next, setNext] = useState<string | undefined>(logo);
  const file = useRef<HTMLInputElement>(null), camera = useRef<HTMLInputElement>(null);
  const read = async (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) { toast.error(tr("Choose a PNG, JPG, WEBP or GIF image")); return; }
    if (f.size > LOGO_MAX_BYTES) { toast.error(tr("Choose an image under 5 MB")); return; }
    try { setNext(await readProductImage(f, 256)); } catch (e) { toast.error(tr(e instanceof Error ? e.message : "That image could not be read")); }
  };
  return <GlassNotice title={`${tr("Logo")} · ${name}`} onClose={onClose} className="bsetup-dialog">
    <div className="bsetup-logo-preview">{next ? <img src={next} alt={`${tr("Logo")} · ${name}`} /> : <span className="bsetup-logo-empty"><ImagePlus aria-hidden />{tr("No logo yet")}</span>}</div>
    <div className="bsetup-logo-tools">
      <ShopButton variant="outline" className="h-auto min-h-10 px-3 py-1.5 text-sm" onClick={() => file.current?.click()}><Upload /> {tr("Upload image")}</ShopButton>
      <ShopButton variant="outline" className="h-auto min-h-10 px-3 py-1.5 text-sm" onClick={() => camera.current?.click()}><Camera /> {tr("Take photo")}</ShopButton>
      {next && <ShopButton variant="outline" className="h-auto min-h-10 px-3 py-1.5 text-sm" onClick={() => setNext(undefined)}><Trash2 /> {tr("Remove logo")}</ShopButton>}
    </div>
    {photos.length > 0 && <div className="bsetup-field"><span>{tr("Use a location photo as the logo")}</span>
      <div className="bsetup-photo-picks">{photos.map((ph, i) => <button key={i} type="button" className={cn(next === ph && "is-on")} aria-label={`${tr("Select as logo")} · ${i + 1}`} title={tr("Select as logo")} onClick={() => setNext(ph)}><img src={ph} alt="" /></button>)}</div>
    </div>}
    <p className="bsetup-note">{tr("The logo is this entry's own picture, separate from its location photos and from the business logo. PNG, JPG, WEBP or GIF, up to 5 MB.")}</p>
    <div className="flex gap-2 pt-1">
      <ShopButton variant="outline" className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" onClick={onClose}>{tr("Cancel")}</ShopButton>
      <ShopButton className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" disabled={next === logo} onClick={() => onSave(next)}>{tr("Save logo")}</ShopButton>
    </div>
    <input ref={file} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
    <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
  </GlassNotice>;
}

/** How a site reads in every list of choices: its real name with its type beside it ("Zigu Shop"), or with no real name its type and its
 *  Business Setup row number ("Shop 2", "Warehouse 9"). A blank name or the field's own placeholder text ("Shop Name") counts as no name,
 *  for display only: nothing stored changes, and the row number is the page's, never a code and never a filtered list's position. */
const PLACEHOLDER_NAME = /^(shop|store|warehouse) name$|^.+ · name$/i;
const realName = (x: SetupRow) => { const n = x.name.trim(); return PLACEHOLDER_NAME.test(n) ? "" : n; };
function siteLabelParts(tr: Tr, rows: SetupRow[], x: SetupRow): [string, string] {
  const type = tr(placeOf(x)), name = realName(x);
  if (!name) return [`${type} ${rows.findIndex((y) => y.key === x.key) + 1}`, ""];
  // A name that already ends with its type ("Main Shop") doesn't get it twice.
  return [name, name.toLowerCase().endsWith(type.toLowerCase()) ? "" : type];
}
const siteLabel = (tr: Tr, rows: SetupRow[], x: SetupRow) => siteLabelParts(tr, rows, x).filter(Boolean).join(" ");

/** Ticks for sites: the whole label is clickable, the type sits right after the name, long names wrap inside their own cell. */
function SitePicks({ tr, legend, rows, list, chosen, required, five, disabled, onToggle }: {
  tr: Tr; legend: string; rows: SetupRow[]; list: SetupRow[]; chosen: string[]; required?: boolean; five?: boolean; disabled?: boolean; onToggle: (key: string, on: boolean) => void;
}) {
  return <fieldset className="bsetup-field bsetup-editor-sec" disabled={disabled}><legend>{legend}{required && <> <i aria-hidden>*</i></>}</legend>
    <div className={cn("bsetup-loc-picks", five && "is-five")}>{list.map((x) => {
      const [main, type] = siteLabelParts(tr, rows, x), on = chosen.includes(x.key);
      return <label key={x.key} className={cn("bsetup-pick", on && "is-on")} title={`${siteLabel(tr, rows, x)}${x.code ? ` · ${x.code}` : ""}`}>
        <input type="checkbox" checked={on} onChange={(e) => onToggle(x.key, e.target.checked)} />
        <span className="bsetup-pick-name">{main}{type && <small> {type}</small>}</span>
      </label>;
    })}</div>
    {!list.length && <p className="bsetup-note">{tr("No location fits this role yet.")}</p>}
  </fieldset>;
}

/** Which counters a person may use at each of their shops that has more than one. Nothing ticked at a shop: any counter there.
 *  POS on their device then offers only these (erp.allowedCounters). */
function CounterPicks({ tr, rows, chosen, value, onChange }: { tr: Tr; rows: SetupRow[]; chosen: string[]; value?: Record<string, number[]> | undefined; onChange: (v: Record<string, number[]>) => void }) {
  const shops = rows.filter((r) => r.type === "shop" && chosen.includes(r.key) && (r.counters ?? 1) > 1);
  if (!shops.length) return null;
  const v = value ?? {};
  const toggle = (key: string, n: number, on: boolean) => onChange({ ...v, [key]: on ? [...new Set([...(v[key] ?? []), n])].sort((a, b) => a - b) : (v[key] ?? []).filter((x) => x !== n) });
  return <fieldset className="bsetup-field bsetup-editor-sec bsetup-counter-picks"><legend>{tr("Counters this person can use")}</legend>
    {shops.map((r) => <div key={r.key} className="bsetup-counter-line">
      <span className="bsetup-pick-name">{siteLabel(tr, rows, r)}</span>
      <div className="bsetup-loc-picks">{Array.from({ length: r.counters ?? 1 }, (_, i) => i + 1).map((n) => {
        const on = (v[r.key] ?? []).includes(n);
        return <label key={n} className={cn("bsetup-pick", on && "is-on")}><input type="checkbox" checked={on} onChange={(e) => toggle(r.key, n, e.target.checked)} /><span>{tr("Counter")} {n}</span></label>;
      })}</div>
    </div>)}
    <p className="bsetup-note">{tr("Nothing ticked at a shop means any of its counters.")}</p>
  </fieldset>;
}

/** Shopkeepers work in shops and warehouse staff in stores and warehouses; the other roles can be anywhere (no role chosen yet: anywhere). */
const fitsRole = (role: string, type: erp.LocationType) => (role === "shopkeeper" ? type === "shop" : role === "warehouse_staff" ? type !== "shop" : role !== "staff");

/** What each role can do by default (the role templates in migration 0009); People & Access can fine-tune a person later. */
const ROLE_HELP: Record<string, string> = {
  admin: "Everything except owner-only settings such as the subscription.",
  manager: "Daily work: inventory, purchases, sales, POS, expenses, contacts, float and reports; approves purchases and expenses, refunds and transfers.",
  shopkeeper: "Sells in POS and Sales and can see inventory.",
  warehouse_staff: "Receives and adjusts stock and makes transfers.",
  staff: "Starts with no access; you choose what they can open in People & Access.",
};

/** The checked, tidied person (only sites their role may use), or null after saying what's wrong. Emails already on the business are refused. */
function checkUser(tr: Tr, u: SetupUser, places: SetupRow[], rows: SetupRow[], takenEmails: string[]): SetupUser | null {
  const chosen = places.filter((r) => u.locations.includes(r.key));
  const email = u.email.trim();
  const wrong = !u.name.trim() ? "Enter the person's full name" : !email ? "Enter the person's email: their invitation goes there"
    : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? "Enter a valid email" : takenEmails.includes(email.toLowerCase()) ? "Someone on this business already uses this email"
    : u.phone.trim() && u.phone.replace(/\D/g, "").length < 7 ? "Enter a valid phone number" : !u.role ? "Choose a role" : !chosen.length ? "Choose at least one location" : "";
  if (wrong) { toast.error(tr(wrong)); return null; }
  // A site with no name at all can't be saved yet, so nobody is given access to it.
  const unnamed = chosen.find((r) => !r.name.trim());
  if (unnamed) { toast.error(tr("Give {x} a name before assigning someone to it", siteLabel(tr, rows, unnamed))); return null; }
  return { ...u, name: u.name.trim(), phone: u.phone.trim(), email, locations: chosen.map((r) => r.key) };
}

/** Add & Send Invitation: how far it got, whether it is running, and why it stopped. "Sent" only when the email provider took the message. */
function useInvite(onSend: (u: SetupUser, stage: InviteStage) => Promise<InviteStage>) {
  const [stage, setStage] = useState<InviteStage>({}), [sending, setSending] = useState(false), [needConnect, setNeedConnect] = useState(false), [failed, setFailed] = useState("");
  const send = async (x: SetupUser) => {
    if (sending) return false;
    setSending(true); setFailed(""); setNeedConnect(false);
    try { const next = await onSend(x, stage); setStage(next); if (!next.sent) setFailed(next.error ?? "The email wasn't sent"); return !!next.sent; }
    catch (e) {
      if (e instanceof NeedsConnection) setNeedConnect(true);
      else { const st = stageOf(e); if (st) setStage(st); setFailed(friendly(e)); }
      return false;
    } finally { setSending(false); }
  };
  const reset = () => { setStage({}); setFailed(""); setNeedConnect(false); };
  return { stage, sending, needConnect, failed, send, reset, done: !!stage.sent, locked: !!stage.employeeId };
}
type Invite = ReturnType<typeof useInvite>;

function InviteOutcome({ tr, inv, email, onConnect }: { tr: Tr; inv: Invite; email: string; onConnect: () => void }) {
  return <>
    {inv.needConnect && <div className="bsetup-prereq" role="alert">
      <p>{tr("Logins are created on the server, and this owner account isn't connected to it yet. Nothing was sent or saved for this person.")}</p>
      <p className="bsetup-note">{tr("Your setup and this person are saved on this device. Open People & Access to connect with Email, Apple or Google, then return here and press Add & Send Invitation again.")}</p>
      <ShopButton className="h-auto min-h-10 px-3 py-1.5 text-sm" onClick={onConnect}>{tr("Open People & Access")}</ShopButton>
    </div>}
    {inv.failed && !inv.done && <p role="alert" className="bsetup-problem">{inv.stage.memberId ? `${tr("The login was created, but the invitation email wasn't sent")}: ${tr(inv.failed)}` : inv.stage.employeeId ? `${tr("The employee was saved, but the login wasn't created")}: ${tr(inv.failed)}` : tr(inv.failed)}</p>}
    {inv.done && <p role="status" className="bsetup-sent">{tr("Invitation sent")} · {email} · {tr("Pending acceptance")}<small> · {tr("The email provider accepted the message; that doesn't yet mean it reached the inbox or was accepted.")}</small></p>}
  </>;
}

/** The one compact editor for a shop or a warehouse (about 740px wide). Top: the title, then Send Invitation and Save. Then logo, name and
 *  number; for a warehouse the shops that may view its stock (for a shop, the warehouses it may view); then the person to add, every field
 *  open at once, and the sites they may use. Bottom: Cancel left, Save without sending right.
 *  - Save keeps the location's changes. If a person has been typed in, it asks which of the other two to use, so they aren't lost.
 *  - Save without sending keeps the location's changes and adds the typed person to the setup, with no email.
 *  - Send Invitation saves the chosen sites, creates the login and emails it (as Add User does); the fields then clear for the next person.
 *  Stock viewing and a person's sites are separate choices. Location photos are not edited here, and saved ones are kept as they are. */
function EntryEditor({ tr, r, rows, focus, codeProblem, placeholder, logo, users, people, canManager, business, full, takenEmails, counterMax, onLogo, onSend, onConnect, onClose, onSave }: {
  tr: Tr; r: SetupRow; rows: SetupRow[]; focus?: "name" | "code" | undefined; codeProblem?: string | undefined; placeholder: string; logo?: string | undefined;
  /** The most counters this shop may have, or 0 when the Counters feature is off. */
  counterMax: number;
  users: SetupUser[]; people: erp.Employee[]; canManager: boolean; business: string; full: boolean; takenEmails: string[]; onLogo: () => void;
  onSend: (u: SetupUser, stage: InviteStage, current: SetupRow[]) => Promise<InviteStage>; onConnect: (u: SetupUser) => void;
  onClose: () => void; onSave: (rows: SetupRow[], users: SetupUser[]) => void;
}) {
  const { dir } = useLanguage();
  const [name, setName] = useState(r.name), [code, setCode] = useState(r.code);
  const [counters, setCounters] = useState(String(r.counters ?? 1));
  const [address, setAddress] = useState(r.address ?? "");
  const shops = rows.filter((x) => x.type === "shop" && x.key !== r.key), storage = rows.filter((x) => isStorage(x) && x.key !== r.key);
  const [links, setLinks] = useState<string[]>(() => (r.type === "shop" ? r.connected ?? [] : shops.filter((x) => x.connected?.includes(r.key)).map((x) => x.key)));
  // People added on this page who already work here, ticked on or off for this site only. Their other sites are left as they are.
  const fitting = users.filter((u) => fitsRole(u.role, r.type));
  const [here, setHere] = useState<string[]>(() => users.filter((u) => u.locations.includes(r.key)).map((u) => u.key));
  const codeRef = useRef<HTMLInputElement>(null), nameRef = useRef<HTMLInputElement>(null), personRef = useRef<HTMLInputElement>(null);
  useEffect(() => { (focus === "code" ? codeRef : nameRef).current?.focus(); }, [focus]);
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  const choices = r.type === "shop" ? storage : shops;
  // An empty box never clears a number the location already has (inviting someone may have just given it one): no renumbering by saving.
  const finalCode = code.trim().toUpperCase() || (r.savedId ? r.code : "");
  // The rows as this editor shows them, so the person can already be given this site under the name being typed.
  const current = rows.map((x) => (x.key === r.key ? { ...x, name, code: finalCode } : x));

  // The person being added here: no role until the owner picks one, and this site ticked already.
  const roles = ROLES.filter(([id]) => canManager || !isManagerRole(id));
  const blank = (): SetupUser => ({ key: newKey(), name: "", phone: "", email: "", role: "", locations: [r.key] });
  const [u, setU] = useState<SetupUser>(blank);
  const [sentTo, setSentTo] = useState("");
  const inv = useInvite((x, st) => onSend(x, st, current));
  const places = current.filter((x) => fitsRole(u.role, x.type));
  // Once a person is saved as an employee (send started), their details live in People & Access and aren't added again here.
  const typed = !inv.locked && !!(u.name.trim() || u.email.trim() || u.phone.trim());

  const save = (extra?: SetupUser) => {
    const n = Number(counters);
    if (r.type === "shop" && counterMax > 0 && (!Number.isInteger(n) || n < 1 || n > counterMax)) { toast.error(counterMax === 1 ? tr("Your plan allows 1 counter. Upgrade your plan to add counters") : tr("Enter a number of counters from 1 to {x}", String(counterMax))); return; }
    const me: SetupRow = { ...r, name, code: finalCode, address, ...(r.type === "shop" ? { connected: links, ...(counterMax > 0 ? { counters: n } : {}) } : {}) };
    // From a warehouse: add or remove it on each shop's list.
    const changed = r.type === "shop" ? [] : shops.map((x) => ({ ...x, connected: links.includes(x.key) ? [...new Set([...(x.connected ?? []), r.key])] : (x.connected ?? []).filter((k) => k !== r.key) }));
    const nextUsers = users.map((p) => { const on = here.includes(p.key), has = p.locations.includes(r.key); return on === has ? p : { ...p, locations: on ? [...p.locations, r.key] : p.locations.filter((k) => k !== r.key) }; });
    onSave([me, ...changed], extra ? [...nextUsers, extra] : nextUsers);
  };
  const saveOnly = () => {
    if (typed) { toast.error(tr("{x} isn't added yet. Use Send Invitation or Save without sending, or clear the person's fields.", u.name.trim() || u.email.trim() || tr("This person"))); return; }
    save();
  };
  const saveWithoutSending = () => {
    if (!typed) { save(); return; }
    if (full) { toast.error(tr("Your plan has no more login accounts")); return; }
    const x = checkUser(tr, u, places, current, takenEmails);
    if (x) save(x);
  };
  const sendInvitation = async () => {
    if (!inv.locked && !typed) { toast.error(tr("Fill in the person's name, email and role first")); personRef.current?.focus(); return; }
    if (full && !inv.locked) { toast.error(tr("Your plan has no more login accounts")); return; }
    const x = checkUser(tr, u, places, current, takenEmails);
    if (x && await inv.send(x)) { setSentTo(x.email); setU(blank()); inv.reset(); }
  };

  const kind = placeOf(r), titleId = `bsetup-ed-${r.key}`;
  const title = `${tr("Edit")} ${tr(kind)} ${realName({ ...r, name }) || rows.findIndex((x) => x.key === r.key) + 1}`;
  const busy = inv.sending;
  return createPortal(<div className="glass-scrim fixed inset-0 z-50 grid place-items-center overflow-y-auto p-4" onClick={onClose}>
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} dir={dir} className="glass-card bsetup-dialog is-editor relative w-full rounded-2xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <header className="bsetup-editor-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="bsetup-act is-go" disabled={busy} aria-busy={busy} title={tr("Email this person an invitation now")} onClick={() => void sendInvitation()}>{tr(busy ? "Sending…" : inv.locked ? "Try sending again" : "Send Invitation")}</button>
        <button type="button" className="bsetup-act is-go" disabled={busy} onClick={saveOnly}>{tr("Save")}</button>
      </header>

      {/* Two columns on a laptop so everything shows at once: the location on the left, its people on the right. */}
      <div className="bsetup-editor-cols">
      <div className="bsetup-editor-col">
      <div className="bsetup-editor-top is-row">
        <button type="button" className={cn("bsetup-logo is-large", logo && "has-logo")} aria-label={tr(logo ? "Change logo" : "Add logo")} title={tr(logo ? "Change logo" : "Add logo")} onClick={onLogo}>{logo ? <img src={logo} alt="" /> : <><ImagePlus aria-hidden /><small>{tr("Logo")}</small></>}</button>
        <label className="bsetup-field"><span>{tr("Name")} <i aria-hidden>*</i></span><input ref={nameRef} className="inventory-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(r.type === "shop" ? "Shop name" : "Warehouse name")} /></label>
        <label className="bsetup-field bsetup-ed-number"><span>{tr("Number")}</span><input ref={codeRef} id={`bsetup-code-edit-${r.key}`} className="inventory-input" aria-invalid={!!codeProblem} value={code} placeholder={placeholder} onChange={(e) => setCode(e.target.value.toUpperCase())} /></label>
        {r.type === "shop" && counterMax > 0 && <label className="bsetup-field bsetup-ed-number" title={tr("Tills in this shop, each with its own cash drawer")}><span>{tr("Counters")} <small>(≤ {counterMax})</small></span><input className="inventory-input" type="number" inputMode="numeric" min={1} max={counterMax} step={1} value={counters} onChange={(e) => setCounters(e.target.value)} /></label>}
      </div>
      <label className="bsetup-field bsetup-ed-address"><span>{tr("Address")} <small>({tr("Optional")})</small></span>
        <input className="inventory-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={tr("Street, building, town")} maxLength={160} />
      </label>
      {!code.trim() && !r.savedId && <p className="bsetup-note">{tr("No number typed. {x} is given on activation; type another to choose your own.", placeholder)}</p>}
      {codeProblem && <p role="alert" className="bsetup-problem">{tr(codeProblem)}</p>}

      {choices.length > 0 && <SitePicks tr={tr} five rows={rows} list={choices} chosen={links} legend={tr(r.type === "shop" ? "Warehouses this shop can view" : "Shops that can view this stock")}
        onToggle={(k, on) => setLinks(on ? [...links, k] : links.filter((x) => x !== k))} />}
      </div>

      <section className="bsetup-editor-sec bsetup-editor-col" aria-labelledby={`${titleId}-users`}>
        <h3 id={`${titleId}-users`}>{tr("Users and invitations")}</h3>
        {(people.length > 0 || fitting.length > 0) && <div className="bsetup-field"><span>{tr("Already assigned here")}</span>
          <div className="bsetup-loc-picks is-five">
            {people.map((e) => <label key={e.id} className="bsetup-pick is-on is-saved" title={tr("Saved · edit in People & Access")}><input type="checkbox" checked disabled /> <span className="bsetup-pick-name">{e.name} <small>{tr(roleLabel(e.accessRole))}</small></span></label>)}
            {fitting.map((p) => <label key={p.key} className={cn("bsetup-pick", here.includes(p.key) && "is-on")}><input type="checkbox" checked={here.includes(p.key)} onChange={(e) => setHere(e.target.checked ? [...here, p.key] : here.filter((k) => k !== p.key))} /> <span className="bsetup-pick-name">{p.name} <small>{tr(roleLabel(p.role))}</small></span></label>)}
          </div>
        </div>}
        <fieldset className="bsetup-lockable" disabled={inv.locked || busy}>
          <div className="bsetup-user-row">
            <label className="bsetup-field"><span>{tr("Full name")} <i aria-hidden>*</i></span><input ref={personRef} className="inventory-input" autoComplete="off" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></label>
            <label className="bsetup-field"><span>{tr("Email")} <i aria-hidden>*</i></span><input className="inventory-input" type="email" autoComplete="off" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} placeholder="name@gmail.com" /></label>
            <label className="bsetup-field"><span>{tr("Phone")} <small>({tr("optional")})</small></span><input className="inventory-input" inputMode="tel" value={u.phone} onChange={(e) => setU({ ...u, phone: e.target.value })} /></label>
            <label className="bsetup-field"><span>{tr("Role")} <i aria-hidden>*</i></span>
              <select className="inventory-input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>
                <option value="" disabled>{tr("Select role")}</option>
                {roles.map(([id, l]) => <option key={id} value={id}>{tr(l)}</option>)}
              </select>
            </label>
          </div>
          <SitePicks tr={tr} five rows={current} list={places} chosen={u.locations} legend={tr("Assigned shops / warehouses")}
            onToggle={(k, on) => setU({ ...u, locations: on ? [...u.locations, k] : u.locations.filter((x) => x !== k) })} />
          <CounterPicks tr={tr} rows={current} chosen={u.locations} value={u.counters} onChange={(counters) => setU({ ...u, counters })} />
        </fieldset>
        {u.role && ROLE_HELP[u.role] && <p className="bsetup-note">{tr(ROLE_HELP[u.role]!)}{!canManager ? ` ${tr("Basic has no manager logins: one owner and one employee.")}` : ""}</p>}
        {full && !inv.locked && <p className="bsetup-problem">{tr("Your plan has no more login accounts")}</p>}
        {(typed || inv.locked) && <p className="bsetup-note">{tr("Send Invitation emails {x} now", u.email.trim() || "—")} · {tr("Business")}: {business || "—"}. {tr("Each person counts once, whatever sites they are assigned to.")}</p>}
        <InviteOutcome tr={tr} inv={inv} email={u.email.trim()} onConnect={() => { const x = checkUser(tr, u, places, current, takenEmails); if (x) onConnect(x); }} />
        {sentTo && <p role="status" className="bsetup-sent">{tr("Invitation sent")} · {sentTo} · {tr("Pending acceptance")}<small> · {tr("The email provider accepted the message; that doesn't yet mean it reached the inbox or was accepted.")}</small></p>}
      </section>
      </div>

      <footer className="bsetup-editor-foot">
        <button type="button" className="bsetup-act is-stop" disabled={busy} onClick={onClose}>{tr("Cancel")}</button>
        <button type="button" className="bsetup-act is-go" disabled={busy} onClick={saveWithoutSending}>{tr("Save without sending")}</button>
      </footer>
    </div>
  </div>, document.body);
}

/** Add User and Edit User (from the bottom strip and Manage Users): the same checks, site labels and sending as the location editor. */
function UserEditor({ tr, rows, canManager, initial, business, takenEmails, onSend, onConnect, onClose, onSave }: {
  tr: Tr; rows: SetupRow[]; canManager: boolean; initial?: SetupUser | undefined; business: string; takenEmails: string[];
  onSend: (u: SetupUser, stage: InviteStage) => Promise<InviteStage>; onConnect: (u: SetupUser) => void; onClose: () => void; onSave: (u: SetupUser) => void;
}) {
  const inv = useInvite(onSend);
  const plan = setupPlan(store.get());
  const roles = ROLES.filter(([id]) => id !== "staff" && (canManager || !isManagerRole(id) || initial?.role === id) && (plan.id !== "basic" || id !== "warehouse_staff" || initial?.role === id));
  const [u, setU] = useState<SetupUser>(() => initial ?? { key: newKey(), name: "", phone: "", email: "", role: roles.find(([id]) => !isManagerRole(id))?.[0] ?? "staff", locations: rows.length === 1 ? [rows[0]!.key] : [] });
  const places = rows.filter((r) => fitsRole(u.role, r.type));
  const chosenSites = places.filter((r) => u.locations.includes(r.key));
  const ready = () => checkUser(tr, u, places, rows, takenEmails);
  const save = () => { const x = ready(); if (x) onSave(x); };
  const send = async () => { const x = ready(); if (x) await inv.send(x); };
  const { done, locked, sending } = inv;
  return <GlassNotice title={tr(initial ? "Edit User" : "Add User")} onClose={onClose} className="bsetup-dialog is-user">
    {/* Once the person is saved their details live in People & Access, so they can't drift from what the server holds. */}
    <fieldset className="bsetup-lockable" disabled={locked || sending}>
    <label className="bsetup-field"><span>{tr("Full Name")} <i>*</i></span><input className="inventory-input" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></label>
    <div className="bsetup-two">
      <label className="bsetup-field"><span>{tr("Email")} <i>*</i></span><input className="inventory-input" type="email" autoComplete="off" value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} placeholder="name@gmail.com" /></label>
      <label className="bsetup-field"><span>{tr("Phone Number")} <small>({tr("Optional")})</small></span><input className="inventory-input" inputMode="tel" value={u.phone} onChange={(e) => setU({ ...u, phone: e.target.value })} /></label>
    </div>
    <p className="bsetup-note">{tr("Any email provider works, Gmail included. Zakrio Systems never asks for their email password: they set their own Zakrio Systems password from the invitation.")}</p>
    <label className="bsetup-field"><span>{tr("Role")} <i>*</i></span>
      <select className="inventory-input" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>{roles.map(([id, l]) => <option key={id} value={id}>{tr(l)}</option>)}</select>
    </label>
    {ROLE_HELP[u.role] && <p className="bsetup-note">{tr(ROLE_HELP[u.role]!)}</p>}
    {!canManager && <p className="bsetup-note">{tr("Basic has no manager logins: one owner and one employee.")}</p>}
    <SitePicks tr={tr} required rows={rows} list={places} chosen={u.locations} legend={tr("Assigned Shops / Warehouses")}
      onToggle={(k, on) => setU({ ...u, locations: on ? [...u.locations, k] : u.locations.filter((x) => x !== k) })} />
    <CounterPicks tr={tr} rows={rows} chosen={u.locations} value={u.counters} onChange={(counters) => setU({ ...u, counters })} />
    </fieldset>
    {/* What the send button will do, before it is pressed: the click itself is the owner's confirmation. */}
    <div className="bsetup-send-sum" role="note">
      <b>{tr("Add & Send Invitation emails this person now")}</b>
      <span>{tr("To")}: {u.email.trim() || "—"} · {tr("Business")}: {business || "—"} · {tr("Role")}: {tr(roleLabel(u.role))}</span>
      <span>{tr("Sites")}: {chosenSites.map((r) => siteLabel(tr, rows, r)).join(", ") || "—"}</span>
      <small>{tr("The chosen sites are saved so the login can be limited to them; the rest of the setup stays a draft until Activate. Each person counts once, whatever sites they are assigned to.")}</small>
    </div>
    <InviteOutcome tr={tr} inv={inv} email={u.email.trim()} onConnect={() => { const x = ready(); if (x) onConnect(x); }} />
    <div className="flex flex-wrap gap-2 pt-1">
      {done ? <ShopButton className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" onClick={onClose}>{tr("Done")}</ShopButton> : <>
        <ShopButton variant="outline" className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" disabled={sending} onClick={onClose}>{tr(locked ? "Close" : "Cancel")}</ShopButton>
        {!locked && <ShopButton variant="outline" className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" disabled={!roles.length || sending} onClick={save}>{tr("Save without sending")}</ShopButton>}
        <ShopButton className="h-auto min-h-11 flex-[2] px-3 py-2 text-sm" disabled={!roles.length || sending} aria-busy={sending} onClick={() => void send()}>{tr(sending ? "Sending invitation…" : locked ? "Try sending again" : "Add & Send Invitation")}</ShopButton>
      </>}
    </div>
  </GlassNotice>;
}

/** Everyone on the business in one list: the owner, people already saved (managed in People & Access) and people added on this page. */
function ManageUsers({ tr, owner, site, siteName, people, users, others = [], placeName, savedPlaceName, logins, onEdit, onRemove, onAssign, onAdd, onAccess, onClose }: {
  tr: Tr; owner: string; site?: SetupRow | undefined; siteName?: string | undefined; people: erp.Employee[]; users: SetupUser[]; others?: SetupUser[]; placeName: (k: string) => string; savedPlaceName: (id: string) => string; logins: ReturnType<typeof loginSummary>;
  onEdit: (u: SetupUser) => void; onRemove: (u: SetupUser) => void; onAssign?: ((u: SetupUser) => void) | undefined; onAdd: () => void; onAccess?: (() => void) | undefined; onClose: () => void;
}) {
  const [removing, setRemoving] = useState<SetupUser | null>(null);
  return <GlassNotice title={site ? `${tr("Manage users")} · ${siteName}` : tr("Manage Users")} onClose={onClose} className="bsetup-dialog is-wide">
    <p className="bsetup-note">{logins.used}/{logins.total} {tr("Accounts")} · {tr("Each person counts once, whatever shops or warehouses they are assigned to. Employees without a login don't count.")}</p>
    <div className="bsetup-utable" role="table" aria-label={tr("Users")}>
      <div className="bsetup-urow bsetup-uhead" role="row"><span role="columnheader">{tr("User")}</span><span role="columnheader">{tr("Role")}</span><span role="columnheader">{tr("Assigned Shops / Warehouses")}</span><span role="columnheader">{tr("Status")}</span></div>
      <div className="bsetup-urow is-owner" role="row"><span role="cell"><b>{owner}</b></span><span role="cell">{tr("Owner")}</span><span role="cell">{tr("All shops and stores")}</span><span role="cell"><small>{tr("Owner · can't be removed")}</small></span></div>
      {people.map((e) => <div key={e.id} className="bsetup-urow is-saved" role="row"><span role="cell"><b>{e.name}</b>{e.email ? <small> · {e.email}</small> : null}</span><span role="cell">{tr(roleLabel(e.accessRole))}</span><span role="cell">{(e.locationIds ?? []).map(savedPlaceName).filter(Boolean).join(", ") || "—"}</span><span role="cell"><small>{tr(e.memberId ? "Has a login" : "No login yet")}</small></span></div>)}
      {users.map((u) => <div key={u.key} className="bsetup-urow" role="row">
        <span role="cell"><b>{u.name}</b> <small>· {u.email}</small></span><span role="cell">{tr(roleLabel(u.role))}</span>
        <span role="cell">{u.locations.map(placeName).filter(Boolean).join(", ") || "—"}</span>
        <span role="cell" className="bsetup-actions"><small>{tr("Saved with setup")}</small>
          <button type="button" aria-label={`${tr("Edit")} ${u.name}`} title={tr("Edit")} onClick={() => onEdit(u)}><Pencil /></button>
          <button type="button" className="is-danger" aria-label={`${tr(site ? "Take off this site" : "Remove")} ${u.name}`} title={tr(site ? "Take off this site" : "Remove")} onClick={() => setRemoving(u)}><Trash2 /></button>
        </span>
      </div>)}
    </div>
    {removing && <div className="bsetup-confirm" role="alertdialog" aria-label={`${tr("Remove")} ${removing.name}`}>
      <p>{site ? tr("Take {x} off this site? They stay on this setup with their other sites.", removing.name) : tr("Remove {x} from this setup? They haven't been saved as an employee yet, so nothing else changes.", removing.name)}</p>
      <div className="flex gap-2"><ShopButton variant="outline" className="h-auto min-h-10 flex-1 px-3 py-1.5 text-sm" onClick={() => setRemoving(null)}>{tr("Keep")}</ShopButton><ShopButton className="h-auto min-h-10 flex-1 px-3 py-1.5 text-sm" onClick={() => { onRemove(removing); setRemoving(null); }}>{tr("Remove")}</ShopButton></div>
    </div>}
    {site && !people.length && !users.length && <p className="bsetup-note">{tr("Nobody is assigned here yet.")}</p>}
    {site && onAssign && others.length > 0 && <div className="bsetup-field"><span>{tr("Also on this setup")}</span>
      <div className="bsetup-loc-picks">{others.map((u) => <button key={u.key} type="button" className="bsetup-link-btn" aria-label={`${tr("Assign to this site")} · ${u.name}`} onClick={() => onAssign(u)}><UserPlus aria-hidden /> {u.name} <small>{tr(roleLabel(u.role))}</small></button>)}</div>
    </div>}
    <p className="bsetup-note">{tr("Invitations, resending or cancelling them, suspending or removing a login and access resets are in Manage Access, for people who are already saved.")}</p>
    <div className="flex flex-wrap gap-2 pt-1">
      {onAccess && <button type="button" className="bsetup-link-btn" onClick={onAccess}><ShieldCheck aria-hidden /> {tr("Manage Access")}</button>}
      <span className="flex-1" />
      <ShopButton variant="outline" className="h-auto min-h-11 px-3 py-2 text-sm" onClick={onClose}>{tr("Close")}</ShopButton>
      <ShopButton className="h-auto min-h-11 px-3 py-2 text-sm" disabled={logins.used >= logins.total} title={logins.used >= logins.total ? tr("Your plan has no more login accounts") : undefined} onClick={onAdd}><UserPlus /> {tr(site ? "Add user to this site" : "Add User")}</ShopButton>
    </div>
  </GlassNotice>;
}

/** The import center from Settings, limited to products or opening stock. Stock goes to the location chosen here. */

