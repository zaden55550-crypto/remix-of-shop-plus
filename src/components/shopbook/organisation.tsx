// Settings › Organisation Management: the shop's locations and how many its plan allows. Records go through src/lib/locations.ts.
import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, ImagePlus, MapPin, Plus, Store, Warehouse, X } from "lucide-react";
import { toast } from "sonner";
import { readProductImage } from "@/lib/product-export";
import { Badge, Empty, type Tr } from "@/components/shopbook/erp-shell";
import { GlassPage } from "@/components/shopbook/glass-page";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useBusinessErp, useErp } from "@/components/shopbook/product-search";
import { Act, ListScreen, dayText, type Col } from "@/components/shopbook/purchase-ui";
import { run } from "@/components/shopbook/selling";
import { isStorageLocation, type ErpState, type Location, type LocationType } from "@/lib/erp";
import { MAX_LOCATION_PHOTOS, isActiveLocation, listLocations, locationUsage, overPlanLocations, saveLocation, setLocationActive } from "@/lib/locations";
import { PLANS, store } from "@/lib/shopbook";

// Stores and older warehouses are both shown as Warehouse (owner's wording, 2026-11-20); the saved type is unchanged.
const typeLabel = (t: LocationType) => (t === "shop" ? "Shop" : "Warehouse");
const manager = (s: ErpState, id?: string) => s.employees.find((e) => e.id === id)?.name ?? "";

function Head({ title, onClose, tr }: { title: string; onClose: () => void; tr: Tr }) {
  return <div className="pw-page-head"><span /><h2>{title}</h2><button type="button" className="pw-btn" aria-label={tr("Close")} onClick={onClose}><X /></button></div>;
}
const Facts = ({ rows }: { rows: [string, string][] }) => <dl className="pm-facts">{rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;

/** Up to four photos of a location (shop front, inside). Each is made small before it is kept, as product images are. */
export function LocationPhotos({ photos, onChange, tr }: { photos: string[]; onChange: (p: string[]) => void; tr: Tr }) {
  const ref = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    const room = MAX_LOCATION_PHOTOS - photos.length;
    const chosen = [...(files ?? [])].slice(0, room);
    if (files && files.length > room) toast.error(tr("Up to 4 photos per location"));
    const read: string[] = [];
    for (const f of chosen) { try { read.push(await readProductImage(f, 800)); } catch (e) { toast.error(tr(e instanceof Error ? e.message : "That image could not be read")); } }
    if (read.length) onChange([...photos, ...read]);
  };
  return <div className="inventory-field loc-photos">
    <span>{tr("Location photos")} <small>({photos.length} / {MAX_LOCATION_PHOTOS})</small></span>
    <div className="loc-photo-grid">
      {photos.map((p, i) => <figure key={i} className="loc-photo"><img src={p} alt={`${tr("Location photo")} ${i + 1}`} /><button type="button" className="pw-btn" aria-label={`${tr("Remove photo")} ${i + 1}`} onClick={() => onChange(photos.filter((_, j) => j !== i))}><X /></button></figure>)}
      {photos.length < MAX_LOCATION_PHOTOS && <button type="button" className="pw-btn loc-photo-add" onClick={() => ref.current?.click()}><ImagePlus /><span>{tr("Add photo")}</span></button>}
    </div>
    <input ref={ref} hidden type="file" accept="image/*" multiple onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
  </div>;
}

function LocationForm({ s, tr, item, startType, onClose }: { s: ErpState; tr: Tr; item?: Location | undefined; startType?: LocationType | undefined; onClose: () => void }) {
  const [type, setType] = useState<LocationType>(item?.type ?? startType ?? "shop");
  const [f, setF] = useState({ name: item?.name ?? "", code: item?.code ?? "", address: item?.address ?? "", phone: item?.phone ?? "" });
  const [managerId, setManagerId] = useState(item?.managerId ?? "");
  const [connected, setConnected] = useState<string[]>(item?.connected ?? []);
  const [photos, setPhotos] = useState<string[]>(item?.photos ?? []);
  // `s` is the open business's view: only its own stores, warehouses and people can be connected or chosen.
  // The location allowance is shared by all the owner's businesses, so it is counted on everything.
  const storage = listLocations(s).filter((l) => isStorageLocation(l) && isActiveLocation(l) && l.id !== item?.id);
  const u = locationUsage(useErp());
  const field = (k: keyof typeof f, label: string, req = false) => <label className="inventory-field"><span>{tr(label)}{req && <span className="text-destructive"> *</span>}</span><input className="inventory-input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>;
  const title = tr(item ? "Edit Location" : "Add Location");
  return <GlassPage label={title} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pw-form pm-form">
    <Head title={title} onClose={onClose} tr={tr} />
    {!item && <p className="pw-note">{u.available} {tr("of")} {u.max} {tr("location slots left. Shops and warehouses use the same slots.")}</p>}
    <label className="inventory-field"><span>{tr("Location Type")} <span className="text-destructive">*</span></span><select className="inventory-input" value={type} onChange={(e) => setType(e.target.value as LocationType)}><option value="shop">{tr("Shop")}</option>{item?.type === "store" && <option value="store">{tr("Store")}</option>}<option value="warehouse">{tr("Warehouse")}</option></select></label>
    {field("name", "Location Name", true)}{field("code", "Location Code")}{field("address", "Address")}{field("phone", "Contact Number")}
    <LocationPhotos photos={photos} onChange={setPhotos} tr={tr} />
    <label className="inventory-field"><span>{tr("Manager (Optional)")}</span><select className="inventory-input" value={managerId} onChange={(e) => setManagerId(e.target.value)}><option value="">{tr("No manager")}</option>{s.employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
    {type === "shop" && storage.length > 0 && <fieldset className="people-checks">
      <legend>{tr("Connected stores and warehouses")}</legend>
      {storage.map((l) => <label key={l.id}><input type="checkbox" checked={connected.includes(l.id)} onChange={(e) => setConnected(e.target.checked ? [...connected, l.id] : connected.filter((x) => x !== l.id))} /><span>{l.name} • {tr(typeLabel(l.type))}</span></label>)}
    </fieldset>}
    {type === "shop" && storage.length > 0 && <p className="pw-note">{tr("This shop's staff can view their stock. Viewing moves nothing; stock moves only by a transfer that is dispatched and then received.")}</p>}
    <div className="pw-foot"><span /><span className="pw-foot-right"><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="button" className="pw-btn is-primary" onClick={() => { if (run(() => saveLocation({ id: item?.id, ...f, type, managerId, connected: connected.filter((id) => storage.some((l) => l.id === id)), photos }), tr("Location saved"))) onClose(); }}>{tr("Save Location")}</button></span></div>
  </div></GlassPage>;
}

function Locations({ tr, only }: { tr: Tr; only?: LocationType | undefined }) {
  const s = useErp(), view = useBusinessErp();
  const [form, setForm] = useState<{ item?: Location } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  // The open business's locations only; whether one is over the plan is decided across all businesses.
  const rows = listLocations(view).filter((l) => !only || l.type === only || (only !== "shop" && l.type !== "shop"));
  const viewed = listLocations(view).find((l) => l.id === viewId);
  const overPlan = new Set(overPlanLocations(s).map((l) => l.id));
  const status = (l: Location) => (overPlan.has(l.id) ? "Over plan" : isActiveLocation(l) ? "Active" : "Archived");
  const columns: Col<Location>[] = [
    { label: "Code", value: (l) => l.code }, { label: "Location Name", value: (l) => l.name }, { label: "Type", value: (l) => typeLabel(l.type) }, { label: "Address", value: (l) => l.address ?? "" }, { label: "Contact Number", value: (l) => l.phone ?? "" },
    { label: "Manager", value: (l) => manager(s, l.managerId) }, { label: "Status", value: status, render: (l) => <Badge s={status(l)} /> },
  ];
  const label = only ? `Add ${typeLabel(only)}` : "Add Location";
  return <>
    <AllowanceWarning s={s} tr={tr} />
    <ListScreen title={only ? `${typeLabel(only)}s` : "Locations"} shop={store.get()?.shopName ?? ""} items={rows} columns={columns} idOf={(l) => l.id} money={String} tr={tr} empty="No locations yet" ph="Search locations..."
      text={(l) => `${l.name} ${l.code} ${l.address ?? ""}`} filters={[{ label: "Status", get: status, options: ["Active", "Archived"] }, ...(only ? [] : [{ label: "Type", get: (l: Location) => typeLabel(l.type), options: ["Shop", "Warehouse"] }])]}
      primary={{ label, icon: <Plus />, onClick: () => setForm({}) }}
      actions={(l) => <><Act label={`${tr("View")} ${l.name}`} onClick={() => setViewId(l.id)}>{tr("View")}</Act><Act label={`${tr("Edit")} ${l.name}`} onClick={() => setForm({ item: l })}>{tr("Edit")}</Act><Act label={`${tr(isActiveLocation(l) ? "Archive" : "Activate")} ${l.name}`} onClick={() => run(() => setLocationActive(l.id, !isActiveLocation(l)), tr(isActiveLocation(l) ? "Location archived" : "Location activated"))}>{tr(isActiveLocation(l) ? "Archive" : "Activate")}</Act></>} />
    {form && <LocationForm s={view} tr={tr} item={form.item} startType={only} onClose={() => setForm(null)} />}
    {viewed && <GlassPage label={viewed.name} onClose={() => setViewId(null)} narrow><div className="inventory-box dash-panel pw-page pm-form"><Head title={viewed.name} onClose={() => setViewId(null)} tr={tr} /><Facts rows={[[tr("Code"), viewed.code], [tr("Type"), tr(typeLabel(viewed.type))], [tr("Status"), tr(status(viewed))], [tr("Address"), viewed.address ?? ""], [tr("Contact Number"), viewed.phone ?? ""], [tr("Manager"), manager(s, viewed.managerId)], [tr("Created"), dayText(viewed.createdAt || undefined)]]} />{viewed.photos?.length ? <div className="loc-photo-grid is-view">{viewed.photos.map((p, i) => <figure key={i} className="loc-photo"><img src={p} alt={`${viewed.name} ${i + 1}`} /></figure>)}</div> : null}</div></GlassPage>}
  </>;
}

function AllowanceWarning({ s, tr }: { s: ErpState; tr: Tr }) {
  const u = locationUsage(s);
  if (u.over) return <p className="settings-note" role="alert">{tr("You have")} {u.over} {tr("more active locations than your plan allows. Nothing is deleted, but you can't add more until you archive some or upgrade.")} <Link to="/plans" className="dash-link">{tr("Upgrade")}</Link></p>;
  if (!u.available) return <p className="settings-note">{tr("All your location slots are in use. Upgrade or archive a location to add another.")} <Link to="/plans" className="dash-link">{tr("Upgrade")}</Link></p>;
  return null;
}

/** Plan, active, available: also shown under Settings › Subscription. */
export function LocationAllowance({ tr }: { tr: Tr }) {
  const s = useErp(), u = locationUsage(s), acct = store.get();
  const plan = acct?.plan === "trial" ? "Free trial" : PLANS.find((p) => p.id === acct?.plan)?.name ?? "No plan";
  return <div className="pm-form">
    <AllowanceWarning s={s} tr={tr} />
    <Facts rows={[[tr("Current plan"), tr(plan)], [tr("Maximum locations"), String(u.max)], [tr("Active locations"), String(u.active)], [tr("Available locations"), String(u.available)], [tr("Shops"), String(u.shops)], [tr("Warehouses"), String(u.stores + u.warehouses)], [tr("Archived"), String(u.archived)], [tr("Total login accounts allowed"), String(u.logins.total)]]} />
    <p className="pw-note">{tr("Every Shop or Warehouse uses one location allowance. Choose any mix within your plan limit.")}</p>
    <p className="pw-note">{tr("Your plan has one pool of logins. Place staff at any shop or warehouse: all at one, or shared. Managers have their own limit within the pool.")}</p>
    <p className="pw-note">{PLANS.map((p) => `${p.name}: ${p.locations}`).join(" · ")}</p>
    {acct?.plan === "trial" && <p className="pw-note">{tr("The free trial includes the Business allowance. If you later choose a smaller plan, nothing is deleted; you just can't add more until you are within its limit.")}</p>}
  </div>;
}

function Overview({ tr }: { tr: Tr }) {
  const s = useErp(), u = locationUsage(s), acct = store.get();
  const activity = s.audit.filter((a) => /^LOCATION /.test(a.action)).slice(0, 6);
  return <div className="pm-form">
    <AllowanceWarning s={s} tr={tr} />
    <KpiRow>
      <Kpi tone="info" label={tr("Active Locations")} value={`${u.active} / ${u.max}`} icon={<MapPin />} />
      <Kpi tone="good" label={tr("Shops")} value={String(u.shops)} icon={<Store />} />
      {u.stores > 0 && <Kpi tone="good" label={tr("Warehouses")} value={String(u.stores)} icon={<Store />} />}
      <Kpi tone="warn" label={tr("Warehouses")} value={String(u.warehouses)} icon={<Warehouse />} />
      <Kpi tone="profit" label={tr("Available Slots")} value={String(u.available)} icon={<Boxes />} />
    </KpiRow>
    <Facts rows={[[tr("Organisation"), acct?.shopName ?? ""], [tr("Owner"), acct?.email ?? ""], [tr("Employees on payroll"), String(s.employees.filter((e) => e.active).length)]]} />
    <p className="money-heading">{tr("Recent organisation activity")}</p>
    {activity.length ? activity.map((a) => <p key={a.id} className="settings-note">{dayText(a.at)} • {a.detail}</p>) : <Empty>{tr("No location changes yet")}</Empty>}
  </div>;
}

export function OrganisationPanel({ name, tr }: { name: string; tr: Tr }) {
  if (name === "Organisation Overview") return <Overview tr={tr} />;
  if (name === "Shops") return <Locations key="shops" tr={tr} only="shop" />;
  if (name === "Stores" || name === "Warehouses") return <Locations key="warehouses" tr={tr} only="store" />;
  if (name === "Location Allowance") return <LocationAllowance tr={tr} />;
  return <Locations key="all" tr={tr} />;
}
