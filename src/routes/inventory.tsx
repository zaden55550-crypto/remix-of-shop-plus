import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ScanLine, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { store, canOpen, type Account } from "@/lib/shopbook";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import * as erp from "@/lib/erp";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — SHOPBOOK ERP" },
      { name: "description", content: "Products, stock levels, stock in/out, adjustments, transfers and stock reports." },
      { property: "og:title", content: "Inventory — SHOPBOOK ERP" },
      { property: "og:description", content: "The single source of truth for products and stock in SHOPBOOK." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Inventory,
});

const MENUS = {
  overview: [],
  products: ["All Products", "Add Product", "Categories", "Brands"],
  stock: ["Stock Levels", "Stock In", "Stock Out", "Adjustments", "History"],
  transfers: ["New Transfer", "Pending", "Received", "History"],
  reports: ["Stock Report", "Movement", "Valuation", "Performance"],
} as const;
type Menu = keyof typeof MENUS;

function useErp() {
  const [s, set] = useState<erp.ErpState>(() => erp.load());
  useEffect(() => { set(erp.load()); return erp.subscribe(() => set(erp.load())); }, []);
  return s;
}
const run = (fn: () => unknown, ok: string) => {
  try { fn(); toast.success(ok); return true; } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); return false; }
};
const dt = (n: number) => new Date(n).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const inputCls = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary";

function Inventory() {
  const nav = useNavigate();
  const { tr, dir } = useLanguage();
  const [acct, setAcct] = useState<Account | null>(null);
  const [menu, setMenu] = useState<Menu>("overview");
  const [sub, setSub] = useState<string>("");
  const [prefillBarcode, setPrefill] = useState("");
  const s = useErp();

  useEffect(() => {
    const a = store.get();
    if (!a || !store.signedIn()) { nav({ to: "/", replace: true }); return; }
    if (!canOpen(a, "basic")) { nav({ to: "/apps", replace: true }); return; }
    setAcct(a);
  }, [nav]);
  if (!acct) return <main className="app-screen" />;

  const cur = acct.currency || "KSh";
  const money = (n: number) => `${cur} ${Math.round(n).toLocaleString("en-KE")}`;
  const go = (m: Menu, sm?: string) => { setMenu(m); setSub(sm ?? MENUS[m][0] ?? ""); };
  const ctx = { s, money, tr, go, cur, shop: acct.shopName };

  return (
    <main dir={dir} className="app-screen mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-10 text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-3">
          <ShopButton variant="bare" className="h-auto w-auto p-1" aria-label={tr("Back")} onClick={() => nav({ to: "/apps" })}><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></ShopButton>
          <h1 className="text-lg font-bold tracking-wide">{tr("Inventory").toUpperCase()}</h1>
        </div>
        <Tabs items={Object.keys(MENUS)} value={menu} onChange={(m) => go(m as Menu)} label={(k) => tr(k.charAt(0).toUpperCase() + k.slice(1)).toUpperCase()} />
        {MENUS[menu].length > 0 && <Tabs small items={[...MENUS[menu]]} value={sub} onChange={setSub} label={(k) => tr(k)} />}
      </header>

      <section className="flex-1 px-4 pt-4">
        {menu === "overview" && <Overview {...ctx} />}
        {menu === "products" && sub === "All Products" && <ProductList {...ctx} onUnknown={(code) => { setPrefill(code); setSub("Add Product"); }} />}
        {menu === "products" && sub === "Add Product" && <AddProduct {...ctx} barcode={prefillBarcode} done={() => { setPrefill(""); setSub("All Products"); }} />}
        {menu === "products" && (sub === "Categories" || sub === "Brands") && <NamedList {...ctx} kind={sub === "Brands" ? "brands" : "categories"} />}
        {menu === "stock" && sub === "Stock Levels" && <StockLevels {...ctx} />}
        {menu === "stock" && (sub === "Stock In" || sub === "Stock Out" || sub === "Adjustments") && <StockForm {...ctx} mode={sub} />}
        {menu === "stock" && sub === "History" && <History {...ctx} />}
        {menu === "transfers" && <Transfers {...ctx} view={sub} />}
        {menu === "reports" && <Reports {...ctx} view={sub} />}
      </section>
    </main>
  );
}

type Ctx = { s: erp.ErpState; money: (n: number) => string; tr: (t: string) => string; go: (m: Menu, sm?: string) => void; cur: string; shop: string };

function Tabs({ items, value, onChange, label, small }: { items: string[]; value: string; onChange: (v: string) => void; label: (k: string) => string; small?: boolean }) {
  return (
    <div className={cn("flex gap-1 overflow-x-auto px-3 [scrollbar-width:none]", small ? "pb-2" : "pb-2")}>
      {items.map((k) => (
        <button key={k} onClick={() => onChange(k)}
          className={cn("shrink-0 whitespace-nowrap rounded-full px-3 font-semibold transition", small ? "py-1 text-xs" : "py-1.5 text-[13px]",
            value === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{label(k)}</button>
      ))}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" | "bad" | undefined }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-lg font-bold", tone === "warn" && "text-amber-500", tone === "bad" && "text-destructive")}>{value}</p>
    </div>
  );
}

function Status({ p }: { p: erp.Product }) {
  const st = erp.stockStatus(p);
  return <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold", st === "OK" && "bg-primary/15 text-primary", st === "LOW" && "bg-amber-500/15 text-amber-500", st === "OUT" && "bg-destructive/15 text-destructive")}>{st}</span>;
}

function Title({ children }: { children: ReactNode }) { return <h2 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wider text-muted-foreground first:mt-0">{children}</h2>; }
function Empty({ children }: { children: ReactNode }) { return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>; }

function MoveRow({ m, s, tr }: { m: erp.Movement; s: erp.ErpState; tr: Ctx["tr"] }) {
  const [open, setOpen] = useState(false);
  const p = s.products.find((x) => x.id === m.productId);
  return (
    <button onClick={() => setOpen(!open)} className="block w-full border-b border-border py-2.5 text-start">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground">{dt(m.at)} • {tr(m.type)}</p>
          <p className="text-sm font-medium">{p?.name ?? tr("Deleted product")}</p>
        </div>
        <span className={cn("text-sm font-bold", m.qty > 0 ? "text-primary" : "text-destructive")}>{m.qty > 0 ? "+" : ""}{m.qty}</span>
      </div>
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-2 text-[11px]">
          <span className="text-muted-foreground">{tr("Source")}</span><span>{m.source ?? "—"}</span>
          <span className="text-muted-foreground">{tr("Previous")}</span><span>{m.prev}</span>
          <span className="text-muted-foreground">{tr("New")}</span><span>{m.next}</span>
          <span className="text-muted-foreground">{tr("Reason")}</span><span>{m.reason ?? "—"}</span>
          <span className="text-muted-foreground">{tr("Performed by")}</span><span>{m.user}</span>
        </div>
      )}
    </button>
  );
}

function Overview({ s, money, tr, go }: Ctx) {
  const low = s.products.filter((p) => erp.stockStatus(p) === "LOW");
  const out = s.products.filter((p) => erp.stockStatus(p) === "OUT");
  const value = s.products.reduce((a, p) => a + p.qty * p.buy, 0);
  const ins = s.movements.filter((m) => m.qty > 0).slice(0, 4);
  const outs = s.movements.filter((m) => m.qty < 0).slice(0, 4);
  const adj = s.movements.filter((m) => m.type === "ADJUSTMENT").slice(0, 3);
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <Kpi label={tr("Products")} value={s.products.length} />
        <Kpi label={tr("Stock value")} value={money(value)} />
        <Kpi label={tr("Low stock")} value={low.length} tone={low.length ? "warn" : undefined} />
        <Kpi label={tr("Out of stock")} value={out.length} tone={out.length ? "bad" : undefined} />
      </div>
      {s.products.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">{tr("No products yet. Add your first product to start tracking stock.")}</p>
          <ShopButton className="mt-3" onClick={() => go("products", "Add Product")}>{tr("Add Product")}</ShopButton>
        </div>
      )}
      {ins.length > 0 && <><Title>{tr("Recent Stock In")}</Title>{ins.map((m) => <MoveRow key={m.id} m={m} s={s} tr={tr} />)}</>}
      {outs.length > 0 && <><Title>{tr("Recent Stock Out")}</Title>{outs.map((m) => <MoveRow key={m.id} m={m} s={s} tr={tr} />)}</>}
      {low.length + out.length > 0 && <><Title>{tr("Low / Out of Stock")}</Title>{[...out, ...low].map((p) => (
        <div key={p.id} className="flex items-center justify-between border-b border-border py-2.5 text-sm"><span>{p.name}</span><span className="flex items-center gap-2">{p.qty} <Status p={p} /></span></div>
      ))}</>}
      {adj.length > 0 && <><Title>{tr("Recent Adjustments")}</Title>{adj.map((m) => <MoveRow key={m.id} m={m} s={s} tr={tr} />)}</>}
    </div>
  );
}

// ---------- Shared search + scan (reused by Sales/POS/Purchases later) ----------
export function ProductSearch({ q, setQ, onScan, tr }: { q: string; setQ: (v: string) => void; onScan: (code: string) => void; tr: Ctx["tr"] }) {
  const [scan, setScan] = useState(false);
  return (
    <>
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3">
        <Search className="h-4 w-4 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search product...")} className="h-11 flex-1 bg-transparent text-sm outline-none" />
        <button onClick={() => setScan(true)} className="flex items-center gap-1 text-xs font-bold text-primary"><ScanLine className="h-4 w-4" />{tr("SCAN")}</button>
      </div>
      {scan && <Scanner tr={tr} onClose={() => setScan(false)} onCode={(c) => { setScan(false); onScan(c); }} />}
    </>
  );
}

function Scanner({ onCode, onClose, tr }: { onCode: (c: string) => void; onClose: () => void; tr: Ctx["tr"] }) {
  const video = useRef<HTMLVideoElement>(null);
  const [manual, setManual] = useState("");
  const [camOk, setCamOk] = useState(true);
  useEffect(() => {
    let stream: MediaStream | null = null; let stop = false;
    const Detector = (window as unknown as { BarcodeDetector?: new (o?: unknown) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
    (async () => {
      try {
        if (!Detector || !navigator.mediaDevices) throw new Error("no");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream; await video.current.play();
        const det = new Detector();
        const tick = async () => {
          if (stop || !video.current) return;
          try { const r = await det.detect(video.current); if (r[0]?.rawValue) { onCode(r[0].rawValue); return; } } catch { /* keep scanning */ }
          requestAnimationFrame(tick);
        };
        tick();
      } catch { setCamOk(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((t) => t.stop()); };
  }, [onCode]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 px-6 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><p className="font-semibold">{tr("Scan barcode")}</p><button onClick={onClose} aria-label={tr("Close")}><X className="h-5 w-5" /></button></div>
        {camOk ? <video ref={video} playsInline muted className="aspect-video w-full rounded-xl bg-muted object-cover" />
          : <p className="mb-2 text-xs text-muted-foreground">{tr("Camera scanning isn't available on this device. Type the barcode instead.")}</p>}
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) onCode(manual.trim()); }}>
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={tr("Barcode")} className={inputCls} />
          <ShopButton className="h-11 w-24">{tr("OK")}</ShopButton>
        </form>
      </div>
    </div>
  );
}

function ProductList({ s, money, tr, onUnknown }: Ctx & { onUnknown: (code: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => erp.searchProducts(s, q), [s, q]);
  const onScan = (code: string) => {
    const p = erp.findByCode(s, code);
    if (p) { setQ(""); setOpen(p.id); toast.success(p.name); }
    else { toast(tr("Barcode not found — add it as a new product")); onUnknown(code); }
  };
  const openP = s.products.find((p) => p.id === open);
  return (
    <div>
      <ProductSearch q={q} setQ={setQ} onScan={onScan} tr={tr} />
      <div className="mt-2">
        {list.length === 0 && <Empty>{q ? tr("No matching products") : tr("No products yet")}</Empty>}
        {list.map((p) => (
          <button key={p.id} onClick={() => setOpen(p.id)} className="flex w-full items-center gap-3 border-b border-border py-2.5 text-start">
            {p.image && <img src={p.image} alt="" className="h-10 w-10 rounded-lg object-cover" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{p.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{p.sku} • {p.qty} {p.unit || "pcs"} • {money(p.buy)} → {money(p.sell)}</p>
            </div>
            <Status p={p} />
          </button>
        ))}
      </div>
      {openP && <ProductSheet p={openP} s={s} money={money} tr={tr} onClose={() => setOpen(null)} />}
    </div>
  );
}

function ProductSheet({ p, s, money, tr, onClose }: { p: erp.Product; s: erp.ErpState; money: Ctx["money"]; tr: Ctx["tr"]; onClose: () => void }) {
  const [sell, setSell] = useState(String(p.sell));
  const [buy, setBuy] = useState(String(p.buy));
  const [min, setMin] = useState(String(p.minStock ?? 5));
  const moves = s.movements.filter((m) => m.productId === p.id).slice(0, 8);
  const cat = s.categories.find((c) => c.id === p.categoryId)?.name;
  const brand = s.brands.find((c) => c.id === p.brandId)?.name;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-auto max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          {p.image && <img src={p.image} alt="" className="h-16 w-16 rounded-xl object-cover" />}
          <div className="flex-1"><p className="text-lg font-bold">{p.name}</p><p className="text-xs text-muted-foreground">{[p.sku, p.barcode, cat, brand].filter(Boolean).join(" • ")}</p></div>
          <button onClick={onClose} aria-label={tr("Close")}><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Kpi label={tr("Stock")} value={`${p.qty}`} />
          <Kpi label={tr("Cost value")} value={money(p.qty * p.buy)} />
          <Kpi label={tr("Sell value")} value={money(p.qty * p.sell)} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <label>{tr("Buying price")}<input type="number" value={buy} onChange={(e) => setBuy(e.target.value)} className={inputCls} /></label>
          <label>{tr("Selling price")}<input type="number" value={sell} onChange={(e) => setSell(e.target.value)} className={inputCls} /></label>
          <label>{tr("Min stock")}<input type="number" value={min} onChange={(e) => setMin(e.target.value)} className={inputCls} /></label>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">{tr("Quantity changes only through Stock In, Stock Out, Adjustments, sales and purchases.")}</p>
        <div className="mt-3 flex gap-2">
          <ShopButton onClick={() => run(() => erp.updateProduct(p.id, { buy: +buy || 0, sell: +sell || 0, minStock: +min || 0 }), tr("Saved"))}>{tr("Save")}</ShopButton>
          <ShopButton variant="outline" className="w-14" aria-label={tr("Delete")} onClick={() => { if (confirm(tr("Delete this product?")) && run(() => erp.deleteProduct(p.id), tr("Deleted"))) onClose(); }}><Trash2 className="h-4 w-4" /></ShopButton>
        </div>
        <Title>{tr("History")}</Title>
        {moves.length ? moves.map((m) => <MoveRow key={m.id} m={m} s={s} tr={tr} />) : <Empty>{tr("No movements yet")}</Empty>}
      </div>
    </div>
  );
}

function AddProduct({ s, tr, cur, barcode, done }: Ctx & { barcode: string; done: () => void }) {
  const [f, setF] = useState({ name: "", buy: "", sell: "", qty: "", categoryId: "", brandId: "", sku: "", barcode, unit: "", minStock: "", image: "" });
  const [adv, setAdv] = useState(!!barcode);
  useEffect(() => { if (barcode) { setF((x) => ({ ...x, barcode })); setAdv(true); } }, [barcode]);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () => run(() => erp.addProduct({
    name: f.name, buy: +f.buy || 0, sell: +f.sell || 0, qty: +f.qty || 0,
    categoryId: f.categoryId || undefined, brandId: f.brandId || undefined, sku: f.sku.trim() || undefined,
    barcode: f.barcode.trim() || undefined, unit: f.unit.trim() || undefined, minStock: f.minStock ? +f.minStock : undefined, image: f.image || undefined,
  }), tr("Product added")) && done();
  const L = ({ t, children }: { t: string; children: ReactNode }) => <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tr(t)}<div className="mt-1">{children}</div></label>;
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <L t="Product name"><input value={f.name} onChange={set("name")} className={inputCls} required /></L>
      <div className="grid grid-cols-2 gap-2">
        <L t="Buying price"><input type="number" min="0" inputMode="decimal" placeholder={cur} value={f.buy} onChange={set("buy")} className={inputCls} /></L>
        <L t="Selling price"><input type="number" min="0" inputMode="decimal" placeholder={cur} value={f.sell} onChange={set("sell")} className={inputCls} /></L>
      </div>
      <L t="Quantity"><input type="number" min="0" inputMode="numeric" value={f.qty} onChange={set("qty")} className={inputCls} /></L>
      <button type="button" onClick={() => setAdv(!adv)} className="flex items-center gap-1 text-sm font-semibold text-primary">{tr("More details")} <ChevronDown className={cn("h-4 w-4 transition", adv && "rotate-180")} /></button>
      {adv && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <L t="Category"><select value={f.categoryId} onChange={set("categoryId")} className={inputCls}><option value="">—</option>{s.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
            <L t="Brand"><select value={f.brandId} onChange={set("brandId")} className={inputCls}><option value="">—</option>{s.brands.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
            <L t="SKU"><input value={f.sku} onChange={set("sku")} placeholder={tr("Auto")} className={inputCls} /></L>
            <L t="Barcode"><input value={f.barcode} onChange={set("barcode")} className={inputCls} /></L>
            <L t="Unit"><input value={f.unit} onChange={set("unit")} placeholder="pcs" className={inputCls} /></L>
            <L t="Min stock"><input type="number" min="0" value={f.minStock} onChange={set("minStock")} placeholder="5" className={inputCls} /></L>
          </div>
          <L t="Image">
            <input type="file" accept="image/*" className="text-xs" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const r = new FileReader(); r.onload = () => setF((x) => ({ ...x, image: String(r.result) })); r.readAsDataURL(file); }} />
            {f.image && <img src={f.image} alt="" className="mt-2 h-20 w-20 rounded-xl object-cover" />}
          </L>
        </div>
      )}
      <ShopButton type="submit">{tr("Save")}</ShopButton>
    </form>
  );
}

function NamedList({ s, tr, kind }: Ctx & { kind: "categories" | "brands" }) {
  const [name, setName] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  return (
    <div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (run(() => erp.addNamed(kind, name), tr("Added"))) setName(""); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr(kind === "brands" ? "New brand" : "New category")} className={inputCls} />
        <ShopButton className="h-11 w-24">{tr("Add")}</ShopButton>
      </form>
      <div className="mt-2">
        {s[kind].length === 0 && <Empty>{tr("Nothing here yet")}</Empty>}
        {s[kind].map((c) => {
          const n = s.products.filter((p) => (kind === "brands" ? p.brandId : p.categoryId) === c.id).length;
          return edit?.id === c.id ? (
            <form key={c.id} className="flex gap-2 border-b border-border py-2" onSubmit={(e) => { e.preventDefault(); erp.renameNamed(kind, c.id, edit.name); setEdit(null); }}>
              <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={inputCls} />
              <ShopButton className="h-11 w-20">{tr("Save")}</ShopButton>
            </form>
          ) : (
            <div key={c.id} className="flex items-center justify-between border-b border-border py-2.5 text-sm">
              <button onClick={() => setEdit({ id: c.id, name: c.name })} className="text-start">{c.name} <span className="text-xs text-muted-foreground">• {n}</span></button>
              <button aria-label={tr("Delete")} onClick={() => erp.removeNamed(kind, c.id)}><Trash2 className="h-4 w-4 text-muted-foreground" /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StockLevels({ s, tr }: Ctx) {
  const [q, setQ] = useState("");
  const list = erp.searchProducts(s, q);
  return (
    <div>
      <ProductSearch q={q} setQ={setQ} onScan={setQ} tr={tr} />
      <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-4 border-b border-border py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><span>{tr("Product")}</span><span>{tr("Stock")}</span><span>{tr("Status")}</span></div>
      {list.length === 0 && <Empty>{tr("No products yet")}</Empty>}
      {list.map((p) => <div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-border py-2.5 text-sm"><span className="truncate">{p.name}</span><span className="text-end font-semibold">{p.qty}</span><Status p={p} /></div>)}
    </div>
  );
}

const REASONS = { "Stock In": ["Purchase", "Manual entry", "Return", "Authorized adjustment"], "Stock Out": ["Adjustment", "Damaged", "Expired", "Own use", "Other"], Adjustments: ["Physical stock count", "Damaged", "Lost", "Other"] };

function StockForm({ s, tr, mode }: Ctx & { mode: "Stock In" | "Stock Out" | "Adjustments" }) {
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState<string>(REASONS[mode][0] ?? "");
  useEffect(() => { setReason(REASONS[mode][0] ?? ""); setQty(""); }, [mode]);
  const p = s.products.find((x) => x.id === pid);
  const adj = mode === "Adjustments";
  const submit = () => {
    if (!pid) return toast.error(tr("Select a product"));
    const n = Number(qty);
    const ok = run(() => (mode === "Stock In" ? erp.stockIn(pid, n, reason) : mode === "Stock Out" ? erp.stockOut(pid, n, reason) : erp.adjustStock(pid, n, reason)), tr("Recorded"));
    if (ok) setQty("");
  };
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tr("Product")}
        <select value={pid} onChange={(e) => setPid(e.target.value)} className={cn(inputCls, "mt-1")}><option value="">{tr("Select product")}</option>{s.products.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.qty})</option>)}</select>
      </label>
      {p && <p className="text-xs text-muted-foreground">{tr("Current stock")}: <b className="text-foreground">{p.qty}</b></p>}
      <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tr(adj ? "Physical count" : "Quantity")}
        <input type="number" min="0" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className={cn(inputCls, "mt-1")} />
      </label>
      {adj && p && qty !== "" && <p className="text-xs">{tr("Previous")} {p.qty} • {tr("Adjustment")} {Number(qty) - p.qty > 0 ? "+" : ""}{Number(qty) - p.qty} • {tr("New")} {qty}</p>}
      <label className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{tr("Reason")}
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={cn(inputCls, "mt-1")}>{REASONS[mode].map((r) => <option key={r} value={r}>{tr(r)}</option>)}</select>
      </label>
      <ShopButton type="submit">{tr(mode === "Stock In" ? "Confirm Stock In" : mode === "Stock Out" ? "Confirm Stock Out" : "Confirm Adjustment")}</ShopButton>
    </form>
  );
}

function History({ s, tr }: Ctx) {
  return <div>{s.movements.length ? s.movements.slice(0, 200).map((m) => <MoveRow key={m.id} m={m} s={s} tr={tr} />) : <Empty>{tr("No movements yet")}</Empty>}</div>;
}

function Transfers({ s, tr, view, shop }: Ctx & { view: string }) {
  const [pid, setPid] = useState(""); const [qty, setQty] = useState(""); const [to, setTo] = useState("");
  const name = (id: string) => s.products.find((p) => p.id === id)?.name ?? "—";
  if (view === "New Transfer") return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!pid) return toast.error(tr("Select a product")); if (run(() => erp.createTransfer(pid, Number(qty), to, shop), tr("Transfer created"))) { setQty(""); setTo(""); } }}>
      <p className="text-xs text-muted-foreground">{tr("From")}: <b className="text-foreground">{shop}</b></p>
      <select value={pid} onChange={(e) => setPid(e.target.value)} className={inputCls}><option value="">{tr("Select product")}</option>{s.products.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.qty})</option>)}</select>
      <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder={tr("Quantity")} className={inputCls} />
      <input value={to} onChange={(e) => setTo(e.target.value)} placeholder={tr("To shop / branch")} className={inputCls} />
      <ShopButton type="submit">{tr("Create Transfer")}</ShopButton>
    </form>
  );
  const list = s.transfers.filter((t) => view === "Pending" ? t.status === "PENDING" || t.status === "SENT" : view === "Received" ? t.status === "RECEIVED" : true);
  return (
    <div>
      {list.length === 0 && <Empty>{tr("No transfers")}</Empty>}
      {list.map((t) => (
        <div key={t.id} className="border-b border-border py-2.5">
          <div className="flex items-center justify-between text-sm"><span className="font-semibold">{t.ref} • {name(t.productId)}</span><span className="text-[10px] font-bold text-muted-foreground">{tr(t.status)}</span></div>
          <p className="text-[11px] text-muted-foreground">{dt(t.at)} • {t.qty} • {t.from} → {t.to}</p>
          {(t.status === "PENDING" || t.status === "SENT") && (
            <div className="mt-2 flex gap-2">
              {t.status === "PENDING" && <ShopButton className="h-9 text-sm" onClick={() => run(() => erp.sendTransfer(t.id), tr("Sent"))}>{tr("Send")}</ShopButton>}
              {t.status === "SENT" && <ShopButton className="h-9 text-sm" onClick={() => run(() => erp.receiveTransfer(t.id), tr("Received"))}>{tr("Mark received")}</ShopButton>}
              <ShopButton variant="outline" className="h-9 text-sm" onClick={() => run(() => erp.cancelTransfer(t.id), tr("Cancelled"))}>{tr("Cancel")}</ShopButton>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Reports({ s, money, tr, view }: Ctx & { view: string }) {
  if (view === "Valuation") {
    const cost = s.products.reduce((a, p) => a + p.qty * p.buy, 0);
    const sell = s.products.reduce((a, p) => a + p.qty * p.sell, 0);
    return (
      <div>
        <div className="grid grid-cols-2 gap-2"><Kpi label={tr("Cost value")} value={money(cost)} /><Kpi label={tr("Selling value")} value={money(sell)} /></div>
        <p className="mt-2 text-xs text-muted-foreground">{tr("Potential profit")}: <b className="text-foreground">{money(sell - cost)}</b></p>
        {s.products.map((p) => <div key={p.id} className="flex justify-between border-b border-border py-2.5 text-sm"><span className="truncate">{p.name} <span className="text-xs text-muted-foreground">× {p.qty}</span></span><span>{money(p.qty * p.buy)}</span></div>)}
      </div>
    );
  }
  if (view === "Movement") {
    const by = new Map<string, { in: number; out: number }>();
    s.movements.forEach((m) => { const x = by.get(m.type) ?? { in: 0, out: 0 }; if (m.qty > 0) x.in += m.qty; else x.out -= m.qty; by.set(m.type, x); });
    return <div>{by.size === 0 && <Empty>{tr("No movements yet")}</Empty>}{[...by].map(([k, v]) => <div key={k} className="flex justify-between border-b border-border py-2.5 text-sm"><span>{tr(k)}</span><span><span className="text-primary">+{v.in}</span> / <span className="text-destructive">-{v.out}</span></span></div>)}</div>;
  }
  if (view === "Performance") {
    const out = new Map<string, number>();
    s.movements.filter((m) => m.type === "SALE" || m.type === "STOCK OUT").forEach((m) => out.set(m.productId, (out.get(m.productId) ?? 0) - m.qty));
    const ranked = s.products.map((p) => ({ p, n: out.get(p.id) ?? 0 })).sort((a, b) => b.n - a.n);
    return <div>{ranked.length === 0 && <Empty>{tr("No products yet")}</Empty>}{ranked.map(({ p, n }) => <div key={p.id} className="flex justify-between border-b border-border py-2.5 text-sm"><span className="truncate">{p.name}</span><span className="font-semibold">{n} {tr("out")}</span></div>)}</div>;
  }
  return <StockLevels s={s} money={money} tr={tr} go={() => {}} cur="" shop="" />;
}
