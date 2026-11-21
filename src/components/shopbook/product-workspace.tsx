// Inventory › Products & Stock › All Products: the product table, read-only Product Details, one-page Edit Product,
// and the Import and Export workflows. Every change goes through the ERP engine (src/lib/erp.ts).
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { GlassPage } from "@/components/shopbook/glass-page";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, ImagePlus, Pencil, Plus, ScanLine, Share2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ImportCenter } from "@/components/shopbook/import-center";
import { inventoryProducts, InventorySearch } from "@/components/shopbook/inventory-controls";
import { Scanner } from "@/components/shopbook/product-search";
import { run } from "@/components/shopbook/selling";
import { activeAttributes, activeCatalog, attributeText, unitNames } from "@/lib/catalog";
import { translateCurrent } from "@/lib/interface-translations";
import { EXPORT_COLUMNS, exportTable, readProductImage, saveExport, statusLabel, type ExportFormat } from "@/lib/product-export";
import { sharePdfTable } from "@/components/shopbook/print";
import { cn } from "@/lib/utils";
import * as erp from "@/lib/erp";
import { store } from "@/lib/shopbook";

type Tr = (t: string) => string;
type Base = { s: erp.ErpState; tr: Tr; money: (n: number) => string };
type SortKey = "name" | "category" | "brand" | "sku" | "qty" | "buy" | "sell";

export const STATUS_FILTERS = ["all", "OK", "LOW", "OUT", "ATTENTION", "ARCHIVED"];
const NEW_NAMED = "__new__";

/** Runs an engine action, says how it went and reports whether it worked. */
function attempt(action: () => unknown, done: string) {
  try { action(); toast.success(done); return true; }
  catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Failed")); return false; }
}

const named = (list: erp.Named[], id?: string) => list.find((x) => x.id === id)?.name ?? "";
const tone = (p: erp.Product) => (p.archived ? "off" : erp.stockStatus(p) === "OUT" ? "bad" : erp.stockStatus(p) === "LOW" ? "warn" : "ok");
const displayCount = (value: number) =>
  Number.isInteger(value) && value >= 0 && value < 10 ? String(value).padStart(2, "0") : String(value);

export function StatusPill({ p, tr }: { p: erp.Product; tr: Tr }) {
  return <span className={cn("pw-status", `is-${tone(p)}`)}><i />{tr(statusLabel(p))}</span>;
}

/** A category or brand dropdown that can also add a new one on the spot. */
export function NamedSelect({ kind, value, onChange, s, tr }: { kind: "categories" | "brands"; value: string; onChange: (id: string) => void; s: erp.ErpState; tr: Tr }) {
  const word = kind === "categories" ? "Category" : "Brand";
  return (
    <select
      className="inventory-input"
      value={value}
      aria-label={tr(word)}
      onChange={(e) => {
        if (e.target.value !== NEW_NAMED) { onChange(e.target.value); return; }
        const name = window.prompt(tr(`New ${word.toLowerCase()} name`))?.trim();
        if (!name) return;
        const made = run(() => erp.addNamed(kind, name));
        if (made) onChange(made.id);
      }}
    >
      <option value="">{tr(`— No ${word} —`)}</option>
      {activeCatalog(s, kind, value).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      <option value={NEW_NAMED}>{tr(`+ New ${word.toLowerCase()}`)}</option>
    </select>
  );
}

/** Search existing categories or brands. A name that isn't there is offered for registering on the setup page. */
export function NamedSearch({ kind, value, onChange, onRegister, s, tr }: { kind: "categories" | "brands"; value: string; onChange: (id: string) => void; onRegister: (name: string) => void; s: erp.ErpState; tr: Tr }) {
  const word = kind === "categories" ? "category" : "brand";
  const [q, setQ] = useState("");
  const chosen = s[kind].find((x) => x.id === value);
  const term = q.trim().toLowerCase();
  const matches = activeCatalog(s, kind).filter((x) => !term || x.name.toLowerCase().includes(term));
  const exact = s[kind].some((x) => x.name.toLowerCase() === term);
  if (chosen) {
    return (
      <div className="pw-chosen">
        <b>{chosen.name}</b>
        <button type="button" aria-label={tr("Change")} title={tr("Change")} onClick={() => onChange("")}><X /></button>
      </div>
    );
  }
  return (
    <div className="pw-named">
      <input className="inventory-input" aria-label={tr(`Search ${word}`)} placeholder={tr(`Search ${word}...`)} value={q} onChange={(e) => setQ(e.target.value)} />
      {matches.length > 0 && (
        <ul>
          {matches.slice(0, 8).map((x) => <li key={x.id}><button type="button" onClick={() => onChange(x.id)}>{x.name}</button></li>)}
        </ul>
      )}
      {term && !exact && !matches.length && <p>"{q.trim()}" {tr(`is not registered yet. Register this ${word} to use it.`)}</p>}
      {(!term || !exact) && (
        <button type="button" className="pw-btn" onClick={() => onRegister(q.trim())}>
          <Plus /><span>{q.trim() ? `${tr(`Register ${word}`)} "${q.trim()}"` : tr(`Register a new ${word}`)}</span>
        </button>
      )}
    </div>
  );
}

/** Attribute values a product comes in (Size: S, M). They describe it; stock stays on the product total. */
export function AttributePicker({ s, value, onChange, tr }: { s: erp.ErpState; value: Record<string, string[]>; onChange: (v: Record<string, string[]>) => void; tr: Tr }) {
  const toggle = (id: string, valueId: string) => {
    const now = value[id] ?? [], next = now.includes(valueId) ? now.filter((x) => x !== valueId) : [...now, valueId], rest = { ...value };
    if (next.length) rest[id] = next; else delete rest[id];
    onChange(rest);
  };
  const shown = s.attributes.filter((a) => a.active !== false || value[a.id]?.length);
  return (
    <div className="ps-pick" role="group" aria-label={tr("Attributes")}>
      {shown.map((a) => (
        <div key={a.id} role="group" aria-label={a.name}>
          <span>{a.name}</span>
          <span className="ps-units">
            {a.values.filter((v) => v.active !== false || value[a.id]?.includes(v.id)).map((v) => <button key={v.id} type="button" aria-pressed={!!value[a.id]?.includes(v.id)} className={cn("ps-chip ps-unit", value[a.id]?.includes(v.id) && "is-on")} onClick={() => toggle(a.id, v.id)}>{v.name}</button>)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Barcode box with the scanner button inside it. */
export function BarcodeInput({ value, onChange, tr }: { value: string; onChange: (v: string) => void; tr: Tr }) {
  const [scan, setScan] = useState(false);
  return (
    <span className="pw-barcode">
      <input className="inventory-input" aria-label={tr("Barcode")} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" aria-label={tr("Scan barcode")} title={tr("Scan barcode")} onClick={() => setScan(true)}><ScanLine /></button>
      {scan && <Scanner tr={tr} onClose={() => setScan(false)} onCode={(code) => { setScan(false); onChange(code); }} />}
    </span>
  );
}

export function PwField({ label, required, children, wide }: { label: string; required?: boolean; children: ReactNode; wide?: boolean }) {
  return <label className={cn("pw-field", wide && "pw-wide")}><span>{label}{required && <b> *</b>}</span>{children}</label>;
}

/** Optional picture: nothing shows until a real one is chosen. */
export function ImageChooser({ value, onChange, tr }: { value: string; onChange: (v: string) => void; tr: Tr }) {
  const ref = useRef<HTMLInputElement>(null);
  const choose = async (file?: File) => {
    if (!file) return;
    try { onChange(await readProductImage(file)); } catch (e) { toast.error(tr(e instanceof Error ? e.message : "That image could not be read")); }
  };
  return (
    <span className="pw-image-choose">
      {value && <img src={value} alt="" />}
      <button type="button" className="pw-btn" onClick={() => ref.current?.click()}><ImagePlus /><span>{tr(value ? "Change image" : "Add image")}</span></button>
      {value && <button type="button" className="pw-btn" onClick={() => onChange("")}><X /><span>{tr("Remove")}</span></button>}
      <input ref={ref} hidden type="file" accept="image/*" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
    </span>
  );
}

function PageHead({ title, onBack, p, tr }: { title: ReactNode; onBack: () => void; p?: erp.Product; tr: Tr }) {
  return (
    <div className="pw-page-head">
      <button type="button" className="pw-btn" onClick={onBack}><ArrowLeft /><span>{tr("Back")}</span></button>
      <h2>{title}</h2>
      {p ? <StatusPill p={p} tr={tr} /> : <span />}
    </div>
  );
}

// ---------- Product Details (read-only) ----------
function ProductDetails({ p, s, tr, money, onBack }: Base & { p: erp.Product; onBack: () => void }) {
  const Card = ({ label, value, money: isMoney, wrap, className }: { label: string; value: ReactNode; money?: boolean; wrap?: boolean; className?: string }) => <div className={cn("pw-card", wrap && "pw-card-wrap", className)}><span>{label}</span><b title={typeof value === "string" ? value : undefined} {...(isMoney ? { "data-fit-text": "money" } : {})}>{value || "—"}</b></div>;
  return (
    <div className="inventory-box dash-panel pw-page">
      <PageHead title={<>{tr("Product Details")} <small>({tr("View Only")})</small></>} onBack={onBack} p={p} tr={tr} />
      {p.image && <img className="pw-photo" src={p.image} alt={p.name} />}
      <div className="pw-row5">
        <Card label={tr("Product Name")} value={p.name} className="pw-product-name" />
        <Card label={tr("Category")} value={named(s.categories, p.categoryId)} />
        <Card label={tr("Brand")} value={named(s.brands, p.brandId)} />
        <Card label={tr("SKU")} value={p.sku} />
        <Card label={tr("Barcode")} value={p.barcode} />
      </div>
      <div className="pw-row5 pw-row5b">
        <Card label={tr("Unit")} value={p.unit || "pcs"} />
        <Card label={tr("Current Stock")} value={String(p.qty)} money />
        <Card label={tr("Buying Price")} value={money(p.buy)} money />
        <Card label={tr("Selling Price")} value={money(p.sell)} money />
        <Card label={tr("Description")} value={p.description} wrap />
      </div>
      {!!p.variants?.length && (
        <div className="pw-card pw-desc">
          <span>{tr("Variants / Sizes")} ({p.variants.length}) · {tr("opening breakdown")}</span>
          <p>{p.variants.map((v) => `${v.name}: ${v.qty}`).join(" · ")}</p>
        </div>
      )}
      {attributeText(s, p) && <div className="pw-card pw-desc"><span>{tr("Attributes")}</span><p>{attributeText(s, p)}</p></div>}
      <div className="pw-foot"><span /><button type="button" className="pw-btn" onClick={onBack}>{tr("Close")}</button></div>
    </div>
  );
}


// ---------- Edit Product (one page, three rows) ----------
function ProductEdit({ p, s, tr, money, onBack }: Base & { p: erp.Product; onBack: () => void }) {
  const start = useMemo(() => ({
    name: p.name, categoryId: p.categoryId ?? "", brandId: p.brandId ?? "", sku: p.sku ?? "", barcode: p.barcode ?? "",
    unit: p.unit || "Piece", pieces: String(p.pieces ?? 1), buy: String(p.buy), sell: String(p.sell),
    minStock: p.minStock === undefined ? "" : String(p.minStock), reorderLevel: p.reorderLevel === undefined ? "" : String(p.reorderLevel),
    description: p.description ?? "", image: p.image ?? "", attributes: p.attributes ?? {},
  }), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps -- the form starts once per product
  const [f, setF] = useState(start);
  const [ask, setAsk] = useState(false);
  const admin = erp.isAdmin();
  // With all shops showing, the price above is the main shop's and each other shop may have its own. Inside one shop, the price above is that shop's.
  const real = erp.load(), otherShops = !erp.selectedShop(real) && !store.get()?.staff ? real.locations.filter((l) => l.id !== erp.MAIN_LOCATION && l.type === "shop" && l.active !== false) : [];
  const realPrices = real.products.find((x) => x.id === p.id)?.prices;
  const [shopPrices, setShopPrices] = useState<Record<string, string>>(() => Object.fromEntries(otherShops.map((l) => [l.id, realPrices?.[l.id] === undefined ? "" : String(realPrices[l.id])])));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const dirty = JSON.stringify(f) !== JSON.stringify(start) || otherShops.some((l) => (shopPrices[l.id] ?? "") !== (realPrices?.[l.id] === undefined ? "" : String(realPrices[l.id])));
  const stocked = p.qty > 0, history = erp.productHistory(s, p.id);
  const optional = (v: string) => (v.trim() === "" ? undefined : Number(v));

  const save = () => {
    const pieces = Number(f.pieces);
    if (!f.name.trim()) { toast.error(tr("Enter a product name")); return; }
    if (!Number.isInteger(pieces) || pieces < 1) { toast.error(tr("Pieces must be a whole number of 1 or more")); return; }
    if (!(Number(f.buy) >= 0) || !(Number(f.sell) >= 0) || f.buy.trim() === "" || f.sell.trim() === "") { toast.error(tr("Prices can't be negative")); return; }
    if (otherShops.some((l) => { const v = shopPrices[l.id]?.trim() ?? ""; return v !== "" && !(Number(v) >= 0); })) { toast.error(tr("Prices can't be negative")); return; }
    const ok = attempt(() => erp.runErpTransaction(() => { otherShops.forEach((l) => { const v = shopPrices[l.id]?.trim() ?? ""; erp.setShopPrice(p.id, l.id, v === "" ? null : Number(v)); }); erp.updateProduct(p.id, {
      name: f.name, categoryId: f.categoryId || undefined, brandId: f.brandId || undefined, sku: f.sku, barcode: f.barcode,
      unit: f.unit, pieces, buy: Number(f.buy), sell: Number(f.sell), minStock: optional(f.minStock), reorderLevel: optional(f.reorderLevel),
      description: f.description.trim() || undefined, image: f.image || undefined,
      attributes: Object.keys(f.attributes).length ? f.attributes : undefined,
    }); }), tr("Product updated"));
    if (ok) onBack();
  };
  const cancel = () => { if (!dirty || window.confirm(tr("Discard your changes?"))) onBack(); };
  const remove = () => {
    setAsk(false);
    if (attempt(() => erp.removeProduct(p.id), tr(stocked || history ? "Product removed. Its history is kept" : "Product deleted"))) onBack();
  };

  return (
    <div className="inventory-box dash-panel pw-page pw-form">
      <PageHead title={tr("Edit Product")} onBack={cancel} p={p} tr={tr} />
      <div className="pw-row5">
        <PwField label={tr("Product Name")} required><input className="inventory-input" value={f.name} onChange={set("name")} /></PwField>
        <PwField label={tr("Category")}><NamedSelect kind="categories" value={f.categoryId} onChange={(categoryId) => setF({ ...f, categoryId })} s={s} tr={tr} /></PwField>
        <PwField label={tr("Brand")}><NamedSelect kind="brands" value={f.brandId} onChange={(brandId) => setF({ ...f, brandId })} s={s} tr={tr} /></PwField>
        <PwField label={tr("SKU")}><input className="inventory-input" value={f.sku} onChange={set("sku")} /></PwField>
        <PwField label={tr("Barcode")}><BarcodeInput value={f.barcode} onChange={(barcode) => setF({ ...f, barcode })} tr={tr} /></PwField>
      </div>
      <div className="pw-row6">
        <PwField label={tr("Unit")} required>
          <select className="inventory-input" value={f.unit} onChange={set("unit")}>
            {unitNames(s, f.unit).map((u) => <option key={u} value={u}>{tr(u)}</option>)}
          </select>
        </PwField>
        <PwField label={tr("Pieces")} required><input type="number" min="1" step="1" className="inventory-input" value={f.pieces} onChange={set("pieces")} /></PwField>
        <PwField label={tr("Buying Price")} required><input type="number" min="0" step="any" className="inventory-input" value={f.buy} onChange={set("buy")} /></PwField>
        <PwField label={tr("Selling Price")} required><input type="number" min="0" step="any" className="inventory-input" value={f.sell} onChange={set("sell")} /></PwField>
        <PwField label={tr("Minimum Stock")}><input type="number" min="0" step="any" className="inventory-input" placeholder={String(erp.DEFAULT_MIN_STOCK)} value={f.minStock} onChange={set("minStock")} /></PwField>
        <PwField label={tr("Reorder Level")}><input type="number" min="0" step="any" className="inventory-input" value={f.reorderLevel} onChange={set("reorderLevel")} /></PwField>
      </div>
      {otherShops.length > 0 && <div className="pw-row6">
        {otherShops.map((l) => <PwField key={l.id} label={`${tr("Selling Price")} · ${l.name}`}><input type="number" min="0" step="any" className="inventory-input" placeholder={f.sell} value={shopPrices[l.id] ?? ""} onChange={(e) => setShopPrices({ ...shopPrices, [l.id]: e.target.value })} /></PwField>)}
      </div>}
      <PwField label={tr("Description (optional)")} wide><textarea className="inventory-input" rows={3} value={f.description} onChange={set("description")} /></PwField>
      {(activeAttributes(s).length > 0 || Object.keys(f.attributes).length > 0) && <AttributePicker s={s} value={f.attributes} onChange={(attributes) => setF({ ...f, attributes })} tr={tr} />}
      <ImageChooser value={f.image} onChange={(image) => setF({ ...f, image })} tr={tr} />
      <p className="pw-note">{tr("Quantity changes only through Stock In, Stock Out, Adjustments, sales and purchases.")}</p>
      <div className="pw-foot">
        {p.archived
          ? <button type="button" className="pw-btn" onClick={() => { if (attempt(() => erp.restoreProduct(p.id), tr("Product restored"))) onBack(); }}>{tr("Restore Product")}</button>
          : admin ? <button type="button" className="pw-btn is-danger" onClick={() => setAsk(true)}><Trash2 /><span>{tr("Delete Product")}</span></button> : <span className="pw-note">{tr("Only an admin can delete products")}</span>}
        <span className="pw-foot-right">
          <button type="button" className="pw-btn" onClick={cancel}>{tr("Cancel")}</button>
          <button type="button" className="pw-btn is-primary" onClick={save}>{tr("Save Changes")}</button>
        </span>
      </div>
      <AlertDialog open={ask} onOpenChange={setAsk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("You are about to delete a product")}</AlertDialogTitle>
            <AlertDialogDescription>
              {stocked
                ? `${p.name}: ${tr("it still has")} ${p.qty} ${p.unit || "pcs"} ${tr("in stock, worth")} ${money(p.qty * p.buy)}. ${tr("Deleting writes this stock off as a Stock Out, and your stock value goes down by that amount. Its history is kept and it can be restored from the Archived filter, without its stock.")}`
                : history
                  ? `${p.name}: ${tr("it appears in past transactions, so its history is kept. It leaves your product list and selling and buying screens, and can be restored from the Archived filter.")}`
                  : `${p.name}: ${tr("it has no transaction history, so it will be permanently deleted.")}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={remove}>{tr("Delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Export ----------
function ExportDialog({ s, tr, shop, all, filtered, selected, onClose }: { s: erp.ErpState; tr: Tr; shop: string; all: erp.Product[]; filtered: erp.Product[]; selected: erp.Product[]; onClose: () => void }) {
  const [scope, setScope] = useState<"all" | "selected" | "filtered">(selected.length ? "selected" : filtered.length !== all.length ? "filtered" : "all");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [keys, setKeys] = useState(EXPORT_COLUMNS.map((c) => c.key));
  const [xlsx, setXlsx] = useState<typeof import("xlsx")>();
  useEffect(() => { void import("xlsx").then(setXlsx); }, []);
  const products = scope === "all" ? all : scope === "selected" ? selected : filtered;
  const go = async () => {
    try {
      if (format === "pdf") {
        const { head, rows } = exportTable(s, products, keys);
        const result = await sharePdfTable(`${shop || "ZAKRIO SYSTEMS"} - Products`, `${products.length} products - ${new Date().toISOString().slice(0, 10)}`, head, rows.map((row) => row.map(String)));
        if (result !== "cancelled") onClose();
        return;
      }
      saveExport(format, s, products, keys, shop, xlsx);
      toast.success(`${tr("Exported")} ${products.length}`);
      onClose();
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Export failed")); }
  };
  const Choice = ({ on, set, label }: { on: boolean; set: () => void; label: string }) => <button type="button" role="radio" aria-checked={on} className={cn("pw-btn", on && "is-primary")} onClick={set}>{label}</button>;
  return (
    <div className="pw-modal" role="dialog" aria-modal="true" aria-label={tr("Share Products")} onClick={onClose}>
      <div className="pw-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="pw-page-head"><h2>{tr("Share Products")}</h2><button type="button" className="pw-btn" aria-label={tr("Close")} onClick={onClose}><X /></button></div>
        <p className="pw-label">{tr("Products")}</p>
        <div className="pw-choices" role="radiogroup" aria-label={tr("Products")}>
          <Choice on={scope === "all"} set={() => setScope("all")} label={`${tr("All Products")} (${all.length})`} />
          <Choice on={scope === "selected"} set={() => setScope("selected")} label={`${tr("Selected Products")} (${selected.length})`} />
          <Choice on={scope === "filtered"} set={() => setScope("filtered")} label={`${tr("Filtered Products")} (${filtered.length})`} />
        </div>
        <p className="pw-label">{tr("Format")}</p>
        <div className="pw-choices" role="radiogroup" aria-label={tr("Format")}>
          <Choice on={format === "xlsx"} set={() => setFormat("xlsx")} label="Excel (.xlsx)" />
          <Choice on={format === "csv"} set={() => setFormat("csv")} label="CSV" />
          <Choice on={format === "pdf"} set={() => setFormat("pdf")} label="PDF" />
        </div>
        <p className="pw-label">{tr("Fields")}</p>
        <div className="pw-fields">
          {EXPORT_COLUMNS.map((c) => (
            <label key={c.key}><input type="checkbox" checked={keys.includes(c.key)} onChange={(e) => setKeys(e.target.checked ? EXPORT_COLUMNS.map((x) => x.key).filter((k) => k === c.key || keys.includes(k)) : keys.filter((k) => k !== c.key))} /><span>{tr(c.label)}</span></label>
          ))}
        </div>
        <div className="pw-foot">
          <span />
          <span className="pw-foot-right">
            <button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button>
            <button type="button" className="pw-btn is-primary" disabled={!products.length || !keys.length || (format === "xlsx" && !xlsx)} onClick={go}><Share2 /><span>{tr("Share")}</span></button>
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------- The workspace ----------
export function ProductWorkspace({ s, tr, money, shop, initialStatus = "all", onAdd, onUnknown }: Base & { shop: string; initialStatus?: string; onAdd: () => void; onUnknown: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [status] = useState(STATUS_FILTERS.includes(initialStatus) ? initialStatus : "all");
  const [sort, setSort] = useState<{ key: SortKey; up: boolean } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<{ k: "details" | "edit"; id: string } | { k: "import" } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);

  const active = useMemo(() => s.products.filter((p) => !p.archived), [s.products]);
  const filtered = useMemo(() => {
    const rows = inventoryProducts(s, q, status === "ARCHIVED").filter((p) => {
      if (status === "ARCHIVED") return p.archived;
      const st = erp.stockStatus(p);
      return status === "all" || st === status || (status === "ATTENTION" && st !== "OK");
    });
    if (!sort) return rows;
    const value = (p: erp.Product): string | number => ({ name: p.name, category: named(s.categories, p.categoryId), brand: named(s.brands, p.brandId), sku: p.sku ?? "", qty: p.qty, buy: p.buy, sell: p.sell })[sort.key];
    return [...rows].sort((a, b) => {
      const x = value(a), y = value(b);
      const order = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.up ? order : -order;
    });
  }, [s, q, status, sort]);

  // Keep every matching product in this one scrollable list; no pagination hides the rest.
  const rows = filtered;

  const target = view && "id" in view ? s.products.find((p) => p.id === view.id) : undefined;
  const close = () => setView(null);
  const popup = view?.k === "import" ? (
    <GlassPage label={tr("Import Products")} onClose={close}>
      <div className="inventory-box dash-panel pw-page">
        <PageHead title={tr("Import Products")} onBack={close} tr={tr} />
        <ImportCenter tr={tr} only="Products" />
      </div>
    </GlassPage>
  ) : view && target ? (
    <GlassPage label={tr(view.k === "details" ? "Product Details" : "Edit Product")} onClose={close}>
      {view.k === "details" ? <ProductDetails p={target} s={s} tr={tr} money={money} onBack={close} /> : <ProductEdit key={target.id} p={target} s={s} tr={tr} money={money} onBack={close} />}
    </GlassPage>
  ) : null;

  const SortControl = ({ k, children, className }: { k: SortKey; children: ReactNode; className?: string }) => {
    const on = sort?.key === k;
    const Icon = !on ? ArrowUpDown : sort?.up ? ArrowUp : ArrowDown;
    return <button type="button" className={cn("pw-sort-control", className)} aria-pressed={on} onClick={() => setSort(on && !sort?.up ? null : { key: k, up: !on })}>{children}<Icon /></button>;
  };
  const Head = ({ k, children, end }: { k?: SortKey; children: ReactNode; end?: boolean }) => {
    if (!k) return <th className={cn(end && "is-end")}>{children}</th>;
    const on = sort?.key === k;
    return (
      <th className={cn(end && "is-end")} aria-sort={!on ? "none" : sort?.up ? "ascending" : "descending"}>
        <SortControl k={k}>{children}</SortControl>
      </th>
    );
  };
  const open = (id: string) => setView({ k: "details", id });
  const allOnPage = rows.length > 0 && rows.every((p) => picked.has(p.id));

  return (
    <div className="pw-list">
      <div className="pw-toolbar">
        <div className="pw-search">
          <InventorySearch
            q={q}
            setQ={setQ}
            tr={tr}
            placeholder="Search product by name, SKU or barcode..."
          />
        </div>
        <button type="button" className="pw-btn pw-tool pw-scan-add" onClick={() => setScanningBarcode(true)} aria-label={tr("Scan barcode")} title={tr("Scan barcode")}><ScanLine /><span>{tr("Scan barcode")}</span></button>
        <button type="button" className="pw-btn is-primary pw-add" onClick={onAdd} aria-label={tr("Add Product")}><Plus /><span>{tr("Add Product")}</span></button>
        <button type="button" className="pw-btn pw-tool pw-import" onClick={() => setView({ k: "import" })} aria-label={tr("Import")} title={tr("Import")}><Upload /><span>{tr("Import")}</span></button>
        <button type="button" className="pw-btn pw-tool pw-export" onClick={() => setExporting(true)} aria-label={tr("Share")} title={tr("Share")}><Share2 /><span>{tr("Share")}</span></button>
      </div>
      {scanningBarcode && <Scanner tr={tr} onClose={() => setScanningBarcode(false)} onCode={(code) => { setScanningBarcode(false); if (erp.findByCode(s, code)) setQ(code); else onUnknown(code); }} />}

      <div className="inventory-box dash-panel pw-table-card">
        <div className="pw-list-controls">
          <span className="pw-count" aria-live="polite">{filtered.length ? `${tr("Showing")} 1–${filtered.length} ${tr("of")} ${filtered.length} ${tr("products")}` : `0 ${tr("products")}`}</span>
        </div>
        {rows.length ? (
          <div className="pw-table-scroll">
          <table className="pw-table">
            <thead>
              <tr>
                <th className="pw-c-check"><input type="checkbox" aria-label={tr("Select all products shown")} checked={allOnPage} onChange={(e) => setPicked((prev) => { const next = new Set(prev); rows.forEach((p) => (e.target.checked ? next.add(p.id) : next.delete(p.id))); return next; })} /></th>
                <th className="pw-c-name" aria-sort={sort?.key === "name" ? sort.up ? "ascending" : "descending" : "none"}>
                  <SortControl k="name" className="pw-sort-name">{tr("Product Name")}</SortControl>
                </th>
                <Head k="category">{tr("Category")}</Head>
                <Head k="brand">{tr("Brand")}</Head>
                <Head k="sku">{tr("SKU")}</Head>
                <Head>{tr("Barcode")}</Head>
                <Head>{tr("Unit")}</Head>
                <Head>{tr("Pieces")}</Head>
                <Head k="qty">{tr("Stock")}</Head>
                <Head k="buy" end>{tr("Buying Price")}</Head>
                <Head k="sell" end>{tr("Selling Price")}</Head>
                <Head>{tr("Action")}</Head>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const category = named(s.categories, p.categoryId), brand = named(s.brands, p.brandId);
                return (
                  <tr key={p.id} onClick={(e) => { if (!(e.target as HTMLElement).closest(".pw-c-check, .pw-c-action")) open(p.id); }}>
                    <td className="pw-c-check"><input type="checkbox" aria-label={`${tr("Select")} ${p.name}`} checked={picked.has(p.id)} onChange={(e) => setPicked((prev) => { const next = new Set(prev); if (e.target.checked) next.add(p.id); else next.delete(p.id); return next; })} /></td>
                    <td className="pw-c-name">
                      <button type="button" className="pw-name" aria-label={p.name} title={p.name}>
                        {p.image && <img src={p.image} alt="" />}
                        <span className="pw-name-content">
                          <span className="pw-name-text">{p.name}</span>
                          {p.barcode && <small className="pw-name-barcode">{tr("Barcode")}: {p.barcode}</small>}
                        </span>
                      </button>
                    </td>
                    <td className="pw-c-category" title={category || "—"}><span className="pw-category-pill">{category || "—"}</span></td>
                    <td className="pw-c-wide" title={brand}>{brand || "—"}</td>
                    <td className="pw-c-wide"><span className="pw-code" title={p.sku}>{p.sku || "—"}</span></td>
                    <td className="pw-c-wide pw-c-barcode" title={p.barcode}>{p.barcode || "—"}</td>
                    <td className="pw-c-wide">{p.unit || "pcs"}</td>
                    <td className="pw-c-wide">{displayCount(p.pieces ?? 1)}</td>
                    <td className="pw-c-stock"><span className={cn("pw-stock", `is-${tone(p)}`)}>{displayCount(p.qty)}<span className="pw-unit"> {p.unit || "pcs"}</span></span></td>
                    <td className="pw-c-money is-end" data-label={tr("Buy")}>{money(p.buy)}</td>
                    <td className="pw-c-money is-end" data-label={tr("Sell")}>{money(p.sell)}</td>
                    <td className="pw-c-action"><button type="button" className="pw-pen" aria-label={`${tr("Edit")} ${p.name}`} title={tr("Edit")} onClick={() => setView({ k: "edit", id: p.id })}><Pencil /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        ) : (
          <div className="pw-empty">
            <p>{q.trim() ? `${tr("No product matches")} "${q.trim()}"` : tr(active.length ? "No products found" : "No products registered yet")}</p>
            <button type="button" className="pw-btn is-primary" onClick={() => (q.trim() ? onUnknown(q.trim()) : onAdd())}><Plus /><span>{tr("Add New Product")}</span></button>
          </div>
        )}

      </div>

      {popup}
      {exporting && <ExportDialog s={s} tr={tr} shop={shop} all={active} filtered={filtered} selected={s.products.filter((p) => picked.has(p.id))} onClose={() => setExporting(false)} />}
    </div>
  );
}
