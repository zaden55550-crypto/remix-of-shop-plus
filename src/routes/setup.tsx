// Business / Shop Setup: the one page after the plan. Heading and the two actions on top; business name, type and the plan's
// usage in one compact row; the shop and warehouse entries the plan allows; people; and an optional, collapsed product import.
// It edits a device-local draft. Save keeps the draft; Activate checks every field and then saves everything at once (src/lib/business-setup.ts).
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SUPPORT } from "@/lib/i18n";
import { MessageCircle } from "lucide-react";
import { History, Camera, ChevronDown, CircleCheck, Crown, FileText, ImagePlus, Info, MoreHorizontal, Paperclip, Pencil, Phone, Plus, Save, ShieldCheck, SlidersHorizontal, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { GlassNotice } from "@/components/shopbook/plan-loss";
import { SearchableCountryPicker, SearchableCurrencyPicker, ZakrioMark } from "@/components/shopbook/ui";
import { findByCountry, findByCurrency } from "@/lib/world-data";
import { localPhone } from "@/lib/dial-codes";
import { readSettings } from "@/lib/settings-config";
import { ImportCenter } from "@/components/shopbook/import-center";
import { SmartImport } from "@/components/shopbook/smart-import";
import { PEOPLE_SECTIONS, PeoplePanel } from "@/components/shopbook/people-access";
import { useErp } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { TYPE_LABEL, fitDraftToPlan, activateSetup, draftTypes, countTypes, liveRows, loginSummary, newKey, readDraft, rowsFromRecords, saveDraft, setupPlan, suggestCode, validate, type SetupDraft, type SetupProblem, type SetupRow, type SetupUser } from "@/lib/business-setup";
import { GENERAL_TRADE, INDUSTRIES, businessTypeByName, isIndustryFamilyId, type IndustryFamilyId } from "@/lib/industry-config";
import { FeatureChecks, IndustrySelect, TypePicker } from "@/components/shopbook/type-picker";
import { GlassPage } from "@/components/shopbook/glass-page";
import { ReadyButton, ReadyToSell } from "@/components/shopbook/ready-to-sell";
import { MoveInPanel } from "@/components/shopbook/move-in-panel";
import { moneyFor } from "@/components/shopbook/selling";
import { applyCountryDefaults, type ReadyStep } from "@/lib/ready-setup";
import { LOCATIONS_TEMPLATE, counterHardware, locationsFromSheets, saveCounterHardware, setupHistory, type CounterHardware } from "@/lib/setup-extras";
import { readSheets } from "@/lib/opening-import";
import { PrintPreview } from "@/components/shopbook/print";
import { DOC_MAX_BYTES, DOC_MAX_COUNT, backupDocument, deleteDocument, formatSize, listCloudDocuments, openDocument, putDocument, removeDocumentCopy } from "@/lib/doc-store";
import { rolePreview } from "@/lib/role-preview";
import { currentFeatures, placeName, sellingPlaceName, type Features } from "@/lib/trade-features";
import { listLocations, MAIN_LOCATION, saveLocation } from "@/lib/locations";
import { NeedsConnection, sendSetupInvitation, stageOf, type InviteStage } from "@/lib/setup-invite";
import { friendly } from "@/lib/people-cloud";
import { readProductImage } from "@/lib/product-export";
import { ROLES, isManagerRole, roleLabel } from "@/lib/staff-access";
import { businessTypesOf, canOpen, planAllowanceLines, planCounterLine, planEmployeeRule, planPrice, store, type Account, type BusinessDocument } from "@/lib/shopbook";
import { SLOTS_FULL, SlotsFull } from "@/components/shopbook/slots-full";
import { AccessPicker } from "@/components/shopbook/access-picker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/setup")({
  head: () => ({ meta: [{ title: "Business / Shop Setup — DataQuill Solutions" }] }),
  component: Setup,
});

type Tr = (t: string, x?: string) => string;
/** What this page calls each kind of location. A selling place follows the business type (a Supermarket's shops are
 *  "Supermarket"); stores and older warehouses are both "Warehouse". Set by SetupScreen on each render, read by its rows. */
let shopWord = "Shop";
let shopTypes: string[] = [];
/** Whether the owner has picked a business type (General Trade included). Until then a place can only be a Warehouse, and an arrow
 *  points at Business Type (owner, 2026-11-25). */
let typeChosen = true;
/** A row's shop type is one of the types chosen in Business Type (owner, 2026-11-23); anything else shows as the main type. */
const placeTypeOf = (x: { type: erp.LocationType; placeType?: string | undefined }) => (x.placeType && shopTypes.includes(x.placeType) ? x.placeType : shopTypes[0]);
/** The row's type list: only the types chosen in Business Type (Shop when none), then Warehouse. More types: tick them in Business Type. */
const shopChoices = () => ({ own: !typeChosen ? [] : [...new Set(shopTypes.length ? shopTypes : [""])].map((t) => ({ value: `shop:${t}`, label: placeName(t) })), other: [] as { value: string; label: string }[] });
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

/** True on phones and iPads, where the laptop view is drawn small (laptop-view.ts toggles the class and sends a resize). */
function useSmallScreen() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(document.documentElement.classList.contains("laptop-view"));
    f(); window.addEventListener("resize", f); window.addEventListener("orientationchange", f);
    return () => { window.removeEventListener("resize", f); window.removeEventListener("orientationchange", f); };
  }, []);
  return on;
}

function SetupScreen({ acct, onDone }: { acct: Account; onDone: () => void }) {
  const { tr } = useLanguage();
  const s = useErp();
  const plan = setupPlan(acct);
  // Locations this business already has that are not rows on the page (archived ones keep their name and number).
  const records = useMemo(() => listLocations(s), [s]);
  const [d, setD] = useState<SetupDraft>(() => {
    const saved = readDraft(acct.businessId);
    const savedType = saved?.businessType === "Other" && saved.otherType.trim() ? saved.otherType.trim() : saved?.businessType;
    // A new business starts with no type chosen, so the owner picks one (General Trade is one of the choices).
    const businessType = savedType ?? businessTypesOf(acct)[0] ?? "";
    const industryFamilyId = businessTypeByName(businessType)?.familyId
      ?? (isIndustryFamilyId(saved?.industryFamilyId) ? saved.industryFamilyId : undefined)
      ?? (isIndustryFamilyId(acct.industryFamilyId) ? acct.industryFamilyId : undefined)
      ?? "trade";
    if (saved) return fitDraftToPlan({ ...saved, owner: acct.businessId, businessType, otherType: "", extraBusinessTypes: saved.extraBusinessTypes ?? [], industryFamilyId, businessDocuments: saved.businessDocuments ?? acct.businessDocuments ?? [] }, plan);
    // An empty number stays empty: its placeholder shows the number it will be given on activation, and nothing generated is typed in for the owner.
    // Brand-new business: its first place says "Choose a place" until the owner picks what it is.
    const fresh = acct.setupPending && !businessTypesOf(acct).length;
    const rows = rowsFromRecords(erp.load()).map((r) => (fresh && r.savedId === MAIN_LOCATION ? { ...r, untyped: true } : r));
    // Every type already saved on the account comes back ticked, not only the main one.
    const extraBusinessTypes = businessTypesOf(acct).filter((t) => t !== businessType);
    // A name made up from a Google or Apple account is left empty here, so the owner types the real one.
    return { owner: acct.businessId, businessName: acct.autoName ? "" : acct.shopName ?? "", businessType, otherType: "", extraBusinessTypes, industryFamilyId, phone: localPhone(acct.phone, acct.country), phone2: localPhone(acct.phone2, acct.country), phone3: localPhone(acct.phone3, acct.country), taxPin: readSettings().taxPin, businessDocuments: acct.businessDocuments ?? [], rows, users: [] };
  });
  const [problems, setProblems] = useState<SetupProblem[]>([]);
  // Came in with Google or Apple: say what is still needed and put the cursor in Business Name (owner, 2026-11-25).
  useEffect(() => {
    if (!acct.autoName) return;
    toast.info(tr("Welcome! Fill in your business name and phone number to finish."), { duration: 8000 });
    window.setTimeout(() => document.getElementById("bsetup-business-name")?.focus(), 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [access, setAccess] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  // "Ready to sell": payment details, tax, opening stock and cash, receipt, numbering, hours, PINs, sample data, moving in.
  // Pop-ups are drawn outside the page, so a body class lets them read at Setup's large size too.
  useEffect(() => { document.body.classList.add("on-setup"); return () => document.body.classList.remove("on-setup"); }, []);
  // Phones and iPads (the laptop view shrunk to a small screen, laptop-view.ts) get a tidier Setup (owner, 2026-11-24): the company
  // buttons go under More, the feature ticks under one Business Features button in the strip, and the header is shorter.
  const compact = useSmallScreen();
  const [pop, setPop] = useState<"more" | "features" | null>(null);
  useEffect(() => {
    if (!pop) return;
    const out = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.(".bsetup-pop-wrap")) setPop(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPop(null); };
    window.addEventListener("pointerdown", out); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", out); window.removeEventListener("keydown", esc); };
  }, [pop]);
  const [readyOpen, setReadyOpen] = useState(false), [readyStart, setReadyStart] = useState<ReadyStep | undefined>(undefined);
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
  // Every place taken (owner, 2026-11-24): Add User explains, with 0 left and how to contact us for more, instead of doing nothing.
  const [slotsOpen, setSlotsOpen] = useState(false);
  const addUser = () => { if (loginFull) { setSlotsOpen(true); return; } setNewUserLocation(null); setEditingUser("new"); };
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
  // Business documents (KRA certificate, licences, permits…): as many as needed, each up to 10 MB. The files are kept in this
  // device's document store (doc-store.ts); the setup only keeps their names, so many fit.
  const pickBusinessDocuments = async (files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (!picked.length) return;
    if (picked.some((f) => f.size > DOC_MAX_BYTES)) { toast.error(tr("Each business document must be 10 MB or smaller")); return; }
    const current = d.businessDocuments ?? [];
    if (picked.length + current.length > DOC_MAX_COUNT) { toast.error(tr("Up to 30 business documents")); return; }
    try {
      const documents: BusinessDocument[] = [];
      for (const file of picked) {
        const id = newKey();
        await putDocument(id, file);
        documents.push({ id, name: file.name, mime: file.type || "application/octet-stream", size: file.size });
      }
      set({ businessDocuments: [...current, ...documents] });
      void backupDocuments([...current, ...documents]);
      toast.success(`${documents.length} ${tr(documents.length === 1 ? "document uploaded" : "documents uploaded")}`);
    } catch { toast.error(tr("This device could not read that document")); }
  };
  const removeBusinessDocument = (id: string) => { set({ businessDocuments: (d.businessDocuments ?? []).filter((x) => x.id !== id) }); void deleteDocument(id).catch(() => {}); const doc = (d.businessDocuments ?? []).find((x) => x.id === id); if (doc) void removeDocumentCopy(doc); };
  // Online copies (proposed 0022): documents without one are uploaded when the owner is signed in; the rest stay on this device.
  const backupDocuments = async (docs: BusinessDocument[]) => {
    const missing = docs.filter((x) => !x.cloud);
    if (!missing.length) return;
    const done = new Set<string>();
    for (const doc of missing) if (await backupDocument(doc)) done.add(doc.id);
    if (done.size) setD((cur) => ({ ...cur, businessDocuments: (cur.businessDocuments ?? []).map((x) => (done.has(x.id) ? { ...x, cloud: true } : x)) }));
  };
  useEffect(() => {
    void backupDocuments(d.businessDocuments ?? []);
    // Documents added on the owner's other devices join this list; their files download when opened.
    void listCloudDocuments().then((online) => { if (online.length) setD((cur) => { const have = new Set((cur.businessDocuments ?? []).map((x) => x.id)); const add = online.filter((x) => !have.has(x.id)); return add.length ? { ...cur, businessDocuments: [...(cur.businessDocuments ?? []), ...add] } : cur; }); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [docsOpen, setDocsOpen] = useState(false);
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
  typeChosen = chosenTypes.length > 0;
  const setRow = (key: string, p: Partial<SetupRow>) => set({ rows: d.rows.map((r) => (r.key === key ? { ...r, ...p } : r)) });
  const problem = (key: string | undefined, field: string) => problems.find((x) => x.key === key && x.field === field)?.message;
  const savedPhotos = (r: SetupRow) => r.photos ?? records.find((l) => l.id === r.savedId)?.photos ?? [];

  const addRowAt = (slot: number, type: "shop" | "store", placeType?: string) => {
    const existing = live.find((r, index) => (r.slotNumber ?? index + 1) === slot);
    if (existing) { if (existing.type !== type) changeType(existing, type, placeType); else setRow(existing.key, { ...(placeType ? { placeType } : {}), untyped: undefined }); return; }
    if (live.length >= plan.locations) return;
    set({ rows: [...d.rows, { key: newKey(), slotNumber: slot, type, name: "", code: "", ...(placeType ? { placeType } : {}) }] });
  };
  // Suggestion 3: many locations at once from a CSV or Excel sheet, into the free places of the plan. Nothing is saved until Activate.
  const sheetInput = useRef<HTMLInputElement>(null);
  const addFromSheet = async (files: FileList | null) => {
    const list = Array.from(files ?? []);
    if (!list.length) return;
    try {
      const { lines, skipped } = locationsFromSheets(await readSheets(list));
      const free = plan.locations - live.length;
      if (!lines.length) { toast.error(tr("No locations found. Use the columns Type, Name, Phone, Number, Address")); return; }
      const occupied = new Set(live.map((x, i) => x.slotNumber ?? i + 1));
      const added: SetupRow[] = [];
      for (const l of lines.slice(0, Math.max(0, free))) {
        let slot = 1; while (occupied.has(slot)) slot++; occupied.add(slot);
        added.push({ key: newKey(), slotNumber: slot, type: l.type, name: l.name, code: l.code, ...(l.phone ? { phone: l.phone } : {}), ...(l.address ? { address: l.address } : {}), ...(l.counters ? { counters: l.counters } : {}) });
      }
      if (added.length) set({ rows: [...d.rows, ...added] });
      const left = lines.length - added.length;
      toast.success(`${added.length} ${tr(added.length === 1 ? "location added" : "locations added")}`, { description: [left > 0 ? `${left} ${tr("didn't fit your plan")}` : "", skipped ? `${skipped} ${tr("rows without a name were skipped")}` : ""].filter(Boolean).join(" · ") || undefined });
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "That file could not be read")); }
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  /** Duplicate (owner, 2026-11-24): a new location of the same kind with this one's settings (shop type, counters within the plan,
   *  phone, hours, tax PIN, receipt heading, warehouse links); name, number, logo and photos start empty. Nothing is saved until Activate. */
  const duplicateRow = (src: SetupRow) => {
    if (live.length >= plan.locations) { toast.error(tr("All your plan's locations are in use")); return; }
    const occupied = new Set(live.map((r, index) => r.slotNumber ?? index + 1));
    let slot = 1;
    while (occupied.has(slot)) slot++;
    const left = Math.max(1, plan.counters - countersUsed);
    const copy: SetupRow = { key: newKey(), slotNumber: slot, type: src.type, name: "", code: "",
      ...(src.placeType ? { placeType: src.placeType } : {}), ...(src.type === "shop" ? { counters: Math.min(Math.max(1, src.counters ?? 1), left) } : {}),
      ...(src.phone ? { phone: src.phone } : {}), ...(src.hours ? { hours: src.hours } : {}), ...(src.taxPin ? { taxPin: src.taxPin } : {}),
      ...(src.receiptHeader ? { receiptHeader: src.receiptHeader } : {}), ...(src.connected?.length ? { connected: [...src.connected] } : {}),
      ...(src.defaultWarehouse ? { defaultWarehouse: src.defaultWarehouse } : {}) };
    set({ rows: [...d.rows, copy] });
    toast.success(tr("Copied. Give the new location its name."));
    window.setTimeout(() => document.getElementById(`bsetup-name-${copy.key}`)?.focus(), 50);
  };
  /** "+ Add location" (owner, 2026-11-24): one button; the new row has no type until the owner picks Shop (or a shop type) or Warehouse. */
  const addLocation = () => {
    if (live.length >= plan.locations) return;
    const occupied = new Set(live.map((r, index) => r.slotNumber ?? index + 1));
    let slot = 1;
    while (occupied.has(slot)) slot++;
    const key = newKey();
    set({ rows: [...d.rows, { key, slotNumber: slot, type: "shop", untyped: true, name: "", code: "" }] });
    window.setTimeout(() => document.getElementById(`bsetup-type-${key}`)?.focus(), 50);
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
  const changeType = (r: SetupRow, type: erp.LocationType, placeType?: string) => {
    // The number stays exactly as it is (a saved SHOP-001 is never renumbered); an empty one's placeholder follows the new type by itself.
    // A shop's connections are to warehouses, so a change of type clears the ones that no longer make sense.
    const rows = d.rows.map((x) => (x.key === r.key ? { ...x, untyped: undefined, type, placeType: type === "shop" ? (placeType ?? x.placeType) : undefined, connected: type === "shop" ? x.connected : undefined } : type === "shop" && x.connected?.includes(r.key) ? { ...x, connected: x.connected.filter((k) => k !== r.key) } : x));
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
      applyCountryDefaults(place.country || acct.country);
      toast.success(tr("Your business is set up"));
      // Straight to the apps (owner, 2026-11-24: the quick add-a-product / sell-it walkthrough is gone).
      onDone();
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Setup could not be saved")); setActivating(false); }
  };

  // What Activate needs, ticked as it is filled in (Activate still checks everything itself).
  const ready = [
    { label: "Business Name", short: "Name", ok: !!d.businessName.trim(), field: "bsetup-business-name" },
    { label: "Business Type", short: "Type", ok: selectedIndustry === "trade" || !!chosenTypes.length, field: "bsetup-business-type" },
    { label: "Primary phone", short: "Phone", ok: !!d.phone?.trim(), field: "bsetup-phone" },
    { label: "Name every location", short: "Locations", ok: live.length > 0 && live.every((r) => !!r.name.trim()), field: `bsetup-name-${live.find((r) => !r.name.trim())?.key ?? live[0]?.key ?? ""}` },
  ];
  const readyCount = ready.filter((x) => x.ok).length;
  const price = planPrice(plan, acct.plan === plan.id ? acct.billing : "monthly");
  const trial = acct.plan === "trial";
  const stores = counts.warehouses + counts.stores;
  const untypedRows = live.filter((r) => r.untyped).length;
  // Locations, not shops (owner, 2026-11-25): "1 named location"; "not named", warehouses and untyped rows only appear when there are any.
  const namedLocations = live.filter((r) => !!realName(r)).length, notNamed = live.length - namedLocations;
  const full = live.length >= plan.locations;
  const bySlot = new Map(live.map((r, index) => [r.slotNumber ?? index + 1, r]));
  const tableSlots = Array.from({ length: Math.max(plan.locations, live.length) }, (_, index) => ({ n: index + 1, r: bySlot.get(index + 1) }));
  // Only real entries are listed (owner, 2026-11-22): up to 5 fill one full-width list, more split into two columns of 5.
  // New ones come from Add Shop / Add Warehouse; with none at all, the first empty slot shows so a type can be chosen.
  const filledSlots = tableSlots.filter((x) => x.r);
  const shownSlots = filledSlots.length ? filledSlots : tableSlots.slice(0, 1);
  // Two glass panels, Locations 1–5 and 6–10 (owner, 2026-11-23): every place the plan allows, real ones filled in, free ones ready to use.
  // Only real locations (owner, 2026-11-23): one shop fills the page alone; more than five split into two columns. No empty rows.
  const panels = shownSlots.length <= 5 ? [shownSlots] : [shownSlots.slice(0, 5), shownSlots.slice(5, 10)];
  // Counters are shared out from the plan's total (Business 20): how many are given to shops so far.
  const countersUsed = live.filter((x) => x.type === "shop").reduce((n, x) => n + Math.max(1, x.counters ?? 1), 0);
  const links = live.filter(isStorage).map((w) => ({ w, shops: live.filter((r) => r.type === "shop" && r.connected?.includes(w.key)) })).filter((x) => x.shops.length);
  const placeName = (k: string) => { const r = live.find((x) => x.key === k); return r ? r.name || r.code : ""; };
  const savedPlaceName = (id: string) => live.find((r) => r.savedId === id)?.name || records.find((l) => l.id === id)?.name || "";
  const userProblems = problems.filter((p) => p.field === "users");
  const peopleAt = (r: SetupRow) => existingPeople.filter((e) => !!r.savedId && (e.locationIds ?? []).includes(r.savedId));
  const editing = editingRow ? live.find((r) => r.key === editingRow.key) : undefined;
  /** Emails already on this business; a new person can't reuse one. `except` is the person being edited. */
  const takenEmails = (except?: string) => [acct.email ?? "", ...existingPeople.map((e) => e.email ?? ""), ...d.users.filter((x) => x.key !== except).map((x) => x.email)].map((e) => e.trim().toLowerCase()).filter(Boolean);
  const putUser = (u: SetupUser) => set({ users: d.users.some((x) => x.key === u.key) ? d.users.map((x) => (x.key === u.key ? u : x)) : [...d.users, u] });

  // One drop zone: files dragged anywhere on Business Setup open "Bring your business over" with them already read.
  const [moveIn, setMoveIn] = useState<{ files?: File[] | undefined } | null>(null);
  const [dragging, setDragging] = useState(false);
  const hasFiles = (e: React.DragEvent) => [...e.dataTransfer.types].includes("Files");
  return <div className={cn("bsetup", compact && "is-compact")}
    onDragOver={(e) => { if (!hasFiles(e) || moveIn) return; e.preventDefault(); setDragging(true); }}
    onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
    onDrop={(e) => { if (!hasFiles(e) || moveIn) return; e.preventDefault(); setDragging(false); const list = [...e.dataTransfer.files]; if (list.length) setMoveIn({ files: list }); }}>
    {dragging && <div className="bsetup-dropping" onDragLeave={() => setDragging(false)}><Upload aria-hidden /><b>{tr("Drop to bring your business over")}</b><small>{tr("Excel, CSV or zip from Odoo, QuickBooks, Zoho, Loyverse, Sage or any spreadsheet")}</small></div>}
    {moveIn && <GlassPage label={tr("Bring your business over")} onClose={() => setMoveIn(null)}><MoveInPanel tr={tr} files={moveIn.files} onClose={() => setMoveIn(null)} /></GlassPage>}
    {/* Help is one tap away (owner, 2026-11-25). */}
    <a data-plain="1" className="bsetup-help" href={`https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(tr("Hello DataQuill Solutions, I need help with Business Setup."))}`} target="_blank" rel="noopener noreferrer" title={tr("Need help? WhatsApp us")}><MessageCircle aria-hidden /> <span>{tr("Need help?")}</span></a>
    <header className="bsetup-head">
      {/* Left: the business's own logo from Create Account (or the DataQuill mark), the title, and the country and currency given at
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
        {savedText && (compact ? <span className="bsetup-saved is-icon" role="status" title={savedText} aria-label={savedText}><Save aria-hidden /></span> : <span className="bsetup-saved" role="status"><span className="bsetup-saved-text">{savedText}</span></span>)}
        </span>
      </div>
      {!compact && <ol className="bsetup-steps" aria-label={tr("Getting started")}>
        <li className="is-done" title={tr("Create Account")}><CircleCheck aria-hidden /> {tr("Account")}</li>
        <li className="is-done" title={tr("Choose plan")}><CircleCheck aria-hidden /> {tr("Plan")}</li>
        <li className="is-now" aria-current="step" title={tr("Business Setup")}><span>3</span> {tr("Setup")}</li>
        <li><span>4</span> {tr("Activate")}</li>
      </ol>}
      <div className="bsetup-head-actions">
        {compact ? <button type="button" className={cn("bsetup-ready-chip", readyCount === ready.length && "is-all")} title={ready.map((x) => `${x.ok ? "✓" : "○"} ${tr(x.label)}`).join("\n")}
          onClick={() => { const next = ready.find((x) => !x.ok); if (!next) return; const el = document.getElementById(next.field); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus(); }}>
          {readyCount === ready.length ? <CircleCheck aria-hidden /> : <span className="bsetup-ready-dot" aria-hidden />} {tr("Ready")} {readyCount}/{ready.length}</button>
        : <ul className={cn("bsetup-ready", readyCount === ready.length && "is-all")} aria-label={tr("Ready to activate?")} title={tr("{x} of 4 ready", String(readyCount))}>
          {ready.map((x) => <li key={x.label} className={x.ok ? "is-ok" : undefined}><button type="button" title={x.ok ? tr(x.label) : `${tr(x.label)} · ${tr("Tap to fill it in")}`} onClick={() => { const el = document.getElementById(x.field); el?.scrollIntoView({ block: "center", behavior: "smooth" }); el?.focus(); }}>{x.ok ? <CircleCheck aria-hidden /> : <span className="bsetup-ready-dot" aria-hidden />} {tr(x.short)}</button></li>)}
        </ul>}
        <ReadyButton s={s} onOpen={() => setReadyOpen(true)} />
        <ShopButton className={cn("bsetup-review", readyCount === ready.length && !activating && "is-ready-pulse")} disabled={activating} aria-busy={activating} title={tr("Saves all shops, warehouses and people, then opens your apps")} onClick={activate}>{tr(activating ? "Activating…" : "Activate")} <CircleCheck aria-hidden /></ShopButton>
      </div>
      {/* Setup progress (owner, 2026-11-24) from the same ready checks as Activate. */}
      <div className="bsetup-progress" role="progressbar" aria-label={tr("Setup progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((readyCount / ready.length) * 100)} title={tr("Setup {x}% done", String(Math.round((readyCount / ready.length) * 100)))}>
        <span style={{ width: `${Math.round((readyCount / ready.length) * 100)}%` }} />
      </div>
    </header>

    {/* Always fully open (owner, 2026-11-23): documents, features and every company button show; there is no Less/More. */}
    <section className="bsetup-toprow bsetup-profile is-more" aria-label={tr("Business details")}>
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
          </div> : !compact && <button type="button" className="bsetup-link-btn bsetup-more-phones" onClick={() => setMorePhones(true)}><Plus aria-hidden /> {tr("Add phone")}</button>}
        </div>
        <label className="bsetup-field"><span>{tr("Industry")} <i aria-hidden>*</i></span>
          <IndustrySelect id="bsetup-industry" value={selectedIndustry} keep={isIndustryFamilyId(acct.industryFamilyId) ? acct.industryFamilyId : undefined} onChange={(id) => {
            if (!isIndustryFamilyId(id) || id === selectedIndustry) return;
            set({ industryFamilyId: id, businessType: "", otherType: "", extraBusinessTypes: [] });
          }} />
        </label>
        <div className="bsetup-field"><span>{tr("Business Type")}{selectedIndustry === "trade" ? <small> ({tr("Optional")})</small> : <i aria-hidden> *</i>}</span>
          {!chosenTypes.length && <span className="bsetup-arrow-hint" role="note" title={tr("Choose your business type here")}><b aria-hidden>↓</b> {tr("Choose here")}</span>}
          <TypePicker id="bsetup-business-type" emptyLabel={tr("Choose business type")} industry={selectedIndustry} value={chosenTypes} invalid={!!problem(undefined, "businessType")}
            onChange={(types) => set({ businessType: types[0] ?? "", otherType: "", extraBusinessTypes: types.slice(1) })} />
          {selectedIndustryConfig?.implementationStatus === "configuration-only" && <small className="bsetup-note">{tr("This records your industry and business type; its specialized operating modules are not available yet.")}</small>}
        </div>
        <div className="bsetup-field bsetup-documents"><span>{tr("Business Documents")} <small>({tr("Optional")})</small></span>
          <input ref={businessFiles} hidden type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={(e) => { void pickBusinessDocuments(e.target.files); e.target.value = ""; }} />
          <div className="bsetup-doc-row">
            <button type="button" className="bsetup-doc-upload" title={tr("Upload KRA certificates and other business files")} onClick={() => businessFiles.current?.click()}><Paperclip aria-hidden /> {tr("Upload files")}</button>
            {!!d.businessDocuments?.length && <button type="button" className="bsetup-doc-count" title={tr("See uploaded documents")} onClick={() => setDocsOpen(true)}><FileText aria-hidden /> {d.businessDocuments.length}</button>}
          </div>
        </div>
        {compact ? <span className="bsetup-pop-wrap bsetup-more-wrap">
          <button type="button" className="bsetup-co-btn is-more" aria-haspopup="menu" aria-expanded={pop === "more"} onClick={() => setPop(pop === "more" ? null : "more")}><MoreHorizontal aria-hidden /> {tr("More")} <ChevronDown aria-hidden /></button>
          {pop === "more" && <span className="bsetup-import-menu bsetup-more-menu" role="menu">
            {!morePhones && <button type="button" role="menuitem" onClick={() => { setPop(null); setMorePhones(true); }}><Phone aria-hidden /><span><b>{tr("Add phone")}</b><small>{tr("A second or third phone number for the business")}</small></span></button>}
            <button type="button" role="menuitem" onClick={() => { setPop(null); addUser(); }}><UserPlus aria-hidden /><span><b>{tr("Add User")}</b><small>{loginFull ? tr("All user places are used") + " · " + tr("0 left") : tr("A manager or staff member who logs in")}</small></span></button>
            <button type="button" role="menuitem" onClick={() => { setPop(null); setOwnerInfo(true); }}><Pencil aria-hidden /><span><b>{tr("Edit Owner")}</b><small>{tr("The owner's name, email and phone")}</small></span></button>
            <button type="button" role="menuitem" onClick={() => { setPop(null); setManaging("company"); }}><Users aria-hidden /><span><b>{tr("Manage Users")}</b><small>{tr("Everyone added to this business")}</small></span></button>
            <button type="button" role="menuitem" onClick={() => { setPop(null); openAccess(); }}><ShieldCheck aria-hidden /><span><b>{tr("Manage Access")}</b><small>{tr("Roles, permissions and invitations")}</small></span></button>
          </span>}
        </span> : <div className="bsetup-company-actions" role="group" aria-label={tr("Company-wide actions")}>
          <button type="button" className={`bsetup-co-btn is-add${loginFull ? " is-full" : ""}`} title={loginFull ? tr(SLOTS_FULL) : undefined} onClick={addUser}><UserPlus aria-hidden /> {tr("Add User")}</button>
          <button type="button" className="bsetup-co-btn is-owner" onClick={() => setOwnerInfo(true)}><Pencil aria-hidden /> {tr("Edit Owner")}</button>
          <button type="button" className="bsetup-co-btn is-users" onClick={() => setManaging("company")}><Users aria-hidden /> {tr("Manage Users")}</button>
          <button type="button" className="bsetup-co-btn is-access" title={tr("Set role templates and individual employee permissions, review invitations, reset access and suspend or reactivate logins. Business Setup and Settings use the same employee and permission records.")} onClick={() => openAccess()}><ShieldCheck aria-hidden /> {tr("Manage Access")}</button>
        </div>}
      </div>
      {!compact && selectedIndustry === "trade" && <div className="bsetup-feature-row"><span>{tr("Business Features")}</span><FeatureChecks className="bsetup-feature-checks" types={chosenTypes} value={features} onChange={(p) => set({ features: { ...(d.features ?? {}), ...p } })} /></div>}
      {!compact && <div className="bsetup-save-row">
        <ShopButton variant="outline" className="bsetup-later" disabled={activating} onClick={saveLater}><Save /> {tr("Save")}</ShopButton>
      </div>}
    </section>
    {readyOpen && <GlassPage label={tr("Ready to sell")} onClose={() => { setReadyOpen(false); setReadyStart(undefined); }}><ReadyToSell s={s} start={readyStart} onClose={() => { setReadyOpen(false); setReadyStart(undefined); }} /></GlassPage>}
    {historyOpen && <GlassPage label={tr("Setup history")} onClose={() => setHistoryOpen(false)}>
      <div className="inventory-box dash-panel bsetup-docs-page">
        <div className="feature-panel-head"><h3>{tr("Setup history")}</h3><ShopButton variant="outline" onClick={() => setHistoryOpen(false)}>{tr("Done")}</ShopButton></div>
        <p className="settings-note">{tr("Locations, numbering, staff PINs, opening balances and other setup changes, newest first. Changes you haven't activated yet are not listed.")}</p>
        {setupHistory(s).length ? <ul className="bsetup-docs-list">{setupHistory(s).map((a) => <li key={a.id} className="bsetup-history-row"><span><b>{tr(a.action)}</b><small>{a.detail}</small></span><span className="bsetup-history-when"><b>{a.user}</b><small>{new Date(a.at).toLocaleString("en-GB")}</small></span></li>)}</ul> : <p className="settings-note">{tr("Nothing yet. Changes appear here once you activate.")}</p>}
        <a className="bsetup-template-link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(LOCATIONS_TEMPLATE)}`} download="dataquill-solutions-locations-template.csv">{tr("Download the locations sheet template")}</a>
      </div>
    </GlassPage>}
    {docsOpen && <GlassPage label={tr("Business Documents")} onClose={() => setDocsOpen(false)}>
      <div className="inventory-box dash-panel bsetup-docs-page">
        <div className="feature-panel-head"><h3>{tr("Business Documents")} · {d.businessDocuments?.length ?? 0}</h3><ShopButton variant="outline" onClick={() => setDocsOpen(false)}>{tr("Done")}</ShopButton></div>
        <p className="settings-note">{tr("Kept on this device. Tap a document to open it.")}</p>
        <ul className="bsetup-docs-list">{(d.businessDocuments ?? []).map((doc) => <li key={doc.id}>
          <button type="button" className="bsetup-docs-open" onClick={() => { void openDocument(doc).catch(() => toast.error(tr("This document isn't on this device"))); }}><FileText aria-hidden /><span><b>{doc.name}</b><small>{formatSize(doc.size)}</small></span></button>
          <button type="button" className="bsetup-docs-remove" aria-label={`${tr("Remove")} ${doc.name}`} onClick={() => removeBusinessDocument(doc.id)}><Trash2 aria-hidden /> {tr("Remove")}</button>
        </li>)}</ul>
        <ShopButton onClick={() => businessFiles.current?.click()}><Paperclip aria-hidden /> {tr("Upload more")}</ShopButton>
      </div>
    </GlassPage>}

    <section className="bsetup-card bsetup-entries" aria-label={tr("Shops & Warehouses")}>
      <header className="bsetup-strip">
        {/* Import's three choices sit on the strip itself, beside Add Shop / Add Warehouse (owner, 2026-11-24, every screen size). */}
        <span className="bsetup-import-row" role="group" aria-label={tr("Import")}>
          <button type="button" className="bsetup-import-other bsetup-imp-btn" title={tr("Bring products, customers, suppliers and balances from Odoo, QuickBooks, Zoho, Loyverse or Excel")} onClick={() => setMoveIn({})}><Upload aria-hidden /> {tr("From another system")}</button>
          <button type="button" className="bsetup-import-other bsetup-imp-btn" disabled={full} title={full ? tr("All your plan's locations are in use") : tr("Add many shops and warehouses from a CSV or Excel sheet (Type, Name, Phone, Number, Address)")} onClick={() => sheetInput.current?.click()}><FileText aria-hidden /> {tr("Spreadsheet")}</button>
          <button type="button" className="bsetup-import-other bsetup-imp-btn is-history" title={tr("Who changed what in setup")} onClick={() => setHistoryOpen(true)}><History aria-hidden /> {tr("History")}</button>
        </span>
        {compact && selectedIndustry === "trade" && <span className="bsetup-pop-wrap bsetup-feat-wrap">
          <button type="button" className="bsetup-import-other bsetup-feat-btn" aria-haspopup="true" aria-expanded={pop === "features"} onClick={() => setPop(pop === "features" ? null : "features")}><SlidersHorizontal aria-hidden /> {tr("Business Features")} <ChevronDown aria-hidden /></button>
          {pop === "features" && <span className="bsetup-feat-menu" role="group" aria-label={tr("Business Features")}>
            <FeatureChecks className="bsetup-feature-checks" types={chosenTypes} value={features} onChange={(p) => set({ features: { ...(d.features ?? {}), ...p } })} />
            <button type="button" className="bsetup-feat-done" onClick={() => setPop(null)}>{tr("Done")}</button>
          </span>}
        </span>}
        {/* Named and unfinished shops apart (owner, 2026-11-24): a shop row with a blank name (or only the placeholder text) is unfinished.
            Display only; Sites and remaining still count every location row. */}
        <span className="bsetup-strip-count" role="status">{namedLocations} {tr(namedLocations === 1 ? "named location" : "named locations")}{notNamed > 0 && <> · {notNamed} {tr("not named")}</>}{stores > 0 && <> · {stores} {tr(stores === 1 ? "warehouse" : "warehouses")}</>}{untypedRows > 0 && <> · {untypedRows} {tr("without a type")}</>}</span>
        <input ref={sheetInput} hidden type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { void addFromSheet(e.target.files); e.target.value = ""; }} />
        {/* Only when the panel has no Add tile of its own (5 or 10 locations shown), so the two never repeat each other. */}
        {!full && <span className="bsetup-add">
          <button type="button" className="bsetup-add-btn is-location" onClick={addLocation}><Plus aria-hidden /> {tr("Add location")}</button></span>}
        <span className="bsetup-strip-summary" role="group" aria-label={tr("Plan Usage & Summary")}>
        <span className={cn("bsetup-strip-usage", (live.length > plan.locations || logins.used > logins.total) && "has-problem")}>
          <span>{tr("Accounts")} <b>{logins.used}/{logins.total}</b></span><span>{tr("Managers")} <b>{logins.usedManagers}/{logins.managers}</b></span><span>{tr("Staff")} <b>{logins.usedStaff}/{logins.staff}</b></span><span>{tr("Sites")} <b>{live.length}/{plan.locations}</b></span><span>{tr("Counters")} <b>{countersUsed}/{plan.countersPerShop ? `${plan.counters} ${tr("each")}` : plan.counters}</b></span><span><b>{Math.max(0, plan.locations - live.length)}</b> {tr("remaining")}</span>
        </span>
        <span className="bsetup-strip-plan bsetup-plan-card"><Crown aria-hidden /><span className="bsetup-plan-card-name"><small>{trial ? tr("Free trial") : tr("Your plan")}</small><b>{plan.name}</b></span><b className="bsetup-plan-card-price">${price.amount}{tr(price.period === "year" ? "/yr" : "/mo")}</b><button type="button" className="bsetup-info" aria-label={tr("How plan limits work")} title={tr("How plan limits work")} onClick={() => setInfo(true)}><Info /></button></span>
        </span>
        {compact && <ShopButton variant="outline" className="bsetup-later bsetup-strip-save" disabled={activating} onClick={saveLater}><Save /> {tr("Save")}</ShopButton>}
      </header>
      {/* Locations 1-5, and 6-10 beside them once there are more than five (the second panel also shows the plan's free places). */}
      <div className={cn("bsetup-tables", panels.length > 1 && "is-two")}>
      {panels.map((group, gi) => <div key={gi} className={cn("bsetup-table", features.counters && "has-counters")} role="table" aria-label={`${tr("Locations")} ${gi * 5 + 1}-${gi * 5 + 5}`}>
          <div className="bsetup-panel-head" role="row"><b role="columnheader">{panels.length === 1 ? tr("Locations") : `${tr("Locations")} ${gi * 5 + 1}–${gi * 5 + group.length}`}</b>{features.counters && <span role="columnheader" className="is-counters">{tr("Counters")}</span>}<span role="columnheader" className="is-phone">{tr("Phone")}</span><span role="columnheader" className="is-code">{tr("No.")}</span></div>
          {group.map(({ n, r }) => r ? <LocationEntryRow key={r.key} r={r} n={n} tr={tr} nameProblem={problem(r.key, "name")} codeProblem={problem(r.key, "code")} phoneProblem={problem(r.key, "phone")} placeholder={suggestedCode(r)} counterMax={counterMax(r)} showCounters={features.counters} onCounters={(value) => setRow(r.key, { counters: value })} canImport={!!r.savedId} onImport={() => setImporting({ kind: "Products", at: r.savedId })} canRemove={r.savedId !== MAIN_LOCATION && live.length > 1} selected={editingRow?.key === r.key} onType={(type) => changeType(r, type)} onPlace={(type) => (r.type === "shop" ? setRow(r.key, { placeType: type || undefined, untyped: undefined }) : changeType(r, "shop", type || undefined))} onName={(name) => setRow(r.key, { name })} onPhone={(phone) => setRow(r.key, { phone })} onCode={(code) => setRow(r.key, { code })} onEdit={() => setEditingRow({ key: r.key })} onRemove={() => removeRow(r)} />
            : <LocationEntryRow key={`slot-${n}`} n={n} tr={tr} showCounters={features.counters} onType={(type) => addRowAt(n, type as "shop" | "store")} onPlace={(type) => addRowAt(n, "shop", type)} />)}
          {group.length < 5 && (gi === panels.length - 1) && <div className="bsetup-add-slot" style={{ gridRow: `span ${5 - group.length}` }}>
            {full ? <span>{tr("All your plan's locations are in use")}</span> : <>
              <span className="bsetup-add-slot-hint"><b aria-hidden>↑</b> {tr("Use + Add location at the top to add another place")}</span>
              <small>{Math.max(0, plan.locations - live.length)} {tr("remaining")}</small></>}
          </div>}
        </div>)}
      </div>
      {problems.filter((p) => p.key && (p.field === "type" || p.field === "name" || p.field === "code" || p.field === "phone")).slice(0, 3).map((p) => <p key={p.key! + p.field} role="alert" className="bsetup-problem">{tr("Entry")} {live.find((r) => r.key === p.key)?.slotNumber ?? live.findIndex((r) => r.key === p.key) + 1}: {tr(p.message)}</p>)}
      {userProblems.slice(0, 2).map((p) => <p key={p.message} role="alert" className="bsetup-problem">{tr(p.message)}</p>)}
      {links.length > 0 && <p className="bsetup-links" title={links.map(({ w, shops }) => `${w.name || w.code} → ${shops.map((x) => x.name || x.code).join(", ")}`).join(" · ")}>{links.map(({ w, shops }) => `${w.name || w.code} → ${shops.map((x) => x.name || x.code).join(", ")}`).join(" · ")} · {tr("Authorized inventory visibility")}</p>}
    </section>

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
      canImport={!!editing.savedId} onImport={() => { const at = editing; setEditingRow(null); setImporting({ kind: "Products", at: at.savedId }); }}
      canRemove={editing.savedId !== MAIN_LOCATION && live.length > 1} onRemove={() => { const at = editing; setEditingRow(null); removeRow(at); }}
      canDuplicate={live.length < plan.locations} onDuplicate={() => { const at = editing; setEditingRow(null); duplicateRow(at); }}
      onAssignUsers={() => { const at = editing; setEditingRow(null); if (at.savedId) openAccess("Location Assignments", at.savedId); else setManaging(at.key); }}
      onManageUsers={() => { const at = editing; setEditingRow(null); setManaging(at.key); }}
      onManageAccess={() => { const at = editing; setEditingRow(null); if (at.savedId) openAccess("Location Assignments", at.savedId); else setManaging(at.key); }}
      onClose={() => setEditingRow(null)}
      onSave={(rows, users) => { set({ rows: d.rows.map((x) => rows.find((y) => y.key === x.key) ?? x), users }); setEditingRow(null); }} />}

    {slotsOpen && <GlassPage label={tr("All user places are used")} onClose={() => setSlotsOpen(false)} narrow><div className="inventory-box dash-panel"><SlotsFull tr={tr} planId={plan.id} staffOnly={logins.used < logins.total} onClose={() => setSlotsOpen(false)} /></div></GlassPage>}
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
        onAdd={() => { setManaging(null); if (loginFull) { setSlotsOpen(true); return; } setNewUserLocation(site?.key ?? null); setEditingUser("new"); }} onAccess={() => openAccess("Location Assignments", site?.savedId ?? null)} onClose={() => setManaging(null)} />;
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
  const { own: choices, other: otherChoices } = shopChoices();
  const value = r.type === "shop" ? `shop:${placeTypeOf(r) ?? ""}` : r.type;
  return <div className={cn("bsetup-entry", `is-${r.type}`, selected && "is-selected", (nameProblem || codeProblem || phoneProblem) && "has-problem")} role="row">
    {/* Where the row sits on the page (1-5 left, 6-10 middle). It is not the location's number and is never saved. */}
    <span className="bsetup-rownum" role="cell" aria-label={`${tr("Row")} ${n}`}>{n}</span>
    <select className="inventory-input bsetup-type" role="cell" aria-label={`${tr("Type")} · ${title}`} title={tr(label)} value={value} onChange={(e) => { const v = e.target.value; if (v.startsWith("shop:")) onPlace(v.slice(5)); else onType(v as erp.LocationType); }}>
      {choices.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}{otherChoices.length > 0 && <optgroup label={tr("Other shop types")}>{otherChoices.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}</optgroup>}
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
  counterMax?: number | undefined; showCounters?: boolean | undefined; canImport?: boolean | undefined; canRemove?: boolean | undefined; selected?: boolean | undefined;
  onType: (t: erp.LocationType) => void; onPlace: (type: string) => void; onName?: (name: string) => void; onPhone?: (phone: string) => void; onCode?: (code: string) => void;
  onViewLogo?: (() => void) | undefined; onCounters?: (n: number) => void; onImport?: (() => void) | undefined; onEdit?: (() => void) | undefined; onManageUsers?: (() => void) | undefined; onManageAccess?: (() => void) | undefined; onAssignUsers?: (() => void) | undefined; onRemove?: (() => void) | undefined;
};
function LocationEntryRow({ r, n, tr, nameProblem, codeProblem, phoneProblem, placeholder, counterMax = 0, showCounters: countersOn = false, canImport = false, canRemove = false, selected = false, onType, onPlace, onName, onPhone, onCode, onCounters, onImport, onEdit, onRemove }: LocationEntryProps) {
  const label = r ? placeOf(r) : shopWord;
  const title = r ? r.name || `${tr(label)} ${n}` : `${tr("Location")} ${n}`;
  const { own: choices, other: otherChoices } = shopChoices();
  const value = r && !r.untyped ? r.type === "shop" ? `shop:${placeTypeOf(r) ?? ""}` : r.type : "";
  const hasCounters = !!r && !r.untyped && r.type === "shop" && counterMax > 0;
  const counters = r?.counters ?? 1;
  const pickType = (v: string) => { if (v.startsWith("shop:")) onPlace(v.slice(5)); else if (v) onType(v as erp.LocationType); };
  return <div className={cn("bsetup-entry", r && `is-${r.type}`, !r && "is-empty-slot", selected && "is-selected", (nameProblem || codeProblem || phoneProblem) && "has-problem")} role="row">
    <span className="bsetup-rownum" role="cell" aria-label={`${tr("Row")} ${n}`}>{n}</span>
    <select id={r ? `bsetup-type-${r.key}` : undefined} className={cn("inventory-input bsetup-type", r?.untyped && "is-untyped")} role="cell" aria-label={`${tr("Type")} · ${title}`} title={r && !r.untyped ? tr(label) : tr("Choose Shop or Warehouse")} value={value} onChange={(e) => pickType(e.target.value)}>
      {!r && <option value="">{tr("Type")}</option>}
      {r?.untyped && <option value="" disabled>{tr("Choose a place")}</option>}
      {!typeChosen && r?.type === "shop" && !r.untyped && <option value={value}>{tr(label)}</option>}
      {!typeChosen && <option value="" disabled>{tr("Shops: choose a business type first")}</option>}
      {choices.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}{otherChoices.length > 0 && <optgroup label={tr("Other shop types")}>{otherChoices.map((c) => <option key={c.value} value={c.value}>{tr(c.label)}</option>)}</optgroup>}
      <option value="store">{tr("Warehouse")}</option>
      {r?.type === "warehouse" && <option value="warehouse">{`${tr("Warehouse")} (${tr("older")})`}</option>}
    </select>
    <span className="bsetup-cell-name" role="cell">{r ? <input id={`bsetup-name-${r.key}`} className="inventory-input bsetup-name-input" required aria-label={`${tr(`${label} Name`)} ${n}`} aria-invalid={!!nameProblem} title={nameProblem ? tr(nameProblem) : r.name || undefined} value={r.name} placeholder={tr(r.untyped ? "Location name" : r.type === "shop" ? "e.g. Kariakor Branch" : "e.g. Industrial Area Warehouse")} onChange={(e) => onName?.(e.target.value)} /> : <span className="bsetup-ghost">{tr("Location name")}</span>}</span>
    {countersOn && <span className="bsetup-cell-counters" role="cell">{hasCounters ? <select className="bsetup-counter" aria-label={`${tr("Counters")} · ${title}`} title={`${tr("Counters")} (≤ ${counterMax})`} value={counters} onChange={(e) => onCounters?.(Number(e.target.value))}>{Array.from({ length: Math.max(counterMax, counters) }, (_, i) => i + 1).map((x) => <option key={x} value={x} disabled={x > counterMax}>{x}</option>)}</select> : <span className="bsetup-counter is-none" aria-label={tr("No counters")}>–</span>}</span>}
    <span className="bsetup-cell-phone" role="cell">{r ? <input id={`bsetup-phone-${r.key}`} type="tel" inputMode="tel" autoComplete="off" className="inventory-input bsetup-loc-phone" aria-label={`${tr("Phone")} · ${title} (${tr("Optional")})`} aria-invalid={!!phoneProblem} title={phoneProblem ? tr(phoneProblem) : tr("This location's phone, printed on its receipts. Empty: the business number.")} value={r.phone ?? ""} placeholder={tr("Phone")} onChange={(e) => onPhone?.(e.target.value)} /> : <span className="bsetup-ghost">{tr("Phone")}</span>}</span>
    <span className="bsetup-cell-code" role="cell">{r ? <input id={`bsetup-code-${r.key}`} className="inventory-input bsetup-code" aria-label={`${tr(`${label} No.`)} ${n} (${tr("Optional")})`} aria-invalid={!!codeProblem} title={codeProblem ? tr(codeProblem) : r.code || `${placeholder ?? ""} · ${tr("given on activation if left empty")}`} value={r.code} placeholder={placeholder} onChange={(e) => onCode?.(e.target.value.toUpperCase())} /> : <span className="bsetup-ghost">{tr("Number")}</span>}</span>
    <span className="bsetup-cell-upload" role="cell"><button type="button" className="bsetup-row-btn is-import" disabled={!r || !canImport} aria-label={`${tr("Import Data")} · ${title}`} title={r && canImport ? tr("Upload products for this location") : tr("Upload products here after Activate")} onClick={onImport}><Upload aria-hidden className="bsetup-row-btn-icon" /><span className="bsetup-row-btn-text">{tr("Import Data")}</span></button></span>
    <span className="bsetup-cell-edit" role="cell"><button type="button" className="bsetup-row-btn is-edit" disabled={!r} aria-label={`${tr("Edit")} · ${title}`} title={tr("Logo, details, counters, stock visibility, users and access for this location")} onClick={onEdit}><Pencil aria-hidden className="bsetup-row-btn-icon" /><span className="bsetup-row-btn-text">{tr("Edit")}</span></button></span>
    <span className="bsetup-cell-delete" role="cell"><button type="button" className="bsetup-row-btn is-delete" disabled={!r || !canRemove} aria-label={`${tr("Delete")} · ${title}`} title={r && !canRemove ? tr("The first location stays. Rename it or change its type.") : `${tr("Delete")} · ${title}`} onClick={onRemove}><Trash2 aria-hidden className="bsetup-row-btn-icon" /><span className="bsetup-row-btn-text">{tr("Delete")}</span></button></span>
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
    {/* The same Smart Import as "From another system" (owner, 2026-11-25): duplicates merged, phones cleaned, problems listed, and
        document numbers continue from the last one imported. Everything goes to the location chosen above. */}
    <SmartImport tr={tr} />
    <details className="bsetup-import-advanced"><summary>{tr("Advanced: one kind of record at a time")}</summary><ImportCenter tr={tr} only={kind} /></details>
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
        return <label key={n} className={cn("bsetup-pick bsetup-counter-pick", on && "is-on")} title={`${tr("Counter")} ${n}`}><input type="checkbox" aria-label={`${tr("Counter")} ${n}`} checked={on} onChange={(e) => toggle(r.key, n, e.target.checked)} /><span>{n}</span></label>;
      })}</div>
    </div>)}
    <p className="bsetup-note">{tr("Nothing ticked at a shop means any of its counters.")}</p>
  </fieldset>;
}

/** Shopkeepers work in shops and warehouse staff in stores and warehouses; the other roles can be anywhere (no role chosen yet: anywhere). */
const fitsRole = (role: string, type: erp.LocationType) => (role === "shopkeeper" ? type === "shop" : role === "warehouse_staff" ? type !== "shop" : true);

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
  const untyped = chosen.find((r) => r.untyped);
  if (untyped) { toast.error(tr("Choose the type of this location") + ": " + siteLabel(tr, rows, untyped)); return null; }
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
function EntryEditor({ tr, r, rows, focus, codeProblem, placeholder, logo, users, people, canManager, business, full, takenEmails, counterMax, onLogo, onSend, onConnect, onClose, onSave, onAssignUsers, onManageUsers, onManageAccess, canImport, onImport, canRemove, onRemove, canDuplicate = false, onDuplicate }: {
  onAssignUsers: () => void; onManageUsers: () => void; onManageAccess: () => void;
  canImport: boolean; onImport: () => void; canRemove: boolean; onRemove: () => void; canDuplicate?: boolean; onDuplicate?: () => void;
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
  const [address, setAddress] = useState(r.address ?? ""), [phone, setPhone] = useState(r.phone ?? "");
  // This location's own receipt heading, hours and tax PIN (empty: the business's), and a shop's usual warehouse.
  const [receiptHeader, setReceiptHeader] = useState(r.receiptHeader ?? ""), [hours, setHours] = useState(r.hours ?? ""), [taxPin, setTaxPin] = useState(r.taxPin ?? "");
  const [usual, setUsual] = useState(r.defaultWarehouse ?? "");
  /** Copies another location's settings into this one (counters, hours, receipt heading, tax PIN, connections, usual warehouse). */
  const copyFrom = (key: string) => {
    const o = rows.find((x) => x.key === key);
    if (!o) return;
    if (o.hours) setHours(o.hours);
    if (o.receiptHeader) setReceiptHeader(o.receiptHeader);
    if (o.taxPin) setTaxPin(o.taxPin);
    if (r.type === "shop" && o.type === "shop") { if (o.counters && counterMax > 0) setCounters(String(Math.min(o.counters, counterMax))); setLinks(o.connected ?? []); setUsual(o.defaultWarehouse ?? ""); }
    toast.success(`${tr("Copied from")} ${o.name || tr(placeOf(o))}`);
  };
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
    const me: SetupRow = { ...r, name, code: finalCode, address, phone: phone.trim() || undefined, receiptHeader, hours, taxPin: taxPin.trim().toUpperCase(), ...(r.type === "shop" ? { defaultWarehouse: usual && links.includes(usual) ? usual : undefined } : {}), ...(r.type === "shop" ? { connected: links, ...(counterMax > 0 ? { counters: n } : {}) } : {}) };
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
    if (full) { toast.error(tr(SLOTS_FULL)); return; }
    const x = checkUser(tr, u, places, current, takenEmails);
    if (x) save(x);
  };
  const sendInvitation = async () => {
    if (!inv.locked && !typed) { toast.error(tr("Fill in the person's name, email and role first")); personRef.current?.focus(); return; }
    if (full && !inv.locked) { toast.error(tr(SLOTS_FULL)); return; }
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
      {rows.some((x) => x.key !== r.key && x.name.trim()) && <label className="bsetup-field bsetup-ed-copy"><span>{tr("Copy settings from")}</span>
        <select className="inventory-input" value="" onChange={(e) => copyFrom(e.target.value)}>
          <option value="">{tr("Choose a location…")}</option>
          {rows.filter((x) => x.key !== r.key && x.name.trim()).map((x) => <option key={x.key} value={x.key}>{x.name} · {tr(placeOf(x))}</option>)}
        </select>
      </label>}
      <div className="bsetup-ed-receipt">
        <label className="bsetup-field"><span>{tr("Receipt heading")} <small>({tr("Optional")})</small></span><input className="inventory-input" value={receiptHeader} maxLength={120} onChange={(e) => setReceiptHeader(e.target.value)} placeholder={tr("e.g. Westlands Branch")} /></label>
        <label className="bsetup-field"><span>{tr("Opening hours")} <small>({tr("Optional")})</small></span><input className="inventory-input" value={hours} maxLength={120} onChange={(e) => setHours(e.target.value)} placeholder={tr("Mon–Sat 8am–8pm")} /></label>
        <label className="bsetup-field"><span>{tr("Tax PIN")} <small>({tr("Optional")})</small></span><input className="inventory-input" value={taxPin} maxLength={20} onChange={(e) => setTaxPin(e.target.value.toUpperCase())} placeholder={tr("Empty: the business's")} /></label>
      </div>
      {r.type === "shop" && links.length > 0 && <label className="bsetup-field bsetup-ed-usual"><span>{tr("Usual warehouse")} <small>({tr("restocking starts here")})</small></span>
        <select className="inventory-input" value={usual} onChange={(e) => setUsual(e.target.value)}>
          <option value="">{tr("None")}</option>
          {rows.filter((x) => links.includes(x.key)).map((x) => <option key={x.key} value={x.key}>{x.name || tr(placeOf(x))}</option>)}
        </select>
      </label>}
      <label className="bsetup-field bsetup-ed-phone"><span>{tr("Phone")} <small>({tr("Optional")})</small></span>
        <input className="inventory-input" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={tr("Printed on this location's receipts")} />
      </label>
      <label className="bsetup-field bsetup-ed-address"><span>{tr("Address")} <small>({tr("Optional")})</small></span>
        <input className="inventory-input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={tr("Street, building, town")} maxLength={160} />
      </label>
      {!code.trim() && !r.savedId && <p className="bsetup-note">{tr("No number typed. {x} is given on activation; type another to choose your own.", placeholder)}</p>}
      {codeProblem && <p role="alert" className="bsetup-problem">{tr(codeProblem)}</p>}

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
          {u.role && rolePreview(u.role) && <div className="bsetup-role-preview" aria-live="polite">
            <p><b>{tr("Can")}:</b> {rolePreview(u.role)!.can.map((x) => tr(x)).join(" · ")}</p>
            <p><b>{tr("Cannot")}:</b> {rolePreview(u.role)!.cannot.map((x) => tr(x)).join(" · ")}</p>
            <small>{tr("Change exact permissions any time in Manage Access.")}</small>
          </div>}
          <SitePicks tr={tr} five rows={current} list={places} chosen={u.locations} legend={tr("Assigned shops / warehouses")}
            onToggle={(k, on) => setU({ ...u, locations: on ? [...u.locations, k] : u.locations.filter((x) => x !== k) })} />
          <CounterPicks tr={tr} rows={current} chosen={u.locations} value={u.counters} onChange={(counters) => setU({ ...u, counters })} />
        </fieldset>
        {u.role && ROLE_HELP[u.role] && <p className="bsetup-note">{tr(ROLE_HELP[u.role]!)}{!canManager ? ` ${tr("Basic has no manager logins: one owner and one employee.")}` : ""}</p>}
        {full && !inv.locked && <SlotsFull tr={tr} planId={setupPlan(store.get()).id} />}
        {(typed || inv.locked) && <p className="bsetup-note">{tr("Send Invitation emails {x} now", u.email.trim() || "—")} · {tr("Business")}: {business || "—"}. {tr("Each person counts once, whatever sites they are assigned to.")}</p>}
        <InviteOutcome tr={tr} inv={inv} email={u.email.trim()} onConnect={() => { const x = checkUser(tr, u, places, current, takenEmails); if (x) onConnect(x); }} />
        {sentTo && <p role="status" className="bsetup-sent">{tr("Invitation sent")} · {sentTo} · {tr("Pending acceptance")}<small> · {tr("The email provider accepted the message; that doesn't yet mean it reached the inbox or was accepted.")}</small></p>}
        {/* Round 14: links, counters & hardware and access buttons sit here so the window fits a laptop without scrolling. */}
        {choices.length > 0 && <SitePicks tr={tr} five rows={rows} list={choices} chosen={links} legend={tr(r.type === "shop" ? "Warehouses this shop can view" : "Shops that can view this stock")}
          onToggle={(k, on) => setLinks(on ? [...links, k] : links.filter((x) => x !== k))} />}
        {r.type === "shop" && r.savedId && <CounterHardwareRows tr={tr} shop={r.savedId} count={Math.max(1, Number(counters) || 1)} />}
        <div className="bsetup-ed-access" role="group" aria-label={tr("Users and access for this location")}>
          <button type="button" className="bsetup-co-btn is-users" onClick={onAssignUsers}><Users aria-hidden /> {tr("Assign Users")}</button>
          <button type="button" className="bsetup-co-btn is-users" onClick={onManageUsers}><Users aria-hidden /> {tr("Manage Users")}</button>
          <button type="button" className="bsetup-co-btn is-access" onClick={onManageAccess}><ShieldCheck aria-hidden /> {tr("Manage Access")}</button>
        </div>
      </section>
      </div>

      <footer className="bsetup-editor-foot">
        <button type="button" className="bsetup-act is-stop" disabled={busy} onClick={onClose}>{tr("Cancel")}</button>
        {/* One button per location row (owner, 2026-11-23): Import Data and Delete live here. */}
        <span className="bsetup-editor-more">
          <button type="button" className="bsetup-row-btn is-import" disabled={busy || !canImport} title={canImport ? tr("Upload products for this location") : tr("Upload products here after Activate")} onClick={onImport}>{tr("Import Data")}</button>
          <button type="button" className="bsetup-row-btn is-duplicate" disabled={busy || !canDuplicate} title={canDuplicate ? tr("A new location with these settings") : tr("All your plan's locations are in use")} onClick={onDuplicate}>{tr("Duplicate")}</button>
          <button type="button" className="bsetup-row-btn is-delete" disabled={busy || !canRemove} title={canRemove ? tr("Delete") : tr("The first location stays. Rename it or change its type.")} onClick={onRemove}>{tr("Delete")}</button>
        </span>
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
  // Staff is a role too (owner, 2026-11-24): it starts with nothing and gets exactly the access chosen below.
  const roles = ROLES.filter(([id]) => (canManager || !isManagerRole(id) || initial?.role === id) && (plan.id !== "basic" || id !== "warehouse_staff" || initial?.role === id));
  const [u, setU] = useState<SetupUser>(() => initial ?? { key: newKey(), name: "", phone: "", email: "", role: roles.find(([id]) => !isManagerRole(id))?.[0] ?? "staff", locations: rows.length === 1 ? [rows[0]!.key] : [] });
  const places = rows.filter((r) => fitsRole(u.role, r.type));
  const chosenSites = places.filter((r) => u.locations.includes(r.key));
  const ready = () => checkUser(tr, u, places, rows, takenEmails);
  const save = () => { const x = ready(); if (x) onSave(x); };
  const send = async () => { const x = ready(); if (x) await inv.send(x); };
  const { done, locked, sending } = inv;
  const allOn = places.length > 0 && places.every((r) => u.locations.includes(r.key));
  // One page (owner, 2026-11-24): name, email, phone and role on one line; sites and counters on the left, access on the right,
  // so even 20 shops and 20 counters fit without scrolling. Changing the role starts the access again from that role.
  return <GlassNotice title={tr(initial ? "Edit User" : "Add User")} onClose={onClose} className="bsetup-dialog is-user is-user-page">
    {/* Once the person is saved their details live in People & Access, so they can't drift from what the server holds. */}
    <fieldset className="bsetup-lockable bsetup-user-form" disabled={locked || sending}>
    <div className="bsetup-user-line">
      <label className="bsetup-field"><span>{tr("Full Name")} <i>*</i></span><input className="inventory-input" value={u.name} onChange={(e) => setU({ ...u, name: e.target.value })} /></label>
      <label className="bsetup-field"><span>{tr("Email")} <i>*</i></span><input className="inventory-input" type="email" autoComplete="off" title={tr("Any email provider works, Gmail included. DataQuill Solutions never asks for their email password: they set their own DataQuill Solutions password from the invitation.")} value={u.email} onChange={(e) => setU({ ...u, email: e.target.value })} placeholder="name@gmail.com" /></label>
      <label className="bsetup-field"><span>{tr("Phone Number")} <small>({tr("Optional")})</small></span><input className="inventory-input" inputMode="tel" value={u.phone} onChange={(e) => setU({ ...u, phone: e.target.value })} /></label>
      <label className="bsetup-field"><span>{tr("Role")} <i>*</i></span>
        <select className="inventory-input" value={u.role} title={ROLE_HELP[u.role] ? tr(ROLE_HELP[u.role]!) : undefined} onChange={(e) => { const { access: _drop, ...rest } = u; setU({ ...rest, role: e.target.value }); }}>{roles.map(([id, l]) => <option key={id} value={id}>{tr(id === "staff" ? "Staff (choose access)" : l)}</option>)}</select>
      </label>
    </div>
    {!canManager && <p className="bsetup-note">{tr("Basic has no manager logins: one owner and one employee.")}</p>}
    <div className="bsetup-user-cols">
      <div className="bsetup-user-places">
        <SitePicks tr={tr} required rows={rows} list={places} chosen={u.locations} five legend={tr("Assigned Shops / Warehouses")}
          onToggle={(k, on) => setU({ ...u, locations: on ? [...u.locations, k] : u.locations.filter((x) => x !== k) })} />
        {places.length > 1 && <button type="button" className="bsetup-link-btn bsetup-all-sites" onClick={() => setU({ ...u, locations: allOn ? [] : places.map((r) => r.key) })}>{tr(allOn ? "Clear all" : "All locations")}</button>}
        <CounterPicks tr={tr} rows={rows} chosen={u.locations} value={u.counters} onChange={(counters) => setU({ ...u, counters })} />
      </div>
      <AccessPicker tr={tr} role={u.role} access={u.access} onChange={(access) => setU({ ...u, access })} />
    </div>
    </fieldset>
    {/* What the send button will do, before it is pressed: the click itself is the owner's confirmation. */}
    <p className="bsetup-send-sum is-line" role="note"><b>{tr("Add & Send Invitation emails this person now")}</b> · {tr("To")}: {u.email.trim() || "—"} · {tr("Role")}: {tr(roleLabel(u.role))} · {tr("Sites")}: {chosenSites.map((r) => siteLabel(tr, rows, r)).join(", ") || "—"}</p>
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
      <ShopButton className="h-auto min-h-11 px-3 py-2 text-sm" title={logins.used >= logins.total ? tr(SLOTS_FULL) : undefined} onClick={onAdd}><UserPlus /> {tr(site ? "Add user to this site" : "Add User")}</ShopButton>
    </div>
  </GlassNotice>;
}

/** The import center from Settings, limited to products or opening stock. Stock goes to the location chosen here. */

/** Suggestion 5: each counter's receipt printer, barcode scanner and cash drawer, kept on this device, with a test print. A browser
 *  can't open a drawer by itself: drawers wired to the receipt printer open through the printer's own "open drawer" setting. */
function CounterHardwareRows({ tr, shop, count }: { tr: Tr; shop: string; count: number }) {
  const [hw, setHw] = useState(() => Array.from({ length: count }, (_, i) => counterHardware(shop, i + 1)));
  const [testing, setTesting] = useState<number | null>(null);
  // The counter count can change while the window is open: rows follow it, each with its saved hardware.
  const list = Array.from({ length: count }, (_, i) => hw[i] ?? counterHardware(shop, i + 1));
  const change = (i: number, p: Partial<CounterHardware>) => { const next = list.map((h, j) => (j === i ? { ...h, ...p } : h)); setHw(next); saveCounterHardware(shop, i + 1, next[i]!); };
  return <div className="bsetup-ed-hardware">
    <span className="bsetup-ed-hardware-title">{tr("Counters & hardware")} <small>({tr("this device")})</small></span>
    {list.map((h, i) => <div key={i} className="bsetup-ed-hardware-row">
      <b>{tr("Counter")} {i + 1}</b>
      <select className="inventory-input" aria-label={`${tr("Receipt printer")} · ${tr("Counter")} ${i + 1}`} value={h.printer} onChange={(e) => change(i, { printer: e.target.value as CounterHardware["printer"] })}>
        <option value="none">{tr("No printer")}</option><option value="58mm">58 mm</option><option value="80mm">80 mm</option><option value="A4">A4</option>
      </select>
      <label className="feature-check"><input type="checkbox" checked={h.scanner} onChange={(e) => change(i, { scanner: e.target.checked })} /> {tr("Scanner")}</label>
      <label className="feature-check"><input type="checkbox" checked={h.drawer} onChange={(e) => change(i, { drawer: e.target.checked })} /> {tr("Cash drawer")}</label>
      <button type="button" className="bsetup-co-btn is-owner" disabled={h.printer === "none"} onClick={() => setTesting(i + 1)}>{tr("Test print")}</button>
    </div>)}
    {testing && <PrintPreview title={tr("Test print")} onClose={() => setTesting(null)}>
      <div className="receipt-paper mx-auto p-4 font-mono text-[12px]" style={{ width: list[testing - 1]?.printer === "58mm" ? "48mm" : list[testing - 1]?.printer === "A4" ? "180mm" : "72mm" }}>
        <p className="text-center font-bold">DATAQUILL SOLUTIONS</p><p className="text-center">{tr("Test print")} · {tr("Counter")} {testing}</p>
        <p className="text-center">{new Date().toLocaleString("en-GB")}</p><p className="text-center">--------------------------------</p>
        <p className="text-center">{tr("If you can read this line, the printer works.")}</p>
      </div>
    </PrintPreview>}
  </div>;
}
