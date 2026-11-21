// Inventory › Configuration › Product Setup: four cards over the real catalog records. Add and Manage float as glass
// panels; every save goes through src/lib/catalog.ts, so the Products form, Purchases and sync all see the same records.
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Apple, Baby, BookOpen, Car, ChevronDown, Crown, Gift, ImagePlus, Laptop, Layers, List, Palette, Pencil, Pill, Plus, Search, Shirt, ShoppingBasket, SlidersHorizontal, Sofa, Tag, Trash2, Wrench, X, type LucideIcon } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { GlassPage } from "@/components/shopbook/glass-page";
import { PwField } from "@/components/shopbook/product-workspace";
import { run } from "@/components/shopbook/selling";
import * as catalog from "@/lib/catalog";
import * as erp from "@/lib/erp";
import { readProductImage } from "@/lib/product-export";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Tr = (t: string) => string;
type Kind = catalog.CatalogKind;
type Registering = { kind: Kind; name: string } | null;
type Form =
  | { t: "catalog"; kind: Kind; item?: erp.CatalogItem; name?: string }
  | { t: "unit"; item?: erp.Unit }
  | { t: "attribute"; item?: erp.Attribute; name?: string; values?: string[] };
type Manage = Kind | "units" | "attributes" | null;

const ICONS: Record<string, LucideIcon> = { tag: Tag, basket: ShoppingBasket, laptop: Laptop, shirt: Shirt, apple: Apple, pill: Pill, wrench: Wrench, sofa: Sofa, book: BookOpen, baby: Baby, car: Car, gift: Gift };
const EXAMPLES: Record<Kind, { name: string; icon?: string }[]> = {
  categories: [{ name: "Food & Drinks", icon: "basket" }, { name: "Electronics", icon: "laptop" }, { name: "Clothing", icon: "shirt" }, { name: "Household", icon: "sofa" }, { name: "Stationery", icon: "book" }, { name: "Beauty & Health", icon: "pill" }],
  brands: [{ name: "Samsung" }, { name: "Tecno" }, { name: "HP" }, { name: "Infinix" }, { name: "Nokia" }, { name: "Oppo" }],
};
const EXAMPLE_ATTRIBUTES = [
  { name: "Size", values: ["S", "M", "L", "XL"] },
  { name: "Colour", values: ["Black", "White", "Red"] },
  { name: "Storage", values: ["64GB", "128GB", "256GB"] },
];
const SWATCH = new Set(["black", "white", "red", "blue", "green", "yellow", "orange", "purple", "pink", "brown", "grey", "gray", "navy", "silver", "gold"]);
const WORDS = {
  categories: { one: "Category", low: "category", many: "Categories", sub: "Create and manage product categories.", Icon: Tag },
  brands: { one: "Brand", low: "brand", many: "Brands", sub: "Add and manage product brands.", Icon: Crown },
} as const;
const isOn = (x: { active?: boolean | undefined }) => x.active !== false;

function Status({ on, tr }: { on: boolean; tr: Tr }) {
  return <span className={cn("pw-status", on ? "is-ok" : "is-off")}><i />{tr(on ? "Active" : "Inactive")}</span>;
}
function Avatar({ item }: { item: erp.CatalogItem }) {
  return item.logo ? <img className="ps-logo" src={item.logo} alt="" /> : <span className="ps-logo ps-letter">{item.name.charAt(0).toUpperCase()}</span>;
}
function PanelHead({ title, onClose, tr }: { title: string; onClose: () => void; tr: Tr }) {
  return <div className="pw-page-head"><span /><h2>{title}</h2><button type="button" className="pw-btn" aria-label={tr("Close")} onClick={onClose}><X /></button></div>;
}
function FormFoot({ save, onClose, tr }: { save: string; onClose: () => void; tr: Tr }) {
  return <div className="pw-foot"><span /><span className="pw-foot-right"><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="submit" className="pw-btn is-primary">{save}</button></span></div>;
}

// ---------- Add and edit ----------
function CatalogForm({ form, onClose, onSaved, tr }: { form: Extract<Form, { t: "catalog" }>; onClose: () => void; onSaved: (id: string) => void; tr: Tr }) {
  const w = WORDS[form.kind], brand = form.kind === "brands";
  const [name, setName] = useState(form.item?.name ?? form.name ?? "");
  const [description, setDescription] = useState(form.item?.description ?? "");
  const [icon, setIcon] = useState(form.item?.icon ?? EXAMPLES.categories.find((x) => x.name === form.name)?.icon ?? "");
  const [logo, setLogo] = useState(form.item?.logo ?? "");
  const [reading, setReading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const choose = async (f?: File) => {
    if (!f) return;
    setReading(true);
    try { setLogo(await readProductImage(f, 160)); }
    catch (e) { toast.error(tr(e instanceof Error ? e.message : "That image could not be read")); }
    finally { setReading(false); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const saved = run(() => catalog.saveCatalogItem(form.kind, { id: form.item?.id, name, description, icon, logo }), tr(`${w.one} saved`));
    if (saved) onSaved(saved.id);
  };
  const title = tr(`${form.item ? "Edit" : "Add"} ${w.one}`);
  return (
    <GlassPage label={title} onClose={onClose} narrow>
      <form className="inventory-box dash-panel pw-page pw-form ps-form" onSubmit={submit}>
        <PanelHead title={title} onClose={onClose} tr={tr} />
        <PwField label={tr(`${w.one} Name`)} required><input autoFocus className="inventory-input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></PwField>
        <PwField label={tr(`${w.one} Description (optional)`)}><textarea className="inventory-input" rows={2} maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} /></PwField>
        {brand ? (
          <div className="pw-field" role="group" aria-label={tr("Brand Logo")}>
            <span>{tr("Brand Logo (optional)")}</span>
            <span className="pw-image-choose">
              {logo && <img src={logo} alt="" />}
              <button type="button" className="pw-btn" disabled={reading} onClick={() => file.current?.click()}><ImagePlus /><span>{tr(reading ? "Reading..." : logo ? "Change logo" : "Upload logo")}</span></button>
              {logo && <button type="button" className="pw-btn" onClick={() => setLogo("")}><X /><span>{tr("Remove")}</span></button>}
              <input ref={file} hidden type="file" accept="image/*" aria-label={tr("Brand logo file")} onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
            </span>
          </div>
        ) : (
          <div className="pw-field" role="group" aria-label={tr("Category Icon")}>
            <span>{tr("Category Icon (optional)")}</span>
            <div className="ps-icons">
              {Object.entries(ICONS).map(([k, Icon]) => <button key={k} type="button" aria-label={k} aria-pressed={icon === k} className={cn("ps-icon-pick", icon === k && "is-on")} onClick={() => setIcon(icon === k ? "" : k)}><Icon /></button>)}
            </div>
          </div>
        )}
        <FormFoot save={tr(`Save ${w.one}`)} onClose={onClose} tr={tr} />
      </form>
    </GlassPage>
  );
}

function UnitForm({ s, item, onClose, onSaved, tr }: { s: erp.ErpState; item?: erp.Unit | undefined; onClose: () => void; onSaved: (id: string) => void; tr: Tr }) {
  const [name, setName] = useState(item?.name ?? "");
  const [abbr, setAbbr] = useState(item?.abbr ?? "");
  const [type, setType] = useState<erp.UnitType | "">(item?.type ?? "");
  const [baseId, setBaseId] = useState(item?.baseId ?? "");
  const [factor, setFactor] = useState(item?.factor === undefined ? "" : String(item.factor));
  // Only the same kind of unit can convert: a Carton to Pieces, never a Carton to Kg.
  const bases = catalog.listUnits(s).filter((u) => u.id !== item?.id && u.type === type && (isOn(u) || u.id === baseId));
  const base = bases.find((u) => u.id === baseId);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!type) { toast.error(tr("Choose a unit type")); return; }
    const saved = run(() => catalog.saveUnit({ id: item?.id, name, abbr, type, baseId: baseId || undefined, factor: baseId ? Number(factor) : undefined }), tr("Unit saved"));
    if (saved) onSaved(saved.id);
  };
  const title = tr(item ? "Edit Unit" : "Add Unit");
  return (
    <GlassPage label={title} onClose={onClose} narrow>
      <form className="inventory-box dash-panel pw-page pw-form ps-form" onSubmit={submit}>
        <PanelHead title={title} onClose={onClose} tr={tr} />
        <PwField label={tr("Unit Name")} required><input autoFocus className="inventory-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></PwField>
        <PwField label={tr("Abbreviation")} required><input className="inventory-input" maxLength={12} value={abbr} onChange={(e) => setAbbr(e.target.value)} /></PwField>
        <PwField label={tr("Unit Type")} required>
          <select className="inventory-input" value={type} onChange={(e) => { setType(e.target.value as erp.UnitType); setBaseId(""); }}>
            <option value="">{tr("Choose a type")}</option>
            {catalog.UNIT_TYPES.map((t) => <option key={t.key} value={t.key}>{tr(t.label)}</option>)}
          </select>
        </PwField>
        <div className="pw-field" role="group" aria-label={tr("Conversion")}>
          <span>{tr("Conversion (optional)")}</span>
          <div className="ps-convert">
            <em>1 {name.trim() || tr("unit")} =</em>
            <input className="inventory-input" type="number" min="0" step="any" aria-label={tr("How many")} disabled={!baseId} value={factor} onChange={(e) => setFactor(e.target.value)} />
            <select className="inventory-input" aria-label={tr("Converts to")} disabled={!type} value={baseId} onChange={(e) => setBaseId(e.target.value)}>
              <option value="">{tr("No conversion")}</option>
              {bases.map((u) => <option key={u.id} value={u.id}>{tr(u.name)}</option>)}
            </select>
          </div>
          {base && Number(factor) > 0 && <p className="pw-note">{tr("Buying")} 2 {name.trim() || tr("unit")} {tr("adds")} {erp.roundQty(2 * Number(factor))} {tr(base.name)} {tr("to stock.")}</p>}
        </div>
        <FormFoot save={tr("Save Unit")} onClose={onClose} tr={tr} />
      </form>
    </GlassPage>
  );
}

function AttributeForm({ s, form, onClose, tr }: { s: erp.ErpState; form: Extract<Form, { t: "attribute" }>; onClose: () => void; tr: Tr }) {
  const { item } = form;
  const [name, setName] = useState(item?.name ?? form.name ?? "");
  const [values, setValues] = useState<{ id?: string; name: string; active?: boolean | undefined }[]>(item?.values.map((v) => ({ ...v })) ?? (form.values ?? []).map((v) => ({ name: v })));
  const [more, setMore] = useState("");
  const typed = () => more.split(",").map((t) => t.trim()).filter(Boolean).map((t) => ({ name: t }));
  const addTyped = () => { if (typed().length) { setValues([...values, ...typed()]); setMore(""); } };
  const put = (i: number, patch: { name?: string; active?: boolean | undefined }) => setValues(values.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    // A value still in the box counts: people press Save without pressing Add first.
    if (run(() => catalog.saveAttribute({ id: item?.id, name, values: [...values, ...typed()] }), tr("Attribute saved"))) onClose();
  };
  const title = tr(item ? "Edit Attribute" : "Add Attribute");
  return (
    <GlassPage label={title} onClose={onClose} narrow>
      <form className="inventory-box dash-panel pw-page pw-form ps-form" onSubmit={submit}>
        <PanelHead title={title} onClose={onClose} tr={tr} />
        <PwField label={tr("Attribute Name")} required><input autoFocus className="inventory-input" maxLength={40} placeholder={tr("e.g. Size")} value={name} onChange={(e) => setName(e.target.value)} /></PwField>
        <div className="pw-field" role="group" aria-label={tr("Attribute Values")}>
          <span>{tr("Attribute Values")}<b> *</b></span>
          {values.length > 0 && (
            <ul className="ps-values">
              {values.map((v, i) => {
                const used = item && v.id ? catalog.valueUse(s, item.id, v.id) : 0;
                return (
                  <li key={v.id ?? `new-${i}`}>
                    <input className="inventory-input" aria-label={`${tr("Value")} ${i + 1}`} maxLength={40} value={v.name} onChange={(e) => put(i, { name: e.target.value })} />
                    {v.id && <button type="button" className="pw-btn ps-act" onClick={() => put(i, { active: isOn(v) ? false : undefined })}>{tr(isOn(v) ? "Deactivate" : "Activate")}</button>}
                    <button type="button" className="pw-btn ps-act" aria-label={`${tr("Remove")} ${v.name}`} title={used ? tr("Used by products. Deactivate it instead") : tr("Remove")} disabled={!!used} onClick={() => setValues(values.filter((_, j) => j !== i))}><X /></button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="ps-add-value">
            <input className="inventory-input" aria-label={tr("New values")} placeholder={tr("Small, Medium, Large")} value={more} onChange={(e) => setMore(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTyped(); } }} />
            <button type="button" className="pw-btn" onClick={addTyped}><Plus /><span>{tr("Add")}</span></button>
          </div>
        </div>
        <FormFoot save={tr("Save Attribute")} onClose={onClose} tr={tr} />
      </form>
    </GlassPage>
  );
}

// ---------- Manage ----------
function ManageShell({ title, add, onAdd, q, setQ, onClose, tr, empty, dialog, children }: { title: string; add: string; onAdd: () => void; q: string; setQ: (v: string) => void; onClose: () => void; tr: Tr; empty: boolean; dialog?: ReactNode; children: ReactNode }) {
  return (
    <GlassPage label={title} onClose={onClose}>
      <div className="inventory-box dash-panel pw-page ps-manage">
        <PanelHead title={title} onClose={onClose} tr={tr} />
        <div className="ps-manage-bar">
          <label className="ps-search"><Search /><input className="inventory-input" aria-label={tr("Search")} placeholder={tr("Search...")} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <button type="button" className="pw-btn is-primary" onClick={onAdd}><Plus /><span>{add}</span></button>
        </div>
        {empty ? <p className="ps-empty">{tr(q.trim() ? "Nothing matches your search" : "Nothing here yet")}</p> : <div className="ps-table-wrap"><table className="ps-table">{children}</table></div>}
        {dialog}
      </div>
    </GlassPage>
  );
}
function RowActions({ on, name, onEdit, onToggle, onDelete, tr, extra }: { on: boolean; name: string; onEdit: () => void; onToggle: () => void; onDelete?: () => void; tr: Tr; extra?: ReactNode }) {
  return (
    <td className="ps-actions">
      <button type="button" className="pw-btn ps-act" aria-label={`${tr("Edit")} ${name}`} title={tr("Edit")} onClick={onEdit}><Pencil /></button>
      {extra}
      <button type="button" className="pw-btn ps-act" aria-label={`${tr(on ? "Deactivate" : "Activate")} ${name}`} onClick={onToggle}>{tr(on ? "Deactivate" : "Activate")}</button>
      {onDelete && <button type="button" className="pw-btn ps-act ps-del" aria-label={`${tr("Delete")} ${name}`} title={tr("Delete")} onClick={onDelete}><Trash2 /></button>}
    </td>
  );
}
function ConfirmDelete({ name, onYes, onClose, tr }: { name: string | null; onYes: () => void; onClose: () => void; tr: Tr }) {
  return (
    <AlertDialog open={name !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{tr("Delete")} {name}?</AlertDialogTitle>
          <AlertDialogDescription>{tr("This can't be undone.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={onYes}>{tr("Yes, delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
const matches = (q: string, ...fields: (string | undefined)[]) => { const t = q.trim().toLowerCase(); return !t || fields.some((f) => f?.toLowerCase().includes(t)); };

function ManageCatalog({ s, kind, onClose, setForm, tr }: { s: erp.ErpState; kind: Kind; onClose: () => void; setForm: (f: Form) => void; tr: Tr }) {
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState<erp.CatalogItem | null>(null);
  const w = WORDS[kind], brand = kind === "brands";
  const rows = s[kind].filter((x) => matches(q, x.name, x.description));
  const remove = (x: erp.CatalogItem) => {
    const used = catalog.catalogUse(s, kind, x.id);
    if (used) { toast.error(`${x.name}: ${tr("used by")} ${used} ${tr("products. Deactivate it instead")}`); return; }
    setAsking(x);
  };
  return (
    <ManageShell title={tr(`Manage ${w.many}`)} add={tr(`Add ${w.one}`)} onAdd={() => setForm({ t: "catalog", kind })} q={q} setQ={setQ} onClose={onClose} tr={tr} empty={!rows.length} dialog={<ConfirmDelete name={asking?.name ?? null} tr={tr} onClose={() => setAsking(null)} onYes={() => { if (asking) run(() => erp.removeNamed(kind, asking.id), tr("Deleted")); setAsking(null); }} />}>
      <thead><tr>{brand && <th>{tr("Logo")}</th>}<th>{tr(`${w.one} Name`)}</th><th>{tr("Description")}</th><th>{tr("Products")}</th><th>{tr("Status")}</th><th>{tr("Actions")}</th></tr></thead>
      <tbody>
        {rows.map((x) => (
          <tr key={x.id}>
            {brand && <td><Avatar item={x} /></td>}
            <td className="ps-strong">{x.name}</td>
            <td className="ps-wrap">{x.description || "—"}</td>
            <td>{catalog.catalogUse(s, kind, x.id)}</td>
            <td><Status on={isOn(x)} tr={tr} /></td>
            <RowActions on={isOn(x)} name={x.name} tr={tr} onEdit={() => setForm({ t: "catalog", kind, item: x })} onToggle={() => run(() => catalog.setCatalogActive(kind, x.id, !isOn(x)), tr(isOn(x) ? "Deactivated" : "Activated"))} onDelete={() => remove(x)} />
          </tr>
        ))}
      </tbody>
    </ManageShell>
  );
}

function ManageUnits({ s, onClose, setForm, tr }: { s: erp.ErpState; onClose: () => void; setForm: (f: Form) => void; tr: Tr }) {
  const [q, setQ] = useState("");
  const rows = catalog.listUnits(s).filter((u) => matches(q, u.name, u.abbr, u.type));
  return (
    <ManageShell title={tr("Manage Units")} add={tr("Add Unit")} onAdd={() => setForm({ t: "unit" })} q={q} setQ={setQ} onClose={onClose} tr={tr} empty={!rows.length}>
      <thead><tr><th>{tr("Unit Name")}</th><th>{tr("Abbreviation")}</th><th>{tr("Type")}</th><th>{tr("Conversion")}</th><th>{tr("Status")}</th><th>{tr("Actions")}</th></tr></thead>
      <tbody>
        {rows.map((u) => (
          <tr key={u.id}>
            <td className="ps-strong">{tr(u.name)}</td>
            <td>{u.abbr}</td>
            <td>{tr(catalog.UNIT_TYPES.find((t) => t.key === u.type)?.label ?? u.type)}</td>
            <td>{catalog.conversionText(s, u) || "—"}</td>
            <td><Status on={isOn(u)} tr={tr} /></td>
            <RowActions on={isOn(u)} name={u.name} tr={tr} onEdit={() => setForm({ t: "unit", item: u })} onToggle={() => run(() => catalog.setUnitActive(u.id, !isOn(u)), tr(isOn(u) ? "Deactivated" : "Activated"))} />
          </tr>
        ))}
      </tbody>
    </ManageShell>
  );
}

function ManageAttributes({ s, onClose, setForm, tr }: { s: erp.ErpState; onClose: () => void; setForm: (f: Form) => void; tr: Tr }) {
  const [q, setQ] = useState("");
  const [asking, setAsking] = useState<erp.Attribute | null>(null);
  const rows = s.attributes.filter((a) => matches(q, a.name, ...a.values.map((v) => v.name)));
  const remove = (a: erp.Attribute) => {
    const used = catalog.attributeUse(s, a.id);
    if (used) { toast.error(`${a.name}: ${tr("used by")} ${used} ${tr("products. Deactivate it instead")}`); return; }
    setAsking(a);
  };
  return (
    <ManageShell title={tr("Manage Attributes")} add={tr("Add Attribute")} onAdd={() => setForm({ t: "attribute" })} q={q} setQ={setQ} onClose={onClose} tr={tr} empty={!rows.length} dialog={<ConfirmDelete name={asking?.name ?? null} tr={tr} onClose={() => setAsking(null)} onYes={() => { if (asking) run(() => catalog.deleteAttribute(asking.id), tr("Deleted")); setAsking(null); }} />}>
      <thead><tr><th>{tr("Attribute Name")}</th><th>{tr("Values")}</th><th>{tr("Products")}</th><th>{tr("Status")}</th><th>{tr("Actions")}</th></tr></thead>
      <tbody>
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="ps-strong">{a.name}</td>
            <td className="ps-wrap">{a.values.map((v) => (isOn(v) ? v.name : `${v.name} (${tr("Inactive")})`)).join(", ")}</td>
            <td>{catalog.attributeUse(s, a.id)}</td>
            <td><Status on={isOn(a)} tr={tr} /></td>
            <RowActions
              on={isOn(a)} name={a.name} tr={tr}
              onEdit={() => setForm({ t: "attribute", item: a })}
              onToggle={() => run(() => catalog.setAttributeActive(a.id, !isOn(a)), tr(isOn(a) ? "Deactivated" : "Activated"))}
              onDelete={() => remove(a)}
              extra={<button type="button" className="pw-btn ps-act" aria-label={`${tr("Manage Values")} ${a.name}`} onClick={() => setForm({ t: "attribute", item: a })}>{tr("Manage Values")}</button>}
            />
          </tr>
        ))}
      </tbody>
    </ManageShell>
  );
}

// ---------- The four cards ----------
function Card({ Icon, title, sub, add, onAdd, children }: { Icon: LucideIcon; title: string; sub: string; add: string; onAdd: () => void; children: ReactNode }) {
  return (
    <section className="dash-panel ps-card" aria-label={title}>
      <div className="ps-card-head">
        <span className="ps-card-icon"><Icon /></span>
        <span className="ps-card-title"><b>{title}</b><small>{sub}</small></span>
        <button type="button" className="pw-btn is-primary" onClick={onAdd}><Plus /><span>{add}</span></button>
      </div>
      {children}
    </section>
  );
}

function CatalogCard({ s, kind, tr, setForm, setManage }: { s: erp.ErpState; kind: Kind; tr: Tr; setForm: (f: Form) => void; setManage: (m: Manage) => void }) {
  const w = WORDS[kind];
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [chosenId, setChosenId] = useState("");
  const chosen = s[kind].find((x) => x.id === chosenId);
  const results = s[kind].filter((x) => matches(q, x.name));
  const term = q.trim();
  const examples = EXAMPLES[kind].filter((x) => !s[kind].some((r) => r.name.toLowerCase() === x.name.toLowerCase())).slice(0, 3);
  return (
    <Card Icon={w.Icon} title={tr(w.many)} sub={tr(w.sub)} add={tr(`Add ${w.one}`)} onAdd={() => setForm({ t: "catalog", kind })}>
      <div className="ps-combo">
        <label className="ps-search">
          <Search />
          <input className="inventory-input" aria-label={tr(`Search ${w.low}`)} placeholder={tr(`Search or choose a ${w.low}...`)} value={q} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
          <button type="button" aria-label={tr(`Show ${w.many.toLowerCase()}`)} aria-expanded={open} onClick={() => setOpen(!open)}><ChevronDown /></button>
        </label>
        {open && (
          <>
            <div className="ps-away" onClick={() => setOpen(false)} />
            <ul className="ps-menu">
              {results.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => { setChosenId(x.id); setQ(""); setOpen(false); }}>
                    <span>{x.name}</span>
                    <small>{isOn(x) ? `${catalog.catalogUse(s, kind, x.id)} ${tr("products")}` : tr("Inactive")}</small>
                  </button>
                </li>
              ))}
              {!results.length && <li className="ps-none">{tr(s[kind].length ? `No matching ${w.low}` : `No ${w.many.toLowerCase()} yet`)}</li>}
              {term && !s[kind].some((x) => x.name.toLowerCase() === term.toLowerCase()) && (
                <li><button type="button" className="ps-menu-add" onClick={() => { setOpen(false); setQ(""); setForm({ t: "catalog", kind, name: term }); }}><Plus /><span>{tr("Add")} "{term}"</span></button></li>
              )}
            </ul>
          </>
        )}
      </div>
      {chosen && (
        <div className="ps-chosen">
          {kind === "brands" && <Avatar item={chosen} />}
          <b>{chosen.name}</b>
          <small>{catalog.catalogUse(s, kind, chosen.id)} {tr("products")}</small>
          <Status on={isOn(chosen)} tr={tr} />
          <button type="button" className="pw-btn ps-act" aria-label={`${tr("Edit")} ${chosen.name}`} onClick={() => setForm({ t: "catalog", kind, item: chosen })}><Pencil /></button>
          <button type="button" className="pw-btn ps-act" aria-label={tr("Clear")} onClick={() => setChosenId("")}><X /></button>
        </div>
      )}
      <div className="ps-card-foot">
        <span className="ps-examples">
          {examples.length > 0 && <small>{tr("Examples:")}</small>}
          {examples.map((x) => {
            const Icon = x.icon ? ICONS[x.icon] : undefined;
            return <button key={x.name} type="button" className="ps-chip" aria-label={`${tr("Add")} ${x.name}`} onClick={() => setForm({ t: "catalog", kind, name: x.name })}>{Icon ? <Icon /> : <i className="ps-chip-letter">{x.name.charAt(0)}</i>}<span>{x.name}</span></button>;
          })}
        </span>
        <button type="button" className="pw-btn ps-manage-btn" onClick={() => setManage(kind)}><List /><span>{tr(`Manage ${w.many}`)}</span></button>
      </div>
    </Card>
  );
}

function UnitsCard({ s, tr, setForm, setManage }: { s: erp.ErpState; tr: Tr; setForm: (f: Form) => void; setManage: (m: Manage) => void }) {
  const units = catalog.listUnits(s).filter(isOn);
  const [picked, setPicked] = useState(units[0]?.id ?? "");
  const unit = units.find((u) => u.id === picked);
  return (
    <Card Icon={Layers} title={tr("Units of Measurement")} sub={tr("Set the units used for buying and selling products.")} add={tr("Add Unit")} onAdd={() => setForm({ t: "unit" })}>
      <div className="ps-units" role="group" aria-label={tr("Units")}>
        {units.map((u) => <button key={u.id} type="button" aria-pressed={u.id === picked} className={cn("ps-chip ps-unit", u.id === picked && "is-on")} onClick={() => setPicked(u.id)}>{tr(u.name)}</button>)}
      </div>
      {unit && (
        <p className="ps-unit-line">
          <b>{tr(unit.name)}</b> · {unit.abbr} · {tr(catalog.UNIT_TYPES.find((t) => t.key === unit.type)?.label ?? unit.type)}
          {" · "}{catalog.conversionText(s, unit) || tr("No conversion")}
        </p>
      )}
      <div className="ps-card-foot">
        <span />
        <button type="button" className="pw-btn ps-manage-btn" onClick={() => setManage("units")}><List /><span>{tr("Manage Units")}</span></button>
      </div>
    </Card>
  );
}

function AttributesCard({ s, tr, setForm, setManage }: { s: erp.ErpState; tr: Tr; setForm: (f: Form) => void; setManage: (m: Manage) => void }) {
  const real = catalog.activeAttributes(s);
  const examples = EXAMPLE_ATTRIBUTES.filter((x) => !s.attributes.some((a) => a.name.toLowerCase() === x.name.toLowerCase()));
  const Chip = ({ text }: { text: string }) => <span className="ps-chip ps-value">{SWATCH.has(text.toLowerCase()) && <i className="ps-swatch" style={{ background: text.toLowerCase() }} />}{text}</span>;
  return (
    <Card Icon={SlidersHorizontal} title={tr("Product Variants & Attributes")} sub={tr("Define product variations such as size, colour and other attributes.")} add={tr("Add Attribute")} onAdd={() => setForm({ t: "attribute" })}>
      <div className="ps-tiles">
        {real.slice(0, 2).map((a, i) => (
          <button key={a.id} type="button" className="ps-tile" aria-label={`${tr("Edit")} ${a.name}`} onClick={() => setForm({ t: "attribute", item: a })}>
            <span className="ps-tile-head">{i % 2 ? <Palette /> : <Tag />}<b>{a.name}</b></span>
            <span className="ps-tile-values">{a.values.filter(isOn).slice(0, 5).map((v) => <Chip key={v.id} text={v.name} />)}</span>
          </button>
        ))}
        {examples.slice(0, Math.max(0, 2 - real.length)).map((x, i) => (
          <button key={x.name} type="button" className="ps-tile is-example" aria-label={`${tr("Add")} ${x.name}`} onClick={() => setForm({ t: "attribute", name: x.name, values: x.values })}>
            <span className="ps-tile-head">{(i + real.length) % 2 ? <Palette /> : <Tag />}<b>{x.name}</b><small>{tr("Example:")} {x.values.join(", ")}</small></span>
            <span className="ps-tile-values">{x.values.map((v) => <Chip key={v} text={v} />)}</span>
          </button>
        ))}
      </div>
      <div className="ps-card-foot">
        <span>{real.length > 2 && <small className="ps-more">+{real.length - 2} {tr("more")}</small>}</span>
        <button type="button" className="pw-btn ps-manage-btn" onClick={() => setManage("attributes")}><List /><span>{tr("Manage Attributes")}</span></button>
      </div>
    </Card>
  );
}

export function ProductSetup({ s, tr, registering, onRegistered }: { s: erp.ErpState; tr: Tr; registering: Registering; onRegistered: (id: string | null) => void }) {
  // Sent here from Add Product to register a new name: the form opens with it filled in.
  const [form, setForm] = useState<Form | null>(registering ? { t: "catalog", kind: registering.kind, name: registering.name } : null);
  const [manage, setManage] = useState<Manage>(null);
  const shared = { s, tr, setForm, setManage };
  const closeForm = () => setForm(null);
  const catalogSaved = (id: string) => {
    const back = registering && form?.t === "catalog" && !form.item && form.kind === registering.kind;
    setForm(null);
    if (back) onRegistered(id);
  };
  return (
    <div className="ps-page">
      <div className="ps-title">
        <h2>{tr("Product Setup & Master Catalog Configuration")}</h2>
        <p>{tr("Define and manage how your products are organized, identified and sold.")}</p>
      </div>
      {registering && (
        <div className="pw-register-note">
          <span>{tr(registering.kind === "categories" ? "Register the new category here. You'll return to Add Product with it selected." : "Register the new brand here. You'll return to Add Product with it selected.")}</span>
          <button type="button" className="pw-btn" onClick={() => onRegistered(null)}>{tr("Back to Add Product")}</button>
        </div>
      )}
      <div className="ps-grid">
        <CatalogCard {...shared} kind="categories" />
        <CatalogCard {...shared} kind="brands" />
        <UnitsCard {...shared} />
        <AttributesCard {...shared} />
      </div>
      {manage === "categories" || manage === "brands" ? <ManageCatalog {...shared} kind={manage} onClose={() => setManage(null)} /> : null}
      {manage === "units" && <ManageUnits {...shared} onClose={() => setManage(null)} />}
      {manage === "attributes" && <ManageAttributes {...shared} onClose={() => setManage(null)} />}
      {form?.t === "catalog" && <CatalogForm key={form.item?.id ?? "new"} form={form} tr={tr} onClose={closeForm} onSaved={catalogSaved} />}
      {form?.t === "unit" && <UnitForm s={s} item={form.item} tr={tr} onClose={closeForm} onSaved={closeForm} />}
      {form?.t === "attribute" && <AttributeForm s={s} form={form} tr={tr} onClose={closeForm} />}
    </div>
  );
}
