import { clean } from "@/lib/format";
import { useFeature } from "@/lib/use-features";
import { GlassPage } from "@/components/shopbook/glass-page";
import { createFileRoute } from "@tanstack/react-router";
import { startView, viewSearch } from "@/lib/deep-link";
import { usePeriod } from "@/lib/period";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, FileText, MessageCircle, MinusCircle, Plus, Printer, Receipt, ScanLine, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { ProductSearch, useBusinessErp, useShopErp } from "@/components/shopbook/product-search";
import { TransactionImport } from "@/components/shopbook/transaction-import";
import { run, useAccount } from "@/components/shopbook/selling";
import { BigButton, Badge, Box, Dot, Empty, ErpShell, MoneyTrio, Row, Tabs, toneOf, type Tr } from "@/components/shopbook/erp-shell";
import { Act, ListScreen, dayText, type Col } from "@/components/shopbook/purchase-ui";
import { PurchaseOrders, PurchaseReports, PurchasesOverview, SupplierInvoices, SupplierPayments, Suppliers } from "@/components/shopbook/purchase-screens";
import * as pur from "@/lib/purchasing";
import { PrintPreview, sharePdfText } from "@/components/shopbook/print";
import { PayPicker, emptyPay, payInvalid, payRecord, type PayState } from "@/components/shopbook/pay-picker";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { parseQty } from "@/lib/qty-parse";
import * as catalog from "@/lib/catalog";
import * as fin from "@/lib/finance";
import { SearchPicker } from "@/components/shopbook/search-picker";
import { ProductListHead, ProductRow } from "@/components/shopbook/product-catalog";
import { randomUUID } from "@/lib/id";

export const Route = createFileRoute("/purchases")({
  head: () => ({ meta: [
    { title: "Purchases — Zakrio Systems" },
    { name: "description", content: "Record supplier purchases, receive stock, pay suppliers and return goods." },
    { property: "og:title", content: "Purchases — Zakrio Systems" },
    { property: "og:description", content: "Buy stock from suppliers with automatic stock and money updates." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: viewSearch,
  component: Purchases,
});

const MENUS = {
  Overview: [],
  Purchases: ["All Purchases", "Draft Purchases", "Cancelled Purchases", "Purchase Returns"],
  "Orders & Invoices": ["Purchase Orders", "Supplier Invoices"],
  "Suppliers & Payments": ["Suppliers", "Supplier Payments"],
  Reports: ["Purchase Reports", "Supplier Reports", "Payment Reports", "Returns Reports", "Stock Received Reports"],
} as const;
type Menu = keyof typeof MENUS;
/** Links saved under the old menus still land on the screen that took over from them. */
const OLD_LINKS: Record<string, { menu: Menu; sub?: string }> = {
  Suppliers: { menu: "Suppliers & Payments", sub: "Suppliers" },
  Payments: { menu: "Suppliers & Payments", sub: "Supplier Payments" },
  Returns: { menu: "Purchases", sub: "Purchase Returns" },
};
const OLD_SUBS: Record<string, string> = { Drafts: "Draft Purchases", Cancelled: "Cancelled Purchases", Completed: "All Purchases", "Purchase Report": "Purchase Reports", "Supplier Report": "Supplier Reports", "Payment Report": "Payment Reports", "Return Report": "Returns Reports" };
function currentLink(search: { menu?: string | undefined; sub?: string | undefined }) {
  const old = search.menu ? OLD_LINKS[search.menu] : undefined;
  return old ? { menu: old.menu, sub: old.sub } : { menu: search.menu, sub: search.sub ? (OLD_SUBS[search.sub] ?? search.sub) : undefined };
}
type View = null | { k: "new"; draft?: Draft; scanOnOpen?: boolean } | { k: "import" } | { k: "detail"; id: string } | { k: "done"; id: string } | { k: "edit"; id: string } | { k: "return"; draft?: ReturnDraft | undefined } | { k: "draft"; id: string } | { k: "cancelled"; id: string } | { k: "returned"; ref: string } | { k: "print"; id: string };
type Ctx = { s: erp.ErpState; money: (n: number) => string; tr: Tr; go: (m: Menu, sub?: string) => void; open: (v: View) => void; shop: string };

// Drafts are unsaved work, not financial records, so they stay outside the ERP ledger.
/** `amount` is set when the line was bought by money: it is what was paid, whatever the rounding of qty × cost. */
type DraftLine = { productId: string; qty: string; cost: string; disc: string; unit?: string; amount?: string; byMoney?: boolean;
  /** Batch and expiry date (YYYY-MM-DD), shown while the Expiry feature is on (trade-features.ts). */
  batch?: string; expiry?: string };
type Draft = { id: string; at: number; supplierId: string; lines: DraftLine[]; status: "draft" | "cancelled" };
const DKEY = "shopbook.purchaseDrafts";
const loadDrafts = (): Draft[] => { try { return JSON.parse(localStorage.getItem(DKEY) || "[]"); } catch { return []; } };
const saveDrafts = (d: Draft[]) => { localStorage.setItem(DKEY, JSON.stringify(d)); window.dispatchEvent(new Event("shopbook-drafts")); };
function useDrafts() {
  const [d, setD] = useState<Draft[]>([]);
  useEffect(() => { setD(loadDrafts()); const f = () => setD(loadDrafts()); window.addEventListener("shopbook-drafts", f); return () => window.removeEventListener("shopbook-drafts", f); }, []);
  return d;
}

const supName = (s: erp.ErpState, id?: string) => s.suppliers.find((x) => x.id === id)?.name ?? "—";
const paidOf = (s: erp.ErpState, p: erp.Purchase) => Math.max(0, p.total - fin.purchaseBalance(s, p));
// Returns still being written are device-local like purchase drafts: no stock or money moves until they are completed.
type ReturnDraft = { id: string; at: number; purchaseId: string; qty: Record<string, string>; refund: erp.Method; reason: string; note: string };
const RKEY = "shopbook.purchaseReturnDrafts";
const loadReturnDrafts = (): ReturnDraft[] => { try { return JSON.parse(localStorage.getItem(RKEY) || "[]"); } catch { return []; } };
const saveReturnDrafts = (d: ReturnDraft[]) => { localStorage.setItem(RKEY, JSON.stringify(d)); window.dispatchEvent(new Event("shopbook-drafts")); };
function useReturnDrafts() {
  const [d, setD] = useState<ReturnDraft[]>([]);
  useEffect(() => { setD(loadReturnDrafts()); const f = () => setD(loadReturnDrafts()); window.addEventListener("shopbook-drafts", f); return () => window.removeEventListener("shopbook-drafts", f); }, []);
  return d;
}

function Purchases() {
  const acct = useAccount("basic");
  const { tr } = useLanguage();
  const s = useShopErp();
  const per = usePeriod(null);
  // A Dashboard link may name the starting tab (?menu=…&sub=…).
  const search = Route.useSearch();
  const [start] = useState(() => startView(MENUS, currentLink(search), "Overview"));
  const [menu, setMenu] = useState<Menu>(start[0] as Menu);
  const [sub, setSub] = useState(start[1]);
  const [view, setView] = useState<View>(null);
  const newPurchaseDirty = useRef(false);
  if (!acct) return <main className="app-screen" />;
  const cur = acct.currency || "KSh";
  const money = (n: number) => `${cur} ${clean(Math.round(clean(n) * 100) / 100).toLocaleString("en-KE")}`;
  const go = (m: Menu, sm?: string) => { setView(null); setMenu(m); setSub(sm ?? MENUS[m][0] ?? ""); };
  const ctx: Ctx = { s, money, tr, go, open: setView, shop: acct.shopName };
  const close = () => setView(null);
  return (
    <ErpShell branded period={menu === "Overview" && view?.k !== "new" ? per : undefined} title="Purchases" shop={acct.shopName} menus={MENUS} menu={menu} sub={sub} deps={s} onMenu={(m) => go(m as Menu)} onSub={(x) => { setView(null); setSub(x); }}>
      <>
          {menu === "Overview" && <PurchasesOverview {...ctx} onPurchase={(id) => setView({ k: "detail", id })} go={(m, x) => go(m as Menu, x)} range={per.period ? per.range : undefined} />}
          {menu === "Purchases" && sub === "All Purchases" && <AllPurchases {...ctx} />}
          {menu === "Purchases" && sub === "Draft Purchases" && <DraftPurchases {...ctx} />}
          {menu === "Purchases" && sub === "Cancelled Purchases" && <CancelledPurchases {...ctx} />}
          {menu === "Purchases" && sub === "Purchase Returns" && <PurchaseReturns {...ctx} />}
          {menu === "Orders & Invoices" && sub === "Purchase Orders" && <PurchaseOrders {...ctx} />}
          {menu === "Orders & Invoices" && sub === "Supplier Invoices" && <SupplierInvoices {...ctx} />}
          {menu === "Suppliers & Payments" && sub === "Suppliers" && <Suppliers {...ctx} />}
          {menu === "Suppliers & Payments" && sub === "Supplier Payments" && <SupplierPayments {...ctx} />}
          {menu === "Reports" && <PurchaseReports {...ctx} view={sub} />}
        </>
      {view?.k === "new" && (() => {
        // A click outside shouldn't lose a purchase being written.
        const closeNew = () => { if (!newPurchaseDirty.current || window.confirm(tr("Discard this purchase?"))) { newPurchaseDirty.current = false; close(); } };
        return <GlassPage label={tr("New Purchase")} onClose={closeNew}><NewPurchase key={view.draft?.id ?? "new"} {...ctx} draft={view.draft} scanOnOpen={view.scanOnOpen} onClose={closeNew} dirty={newPurchaseDirty} /></GlassPage>;
      })()}
      {view?.k === "detail" && <GlassPage label={tr("View Purchase")} onClose={close}><PurchaseDetail {...ctx} id={view.id} /></GlassPage>}
      {view?.k === "done" && <GlassPage label={tr("View Purchase")} onClose={close}><Done {...ctx} id={view.id} /></GlassPage>}
      {view?.k === "edit" && <GlassPage label={tr("Edit Purchase")} onClose={close}><EditPurchase {...ctx} id={view.id} /></GlassPage>}
      {view?.k === "return" && <GlassPage label={tr("New Return")} onClose={close} narrow><NewReturn {...ctx} draft={view.draft} /></GlassPage>}
      {view?.k === "draft" && <GlassPage label={tr("Draft Purchase")} onClose={close} narrow><DraftView {...ctx} id={view.id} /></GlassPage>}
      {view?.k === "cancelled" && <GlassPage label={tr("Cancellation Details")} onClose={close} narrow><CancelledView {...ctx} id={view.id} /></GlassPage>}
      {view?.k === "returned" && <GlassPage label={view.ref} onClose={close} narrow><ReturnView {...ctx} ref_={view.ref} /></GlassPage>}
      {view?.k === "import" && <GlassPage label={tr("Import Purchases")} onClose={close}><div className="inventory-box dash-panel pw-page"><PanelHead title={tr("Import Purchases")} onClose={close} tr={tr} /><TransactionImport tr={tr} only="PURCHASE" /></div></GlassPage>}
      {view?.k === "print" && (() => { const p = s.purchases.find((x) => x.id === view.id); return p ? <PrintPreview title="Print Purchase" onClose={close}><PurchaseDoc p={p} s={s} money={money} tr={tr} shop={acct.shopName} /></PrintPreview> : null; })()}
    </ErpShell>
  );
}

const PanelHead = ({ title, onClose, tr, side }: { title: ReactNode; onClose: () => void; tr: Tr; side?: ReactNode }) => <div className="pw-page-head"><span className="pm-head-side">{side}</span><h2>{title}</h2><button type="button" className="pw-btn" aria-label={tr("Close")} onClick={onClose}><X /></button></div>;
const Facts = ({ rows }: { rows: [string, ReactNode][] }) => <dl className="pm-facts">{rows.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;

function RetRow({ r, s, money, tr }: { r: erp.PurchaseReturn; s: erp.ErpState; money: (n: number) => string; tr: Tr }) {
  const purchase = s.purchases.find((p) => p.id === r.purchaseId);
  const n = r.items.reduce((a, i) => a + i.qty, 0);
  return <Row><Dot tone="ok" /><b>{r.ref}</b><span className="pur-name">{supName(s, purchase?.supplierId)}</span><span className="pur-muted">{n} {tr(n === 1 ? "item" : "items")}</span><span className="pur-amt">{money(r.amount)}</span><Badge s="Completed" /></Row>;
}

function AllPurchases(c: Ctx) {
  const { s, money, tr, shop } = c;
  const columns: Col<erp.Purchase>[] = [
    { label: "Purchase No", value: (p) => p.ref }, { label: "Supplier", value: (p) => supName(s, p.supplierId) }, { label: "Date", value: (p) => dayText(p.at) }, { label: "Products", value: (p) => p.items.length, end: true },
    { label: "Total", value: (p) => p.total, money: true }, { label: "Paid", value: (p) => pur.purchasePaid(p), money: true }, { label: "Balance", value: (p) => fin.purchaseBalance(s, p), money: true }, { label: "Status", value: pur.purchaseState, render: (p) => <Badge s={pur.purchaseState(p)} /> },
  ];
  return <ListScreen title="All Purchases" shop={shop} items={s.purchases} columns={columns} idOf={(p) => p.id} money={money} tr={tr} empty="No purchases yet" ph="Search by purchase, supplier or product..."
    text={(p) => `${p.ref} ${supName(s, p.supplierId)} ${p.items.map((i) => i.name).join(" ")}`} when={(p) => p.at}
    filters={[{ label: "Purchase Status", get: pur.purchaseState, options: ["Completed", "Partly Returned", "Returned", "Cancelled"] }, { label: "Payment Status", get: (p) => fin.purchaseStatus(s, p), options: ["Paid", "P.PAY", "Credit", "Cancelled"] }, { label: "Supplier", get: (p) => supName(s, p.supplierId) }]}
    scanAction={{ label: "Scan", onClick: () => c.open({ k: "new", scanOnOpen: true }) }}
    primary={{ label: "New Purchase", icon: <Plus />, onClick: () => c.open({ k: "new" }) }}
    importAction={{ label: "Import", icon: <Upload />, onClick: () => c.open({ k: "import" }) }}
    actions={(p) => <><Act label={`${tr("View")} ${p.ref}`} onClick={() => c.open({ k: "detail", id: p.id })}>{tr("View")}</Act><Act label={`${tr("Edit")} ${p.ref}`} onClick={() => c.open({ k: "edit", id: p.id })}>{tr("Edit")}</Act></>} />;
}

/** A completed purchase's goods and money are history: they change only through a return or a cancellation, both audited. */
function EditPurchase(c: Ctx & { id: string }) {
  const { s, tr, money } = c;
  const p = s.purchases.find((x) => x.id === c.id);
  const [note, setNote] = useState(p?.note ?? "");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState<erp.Method>(() => erp.defaultMethod(erp.load()));
  if (!p) return <Empty>{tr("Purchase not found")}</Empty>;
  const close = () => c.open(null);
  const value = p.items.reduce((a, i) => a + (i.qty - i.returned) * i.cost, 0), owed = Math.min(fin.purchaseBalance(s, p), value), back = Math.round((value - owed) * 100) / 100;
  return <div className="inventory-box dash-panel pw-page pw-form pm-form">
    <div className="pm-edit-row">
      <Badge s={pur.purchaseState(p)} />
      <h2>{tr("Edit Purchase")} <small>{p.ref}</small></h2>
      <dl>
        <div><dt>{tr("Supplier")}</dt><dd title={supName(s, p.supplierId)}>{supName(s, p.supplierId)}</dd></div>
        <div><dt>{tr("Date")}</dt><dd>{dayText(p.at)}</dd></div>
        <div><dt>{tr("Total")}</dt><dd>{money(p.total)}</dd></div>
      </dl>
      <button type="button" className="pw-btn" aria-label={tr("Close")} onClick={close}><X /></button>
    </div>
    <label className="inventory-field"><span>{tr("Notes")}</span><input className="inventory-input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
    <p className="pw-note">{tr("Goods and amounts on a completed purchase stay as recorded. To correct them, record a return or cancel the purchase.")}</p>
    {cancelling && <>
      <label className="inventory-field"><span>{tr("Reason for cancelling")} <span className="text-destructive">*</span></span><input autoFocus className="inventory-input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {back > 0.001 && <label className="inventory-field"><span>{tr("Refund")} {money(back)} {tr("to")}</span><select className="inventory-input" value={refund} onChange={(e) => setRefund(e.target.value as erp.Method)}>{fin.accounts(s).map((m) => <option key={m} value={m}>{tr(erp.methodName(m))}</option>)}</select></label>}
      <p className="pw-note">{tr("Stock worth")} {money(value)} {tr("goes back out of inventory")}{owed > 0.001 ? ` ${tr("and")} ${money(owed)} ${tr("comes off what you owe")}` : ""}. {tr("The purchase stays on record.")}</p>
    </>}
    <div className="pw-foot"><span>{!p.cancelled && value > 0 && !cancelling && <button type="button" className="pw-btn is-danger" onClick={() => setCancelling(true)}>{tr("Cancel Purchase")}</button>}</span><span className="pw-foot-right">
      {cancelling
        ? <><button type="button" className="pw-btn" onClick={() => setCancelling(false)}>{tr("Keep Purchase")}</button><button type="button" className="pw-btn is-danger" onClick={() => { if (run(() => pur.cancelPurchase(p.id, reason, refund), tr("Purchase cancelled")) !== undefined) close(); }}>{tr("Confirm Cancel")}</button></>
        : <><button type="button" className="pw-btn" onClick={close}>{tr("Close")}</button><button type="button" className="pw-btn is-primary" onClick={() => { if (run(() => pur.editPurchaseNote(p.id, note), tr("Purchase updated")) !== undefined) close(); }}>{tr("Save")}</button></>}
    </span></div>
  </div>;
}

const draftTotal = (d: Draft) => d.lines.reduce((a, l) => a + (l.amount !== undefined ? Number(l.amount) : Math.max(0, lineQty(l) * (+l.cost || 0) - (+l.disc || 0))), 0);
const draftNo = (d: Draft) => `DR-${d.id.slice(0, 6).toUpperCase()}`;
function DraftPurchases(c: Ctx) {
  const { s, money, tr, shop } = c;
  const drafts = useDrafts().filter((d) => d.status === "draft");
  const name = (l: DraftLine) => s.products.find((p) => p.id === l.productId)?.name ?? "—";
  const columns: Col<Draft>[] = [
    { label: "Draft No", value: draftNo }, { label: "Supplier", value: (d) => supName(s, d.supplierId) }, { label: "Created", value: (d) => dayText(d.at) }, { label: "Products", value: (d) => d.lines.map(name).join(", ") },
    { label: "Quantities", value: (d) => d.lines.map((l) => l.qty).join(", ") }, { label: "Buying Prices", value: (d) => d.lines.map((l) => l.cost).join(", ") }, { label: "Total", value: draftTotal, money: true }, { label: "Status", value: () => "Draft", render: () => <Badge s="Draft" /> },
  ];
  const edit = (d: Draft) => c.open({ k: "new", draft: d });
  return <ListScreen title="Draft Purchases" shop={shop} items={drafts} columns={columns} idOf={(d) => d.id} money={money} tr={tr} empty="No drafts" ph="Search drafts..."
    text={(d) => `${draftNo(d)} ${supName(s, d.supplierId)} ${d.lines.map(name).join(" ")}`} when={(d) => d.at} filters={[{ label: "Supplier", get: (d) => supName(s, d.supplierId) }]}
    primary={{ label: "New Purchase", icon: <Plus />, onClick: () => c.open({ k: "new" }) }}
    actions={(d) => <><Act label={`${tr("View")} ${draftNo(d)}`} onClick={() => c.open({ k: "draft", id: d.id })}>{tr("View")}</Act><Act label={`${tr("Edit")} ${draftNo(d)}`} onClick={() => edit(d)}>{tr("Edit")}</Act><Act label={`${tr("Continue editing")} ${draftNo(d)}`} onClick={() => edit(d)}>{tr("Continue editing")}</Act><Act label={`${tr("Complete purchase")} ${draftNo(d)}`} onClick={() => edit(d)}>{tr("Complete purchase")}</Act>
      {erp.isAdmin() && <Act label={`${tr("Delete draft")} ${draftNo(d)}`} onClick={() => { if (window.confirm(tr("Delete this draft? Nothing else is affected."))) saveDrafts(loadDrafts().filter((x) => x.id !== d.id)); }}>{tr("Delete")}</Act>}</>} />;
}
function DraftView(c: Ctx & { id: string }) {
  const { s, money, tr } = c;
  const d = loadDrafts().find((x) => x.id === c.id);
  if (!d) return <Empty>{tr("Draft not found")}</Empty>;
  return <div className="inventory-box dash-panel pw-page pm-form">
    <PanelHead title={`${tr("Draft")} ${draftNo(d)}`} onClose={() => c.open(null)} tr={tr} side={<Badge s="Draft" />} />
    <Facts rows={[[tr("Supplier"), supName(s, d.supplierId)], [tr("Created"), dayText(d.at)], [tr("Total"), money(draftTotal(d))]]} />
    {d.lines.map((l) => <Row key={l.productId}><span className="pur-name">{s.products.find((p) => p.id === l.productId)?.name}</span><span className="pur-muted">× {l.qty}</span><span className="pur-amt">{l.cost}</span></Row>)}
    <p className="pw-note">{tr("A draft doesn't change stock or balances until it is completed.")}</p>
    <div className="pw-foot"><span /><button type="button" className="pw-btn is-primary" onClick={() => c.open({ k: "new", draft: d })}>{tr("Continue editing")}</button></div>
  </div>;
}

const cancelledAt = (s: erp.ErpState, p: erp.Purchase) => p.cancelled?.at ?? s.purchaseReturns.find((r) => r.purchaseId === p.id)?.at ?? p.at;
const cancelledWhy = (s: erp.ErpState, p: erp.Purchase) => p.cancelled?.reason ?? s.purchaseReturns.find((r) => r.purchaseId === p.id)?.reason ?? "Fully returned";
const cancelledBy = (s: erp.ErpState, p: erp.Purchase) => p.cancelled?.user ?? s.purchaseReturns.find((r) => r.purchaseId === p.id)?.user ?? p.user;
function CancelledPurchases(c: Ctx) {
  const { s, money, tr, shop } = c;
  const drafts = useDrafts().filter((d) => d.status === "cancelled");
  const items = s.purchases.filter(pur.isCancelled);
  const columns: Col<erp.Purchase>[] = [
    { label: "Purchase No", value: (p) => p.ref }, { label: "Supplier", value: (p) => supName(s, p.supplierId) }, { label: "Purchase Date", value: (p) => dayText(p.at) }, { label: "Cancelled On", value: (p) => dayText(cancelledAt(s, p)) },
    { label: "Amount", value: (p) => p.total, money: true }, { label: "Reason", value: (p) => cancelledWhy(s, p) }, { label: "Cancelled By", value: (p) => cancelledBy(s, p) },
  ];
  return <>
    <ListScreen title="Cancelled Purchases" shop={shop} items={items} columns={columns} idOf={(p) => p.id} money={money} tr={tr} empty="No cancelled purchases" ph="Search cancelled purchases..."
      text={(p) => `${p.ref} ${supName(s, p.supplierId)} ${cancelledWhy(s, p)}`} when={(p) => cancelledAt(s, p)} filters={[{ label: "Supplier", get: (p) => supName(s, p.supplierId) }]}
      actions={(p) => <><Act label={`${tr("View cancellation")} ${p.ref}`} onClick={() => c.open({ k: "cancelled", id: p.id })}>{tr("Details")}</Act><Act label={`${tr("View original")} ${p.ref}`} onClick={() => c.open({ k: "detail", id: p.id })}>{tr("Original")}</Act><Act label={`${tr("Print")} ${p.ref}`} onClick={() => c.open({ k: "print", id: p.id })}><Printer /></Act></>} />
    {drafts.length > 0 && <Box title={tr("Drafts cancelled before they were completed")}>{drafts.map((d) => <Row key={d.id}><Dot tone="bad" /><span className="pur-name">{supName(s, d.supplierId)}</span><span className="pur-muted">{dayText(d.at)}</span><span className="pur-amt">{money(draftTotal(d))}</span></Row>)}</Box>}
  </>;
}
function CancelledView(c: Ctx & { id: string }) {
  const { s, money, tr } = c;
  const p = s.purchases.find((x) => x.id === c.id);
  if (!p) return <Empty>{tr("Purchase not found")}</Empty>;
  return <div className="inventory-box dash-panel pw-page pm-form">
    <PanelHead title={`${tr("Cancellation Details")} ${p.ref}`} onClose={() => c.open(null)} tr={tr} />
    <Facts rows={[[tr("Supplier"), supName(s, p.supplierId)], [tr("Purchase Date"), dayText(p.at)], [tr("Cancelled On"), dayText(cancelledAt(s, p))], [tr("Amount"), money(p.total)], [tr("Reason"), cancelledWhy(s, p)], [tr("Cancelled By"), cancelledBy(s, p)]]} />
    <div className="pw-foot"><span /><button type="button" className="pw-btn" onClick={() => c.open({ k: "detail", id: p.id })}>{tr("View Original")}</button></div>
  </div>;
}

type ReturnRow = { id: string; ref: string; at: number; purchaseRef: string; supplier: string; products: string; qtys: string; amount: number; status: "Draft" | "Completed"; draft?: ReturnDraft };
function PurchaseReturns(c: Ctx) {
  const { s, money, tr, shop } = c;
  const drafts = useReturnDrafts();
  const rows: ReturnRow[] = [
    ...drafts.map((d): ReturnRow => { const p = s.purchases.find((x) => x.id === d.purchaseId), picked = p?.items.filter((i) => +(d.qty[i.productId] ?? 0) > 0) ?? []; return { id: d.id, ref: `DR-${d.id.slice(0, 6).toUpperCase()}`, at: d.at, purchaseRef: p?.ref ?? "—", supplier: supName(s, p?.supplierId), products: picked.map((i) => i.name).join(", "), qtys: picked.map((i) => d.qty[i.productId]).join(", "), amount: picked.reduce((a, i) => a + +(d.qty[i.productId] ?? 0) * i.cost, 0), status: "Draft", draft: d }; }),
    ...s.purchaseReturns.map((r): ReturnRow => ({ id: r.id, ref: r.ref, at: r.at, purchaseRef: r.purchaseRef, supplier: supName(s, s.purchases.find((p) => p.id === r.purchaseId)?.supplierId), products: r.items.map((i) => i.name).join(", "), qtys: r.items.map((i) => i.qty).join(", "), amount: r.amount, status: "Completed" })),
  ];
  const columns: Col<ReturnRow>[] = [
    { label: "Return No", value: (r) => r.ref }, { label: "Purchase No", value: (r) => r.purchaseRef }, { label: "Supplier", value: (r) => r.supplier }, { label: "Products", value: (r) => r.products }, { label: "Quantities", value: (r) => r.qtys },
    { label: "Amount", value: (r) => r.amount, money: true }, { label: "Date", value: (r) => dayText(r.at) }, { label: "Status", value: (r) => r.status, render: (r) => <Badge s={r.status} /> },
  ];
  return <ListScreen title="Purchase Returns" shop={shop} items={rows} columns={columns} idOf={(r) => r.id} money={money} tr={tr} empty="No returns yet" ph="Search returns..."
    text={(r) => `${r.ref} ${r.purchaseRef} ${r.supplier} ${r.products}`} when={(r) => r.at} filters={[{ label: "Status", get: (r) => r.status, options: ["Draft", "Completed"] }, { label: "Supplier", get: (r) => r.supplier }]}
    primary={{ label: "New Return", icon: <Plus />, onClick: () => c.open({ k: "return" }) }}
    actions={(r) => r.draft
      ? <><Act label={`${tr("Edit draft")} ${r.ref}`} onClick={() => c.open({ k: "return", draft: r.draft })}>{tr("Edit draft")}</Act><Act label={`${tr("Complete return")} ${r.ref}`} onClick={() => c.open({ k: "return", draft: r.draft })}>{tr("Complete return")}</Act></>
      : <Act label={`${tr("View")} ${r.ref}`} onClick={() => c.open({ k: "returned", ref: r.ref })}>{tr("View")}</Act>} />;
}
function ReturnView(c: Ctx & { ref_: string }) {
  const { s, money, tr, shop } = c;
  const r = s.purchaseReturns.find((x) => x.ref === c.ref_);
  const [print, setPrint] = useState(false);
  if (!r) return <Empty>{tr("Return not found")}</Empty>;
  const doc = <div><p className="text-center text-sm font-extrabold uppercase">{shop}</p><p className="mt-2">{tr("Return No")}: {r.ref}</p><p>{tr("Purchase No")}: {r.purchaseRef}</p><p>{tr("Supplier")}: {supName(s, s.purchases.find((p) => p.id === r.purchaseId)?.supplierId)}</p><p>{tr("Date")}: {new Date(r.at).toLocaleString("en-GB")}</p><div className="my-2 border-t border-dashed" />{r.items.map((i) => <div key={i.productId} className="flex justify-between"><span>{i.name} × {i.qty}</span><span>{money(i.amount)}</span></div>)}<div className="my-2 border-t border-dashed" /><div className="flex justify-between font-bold"><span>{tr("Total")}</span><span>{money(r.amount)}</span></div>{r.reason && <p>{tr("Reason")}: {r.reason}</p>}</div>;
  return <div className="inventory-box dash-panel pw-page pm-form">
    <PanelHead title={`${tr("Return")} ${r.ref}`} onClose={() => c.open(null)} tr={tr} side={<Badge s="Completed" />} />
    <Facts rows={[[tr("Purchase No"), r.purchaseRef], [tr("Date"), dayText(r.at)], [tr("Amount"), money(r.amount)], [tr("Settled By"), tr(r.refund === "credit" ? "Reduced amount owed" : erp.methodName(r.refund))], [tr("Reason"), r.reason ?? ""]]} />
    {r.items.map((i) => <Row key={i.productId}><span className="pur-name">{i.name}</span><span className="pur-muted">× {i.qty}</span><span className="pur-amt">{money(i.amount)}</span></Row>)}
    <div className="pw-foot"><span /><button type="button" className="pw-btn" onClick={() => setPrint(true)}><Printer /><span>{tr("Print")}</span></button></div>
    {print && <PrintPreview title={tr("Print Return")} onClose={() => setPrint(false)}>{doc}</PrintPreview>}
  </div>;
}

/** Cash, M-Pesa and Bank rows added one at a time; whatever is unpaid becomes credit (P.PAY). */
function PayRows({ rows, setRows, tr }: { rows: { m: erp.Method; a: string }[]; setRows: (r: { m: erp.Method; a: string }[]) => void; tr: Tr }) {
  const s = useBusinessErp(); // the open business's own payment methods
  return <>
    {rows.map((r, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-1.5">
      <select className="inventory-input" value={r.m} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, m: e.target.value as erp.Method } : x)))}>{fin.accounts(s).map((m) => <option key={m} value={m} disabled={m !== r.m && rows.some((x) => x.m === m)}>{tr(erp.methodName(m))}</option>)}</select>
      <input className="inventory-input" inputMode="decimal" placeholder="0" value={r.a} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
      <button aria-label={tr("Remove")} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><MinusCircle className="h-4 w-4 text-destructive" /></button></div>)}
    {rows.length < fin.accounts(s).length && <ShopButton className="inventory-save w-fit px-3" onClick={() => setRows([...rows, { m: fin.accounts(s).find((m) => !rows.some((r) => r.m === m)) ?? "cash", a: "" }])}><Plus className="h-3.5 w-3.5" />{tr("Add Payment Method")}</ShopButton>}
  </>;
}
const lineQty = (l: DraftLine) => erp.roundQty(parseQty(l.qty) ?? 0);
const sumRows = (rows: { a: string }[]) => rows.reduce((a, r) => a + (+r.a || 0), 0);

/** What was paid for a line, typed freely. Kilos, litres and yards work out the quantity from it; pieces keep theirs and the cost follows. */
function LineTotal({ line, whole, label, value, onChange }: { line: DraftLine; whole: boolean; label: string; value: number; onChange: (l: DraftLine) => void }) {
  const [v, setV] = useState(String(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => { if (!focus) setV(String(Math.round(value * 100) / 100)); }, [value, focus]);
  return <input className="inventory-input" inputMode="decimal" aria-label={label} value={v}
    onFocus={(e) => { setFocus(true); e.currentTarget.select(); }}
    onBlur={() => setFocus(false)}
    onChange={(e) => {
      const raw = e.target.value; setV(raw);
      const amount = Number(raw);
      if (!/^\d+(\.\d{0,2})?$/.test(raw) || !(amount > 0)) return;
      const paid = amount + (+line.disc || 0), cost = +line.cost || 0, qty = lineQty(line);
      if (whole || !(cost > 0)) { const n = qty > 0 ? qty : 1; onChange({ ...line, qty: String(n), cost: String(Math.round((paid / n) * 100) / 100), amount: raw, byMoney: false }); return; }
      const worth = erp.roundQty(paid / cost);
      if (worth > 0) onChange({ ...line, qty: String(worth), amount: raw, byMoney: true });
    }} />;
}

function NewPurchase(c: Ctx & { draft?: Draft | undefined; scanOnOpen?: boolean | undefined; onClose: () => void; dirty: { current: boolean } }) {
  const { s, money, tr, go, draft, scanOnOpen, onClose, dirty } = c;
  const [q, setQ] = useState("");
  const [newP, setNewP] = useState<null | { name: string; buy: string; sell: string; unit: string; barcode: string }>(null);
  const [lines, setLines] = useState<DraftLine[]>(draft?.lines ?? []);
  const [sup, setSup] = useState(draft?.supplierId ?? "");
  const [pay, setPay] = useState<PayState>(emptyPay());
  const [note, setNote] = useState("");
  const expiryOn = useFeature("expiry");
  const setLot = (i: number, k: "batch" | "expiry", v: string) => setLines(lines.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const addLine = (p: erp.Product) => setLines((l) => (l.some((x) => x.productId === p.id) ? l : [...l, { productId: p.id, qty: "1", cost: String(p.buy), disc: "0" }]));
  const results = q.trim() ? erp.searchProducts(s, q).slice(0, 6) : [];
  const lt = (l: DraftLine) => (l.amount !== undefined ? Number(l.amount) : Math.max(0, lineQty(l) * (+l.cost || 0) - (+l.disc || 0)));
  const total = Math.round(lines.reduce((a, l) => a + lt(l), 0) * 100) / 100;
  const rec = payRecord(pay, total);
  dirty.current = lines.length > 0 || !!sup || !!note.trim();
  const leave = () => { dirty.current = false; };
  const set = (i: number, k: keyof DraftLine, v: string) => setLines(lines.map((x, j) => { if (j !== i) return x; const { amount: _a, byMoney: _m, ...rest } = x; return { ...rest, [k]: v }; }));
  /** Buying in another unit keeps the same value: the cost scales with it, so a 50 Piece becomes a 1,200 Carton of 24. */
  const setUnit = (i: number, p: erp.Product, unit: string) => setLines(lines.map((x, j) => {
    if (j !== i) return x;
    const f = catalog.conversionFactor(s, unit, x.unit ?? p.unit) ?? 1;
    const { amount: _a, byMoney: _m, ...rest } = x;
    return { ...rest, unit, cost: String(Math.round((+x.cost || 0) * f * 100) / 100) };
  }));
  const confirm = () => {
    if (!sup) { toast.error(tr("Choose a supplier")); return; }
    if (payInvalid(pay, total)) { toast.error(tr("Check the payment amounts")); return; }
    const r = run(() => fin.confirmPurchase({
      // Line discounts are folded into the unit buying price so stock value and profit use the real cost.
      lines: lines.map((l) => ({ productId: l.productId, qty: lineQty(l), cost: lineQty(l) > 0 ? Math.round((lt(l) / lineQty(l)) * 1e6) / 1e6 : 0, unit: l.unit, keepCost: l.byMoney, ...(l.expiry ? { expiry: l.expiry, batch: l.batch?.trim() || undefined } : {}) })),
      pay: rec, supplierId: sup, updateCost: true, note,
    }));
    if (r) { leave(); if (draft) saveDrafts(loadDrafts().filter((d) => d.id !== draft.id)); c.open({ k: "done", id: r.id }); }
  };
  const saveDraft = () => {
    if (!lines.length) { toast.error(tr("Add products to the purchase")); return; }
    const d: Draft = { id: draft?.id ?? randomUUID(), at: Date.now(), supplierId: sup, lines, status: "draft" };
    saveDrafts([d, ...loadDrafts().filter((x) => x.id !== d.id)]); toast.success(tr("Draft saved")); leave(); go("Purchases", "Draft Purchases");
  };
  return (<div className="inventory-box dash-panel pw-page pw-form pm-form pm-new-purchase">
    <PanelHead title={tr("New Purchase")} onClose={onClose} tr={tr} />
    <div className="pur-top"><div className="inventory-field" role="group" aria-label={tr("Supplier")}><span>{tr("Supplier")} <span className="text-destructive">*</span></span>
      <SearchPicker tr={tr} items={s.suppliers.filter((x) => x.active !== false).map((x) => ({ id: x.id, label: x.name, hint: x.phone }))} value={sup} onChange={setSup} placeholder={tr("Select supplier")} addLabel={tr("Add Supplier")} withPhone onAdd={(n, ph) => run(() => fin.addSupplier(n, ph))?.id} /></div>
    <div className="inventory-field" role="group" aria-label={tr("Product")}><span>{tr("Product")}</span><ProductSearch q={q} setQ={setQ} tr={tr} scanOnOpen={!!scanOnOpen} onScan={(code) => { const p = erp.findByCode(s, code); if (p) addLine(p); else setNewP({ name: "", buy: "", sell: "", unit: "Piece", barcode: code }); }} />
      {q.trim() && !newP && !results.some((p) => p.name.toLowerCase() === q.trim().toLowerCase()) && <button type="button" className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-start text-[12px] font-semibold text-primary hover:bg-muted" onClick={() => setNewP({ name: q.trim(), buy: "", sell: "", unit: "Piece", barcode: "" })}><Plus className="h-3.5 w-3.5" /><span className="truncate">{tr("Add Product")} &quot;{q.trim()}&quot;</span></button>}
      {newP && <form className="mt-1 grid gap-1.5 rounded-md border border-border bg-card p-1.5" onSubmit={(e) => { e.preventDefault(); const p = run(() => erp.addProduct({ name: newP.name, buy: +newP.buy || 0, sell: +newP.sell || 0, qty: 0, unit: newP.unit, barcode: newP.barcode.trim() || undefined }), tr("Product added")); if (p) { addLine(p); setNewP(null); setQ(""); } }}>
        <p className="text-[11px] font-semibold">{tr("Add Product")}</p>
        <input autoFocus className="inventory-input" maxLength={120} placeholder={tr("Product name")} value={newP.name} onChange={(e) => setNewP({ ...newP, name: e.target.value })} />
        <div className="grid grid-cols-3 gap-1.5"><input className="inventory-input" inputMode="decimal" placeholder={tr("Buying price")} value={newP.buy} onChange={(e) => setNewP({ ...newP, buy: e.target.value })} /><input className="inventory-input" inputMode="decimal" placeholder={tr("Selling price")} value={newP.sell} onChange={(e) => setNewP({ ...newP, sell: e.target.value })} /><select className="inventory-input" aria-label={tr("Unit")} value={newP.unit} onChange={(e) => setNewP({ ...newP, unit: e.target.value })}>{catalog.unitNames(s, newP.unit).map((u) => <option key={u} value={u}>{tr(u)}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-1.5"><ShopButton type="button" variant="outline" className="inventory-save" onClick={() => setNewP(null)}>{tr("Cancel")}</ShopButton><ShopButton type="submit" className="inventory-save">{tr("Save")}</ShopButton></div></form>}
      {results.length > 0 && <ProductListHead tr={tr} price="Cost" />}{results.map((p) => <ProductRow key={p.id} p={p} tr={tr} price={p.buy} selected={lines.some((l) => l.productId === p.id)} onPick={() => { addLine(p); setQ(""); }} />)}</div></div>
    <div className="pur-scroll"><div className="pur-line pur-line-head"><span>{tr("Product")}</span><span>{tr("Qty")}</span><span>{tr("Cost")}</span><span>{tr("Discount")}</span><span>{tr("Total")}</span><span /></div>
      {!lines.length && <div className="pur-line pur-line-empty"><span className="pur-muted">{tr("Choose a product above")}</span><input className="inventory-input" disabled aria-label={tr("Quantity")} placeholder="0" /><input className="inventory-input" disabled aria-label={tr("Cost")} placeholder="0" /><input className="inventory-input" disabled aria-label={tr("Discount")} placeholder="0" /><input className="inventory-input" disabled aria-label={tr("Total")} placeholder="0" /><span /></div>}
      {lines.map((l, i) => { const lp = s.products.find((x) => x.id === l.productId), units = lp ? catalog.buyingUnits(s, lp) : [], stockQty = lp && l.unit ? catalog.convertQty(s, lineQty(l), l.unit, lp.unit) : null, whole = erp.isWholeUnit(l.unit ?? lp?.unit, s.units), badQty = lineQty(l) <= 0 || (whole && !Number.isInteger(lineQty(l))); return <div key={l.productId} className="pur-line"><span className="pur-line-name"><span className="truncate">{lp?.name}</span>
        {lp && units.length > 1 && <select className="inventory-input pur-unit" aria-label={`${tr("Unit")} ${lp.name}`} value={l.unit ?? units[0]} onChange={(e) => setUnit(i, lp, e.target.value)}>{units.map((u) => <option key={u} value={u}>{tr(u)}</option>)}</select>}
        {lp && l.unit && l.unit !== units[0] && stockQty !== null && <small className="pur-unit-note">= {stockQty} {tr(units[0] ?? "")}</small>}
        {(expiryOn || l.expiry || l.batch) && <span className="pur-lot">
          <input className="inventory-input" maxLength={40} aria-label={`${tr("Batch")} ${lp?.name ?? ""}`} placeholder={tr("Batch")} value={l.batch ?? ""} onChange={(e) => setLot(i, "batch", e.target.value)} />
          <input className="inventory-input" type="date" aria-label={`${tr("Expiry date")} ${lp?.name ?? ""}`} title={tr("Expiry date")} value={l.expiry ?? ""} onChange={(e) => setLot(i, "expiry", e.target.value)} />
        </span>}</span>
        <input className="inventory-input" inputMode="text" aria-label={tr("Quantity")} aria-invalid={badQty} title={whole ? `${tr("Whole numbers only for")} ${l.unit ?? lp?.unit ?? "pcs"}` : tr("Type 0.5, 1/2 or 1 3/4")} value={l.qty} onChange={(e) => set(i, "qty", e.target.value)} />
        <input className="inventory-input" inputMode="decimal" aria-label={tr("Cost")} value={l.cost} onChange={(e) => set(i, "cost", e.target.value)} />
        <input className="inventory-input" inputMode="decimal" aria-label={tr("Discount")} value={l.disc} onChange={(e) => set(i, "disc", e.target.value)} />
        <LineTotal line={l} whole={whole} label={`${tr("Total")} ${lp?.name ?? ""}`} value={lt(l)} onChange={(next) => setLines(lines.map((x, j) => (j === i ? next : x)))} />
        <button aria-label={tr("Remove")} onClick={() => setLines(lines.filter((_, j) => j !== i))}><MinusCircle className="h-4 w-4 text-destructive" /></button></div>; })}</div>
    <>
      <div className="pur-totals"><span>{tr("Total")}</span><b className="text-primary">{money(total)}</b></div>
      <PayPicker value={pay} onChange={setPay} total={total} money={money} tr={tr} creditNote="The unpaid balance is added to what you owe this supplier" />
      <label className="inventory-field"><span>{tr("Notes (Optional)")}</span><input className="inventory-input" placeholder={tr("Enter notes...")} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="grid grid-cols-[1fr_2fr] gap-1.5"><ShopButton variant="outline" className="inventory-save" onClick={saveDraft}>{tr("Save draft")}</ShopButton><ShopButton className="inventory-save" disabled={!lines.length} onClick={confirm}>{tr("Complete Purchase")}</ShopButton></div>
    </>
  </div>);
}

function PurchaseDoc({ p, s, money, tr, shop }: Pick<Ctx, "s" | "money" | "tr" | "shop"> & { p: erp.Purchase }) {
  return <div>
    <p className="text-center text-sm font-extrabold uppercase">{shop}</p>
    <p className="mt-2">{tr("Purchase No")}: {p.ref}</p><p>{tr("Date")}: {new Date(p.at).toLocaleString("en-GB")}</p><p>{tr("Supplier")}: {supName(s, p.supplierId)}</p>
    <div className="my-2 border-t border-dashed" />
    {p.items.map((i) => <div key={i.productId} className="grid grid-cols-[1fr_auto_auto_auto] gap-2"><span>{i.name}{i.bought && ` (${i.bought.qty} ${i.bought.unit})`}{i.expiry && <small className="block opacity-75">{i.batch ? `${tr("Batch")} ${i.batch} · ` : ""}{tr("Expiry date")} {i.expiry}</small>}</span><span>{i.qty}</span><span>{i.cost.toLocaleString("en-KE")}</span><span>{(i.qty * i.cost).toLocaleString("en-KE")}</span></div>)}
    <div className="my-2 border-t border-dashed" />
    <div className="flex justify-between font-bold"><span>{tr("Total")}</span><span>{money(p.total)}</span></div>
    {erp.payParts(p.pay).filter(([m]) => m !== "credit").map(([m, v]) => <div key={m} className="flex justify-between"><span>{tr(erp.methodName(m))}</span><span>{money(v)}</span></div>)}
    <div className="flex justify-between"><span>{tr("Total Paid")}</span><span>{money(paidOf(s, p))}</span></div>
    <div className="flex justify-between font-bold"><span>{tr("Balance")}</span><span>{money(fin.purchaseBalance(s, p))}</span></div>
  </div>;
}
const docText = (p: erp.Purchase, s: erp.ErpState, money: (n: number) => string, shop: string) => [shop, `${p.ref} • ${supName(s, p.supplierId)}`, ...p.items.map((i) => `${i.name} ${i.qty} × ${i.cost}`), `Total ${money(p.total)}`, `Paid ${money(paidOf(s, p))}`, `Balance ${money(fin.purchaseBalance(s, p))}`].join("\n");

function Done(c: Ctx & { id: string }) {
  const { s, tr, money, shop } = c;
  const p = s.purchases.find((x) => x.id === c.id);
  const [print, setPrint] = useState(false);
  if (!p) return <Empty>{tr("Purchase not found")}</Empty>;
  const A = ({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) => <button className="pur-action" onClick={onClick}>{icon}<span className="flex-1 text-start">{label}</span><ChevronRight className="h-4 w-4" /></button>;
  return <div className="grid gap-2">
    <div className="pur-done"><CheckCircle2 className="h-16 w-16 text-primary" /><p className="text-lg font-bold">{tr("Purchase Completed")}</p><p className="text-[11px] text-muted-foreground">{tr("Purchase")} {p.ref} {tr("has been completed successfully.")}</p></div>
    <A icon={<FileText className="h-4 w-4" />} label={tr("View Purchase")} onClick={() => c.open({ k: "detail", id: p.id })} />
    <A icon={<Printer className="h-4 w-4" />} label={tr("Print Purchase")} onClick={() => setPrint(true)} />
    <A icon={<MessageCircle className="h-4 w-4 text-primary" />} label={tr("Send Purchase (WhatsApp)")} onClick={() => { void sharePdfText(`${tr("Purchase")} ${p.ref}`, docText(p, s, money, shop)); }} />
    <BigButton onClick={() => c.open({ k: "new" })}><Plus className="h-4 w-4" />{tr("New Purchase")}</BigButton>
    <button className="pur-action" onClick={() => c.go("Purchases")}><ArrowLeft className="h-4 w-4" />{tr("Back to Purchases")}</button>
    {print && <PrintPreview title="Print Purchase" onClose={() => setPrint(false)}><PurchaseDoc p={p} s={s} money={money} tr={tr} shop={shop} /></PrintPreview>}
  </div>;
}

function PurchaseDetail(c: Ctx & { id: string }) {
  const { s, money, tr } = c;
  const [tab, setTab] = useState("Items");
  const [adding, setAdding] = useState(false);
  const [rows, setRows] = useState<{ m: erp.Method; a: string }[]>(() => [{ m: erp.defaultMethod(erp.load()), a: "" }]);
  const p = s.purchases.find((x) => x.id === c.id);
  if (!p) return <Empty>{tr("Purchase not found")}</Empty>;
  const sup = s.suppliers.find((x) => x.id === p.supplierId);
  const bal = fin.purchaseBalance(s, p);
  const st = fin.purchaseStatus(s, p);
  const rets = s.purchaseReturns.filter((r) => r.purchaseId === p.id);
  const pays = s.payments.filter((x) => x.source === p.ref || x.docRef === p.ref || (x.kind === "SUPPLIER PAYMENT" && !x.docRef && x.source === sup?.name && x.at >= p.at));
  const save = () => {
    const picked = rows.filter((r) => +r.a > 0);
    if (!picked.length) { toast.error(tr("Enter an amount")); return; }
    if (sumRows(picked) > bal + 0.001) { toast.error(tr("Amount is more than the outstanding balance")); return; }
    if (!sup || !run(() => pur.recordSupplierPayment({ supplierId: sup.id, purchaseId: p.id, parts: picked.map((r) => ({ method: r.m, amount: +r.a })) }), tr("Payment recorded"))) return;
    setAdding(false); setRows([{ m: erp.defaultMethod(s), a: "" }]);
  };
  return <div className="grid gap-1.5">
    <div className="flex items-center justify-between"><p className="inventory-form-title m-0">{tr("Purchase")} {p.ref}</p><Badge s={st} /></div>
    <Box title={sup?.name ?? tr("No supplier")}>{sup?.phone && <p className="text-[11px] text-muted-foreground">{sup.phone}</p>}<p className="text-[11px] text-muted-foreground">{new Date(p.at).toLocaleString("en-GB")}</p></Box>
    <MoneyTrio total={p.total} paid={paidOf(s, p)} balance={bal} money={money} tr={tr} />
    {bal > 0.001 && !adding && <BigButton onClick={() => setAdding(true)}><Plus className="h-4 w-4" />{tr("Add Payment")}</BigButton>}
    {adding && <div className="inventory-box grid gap-1.5"><p className="text-[11px]">{tr("Outstanding Balance")}: <b>{money(bal)}</b></p><PayRows rows={rows} setRows={setRows} tr={tr} /><ShopButton className="inventory-save" onClick={save}>{tr("Save Payment")}</ShopButton></div>}
    <Tabs small items={["Items", "Payments", "Returns", "History"]} value={tab} onChange={setTab} tr={tr} />
    <div className="inventory-box mt-0">
      {tab === "Items" && p.items.map((i) => <Row key={i.productId}><span className="pur-name">{i.name}</span><span className="pur-muted">× {i.qty}</span><span className="pur-muted">{i.cost.toLocaleString("en-KE")}</span><span className="pur-amt">{money(i.qty * i.cost)}</span></Row>)}
      {tab === "Payments" && (pays.length ? pays.map((x) => <Row key={x.id}><Dot tone="ok" /><b>{x.ref}</b><span className="pur-name">{tr(erp.methodName(x.method))}</span><span className="pur-amt">{money(Math.abs(x.amount))}</span></Row>) : <Empty>{tr("No payments yet")}</Empty>)}
      {tab === "Returns" && (rets.length ? rets.map((r) => <RetRow key={r.id} r={r} s={s} money={money} tr={tr} />) : <Empty>{tr("No returns yet")}</Empty>)}
      {tab === "History" && s.audit.filter((a) => a.detail?.includes(p.ref)).map((a) => <Row key={a.id}><span className="pur-muted">{new Date(a.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span><span className="pur-name">{tr(a.action)}</span></Row>)}
    </div>
    <ShopButton variant="outline" className="inventory-save" onClick={() => { void sharePdfText(`${tr("Purchase")} ${p.ref}`, docText(p, s, money, c.shop)); }}><Receipt className="h-4 w-4" />{tr("Send Purchase (WhatsApp)")}</ShopButton>
  </div>;
}

const REASONS = ["Damaged", "Wrong item", "Faulty", "Excess stock", "Other"];
function NewReturn({ s, money, tr, open, draft }: Ctx & { draft?: ReturnDraft | undefined }) {
  const [pid, setPid] = useState(draft?.purchaseId ?? "");
  const [qty, setQty] = useState<Record<string, string>>(draft?.qty ?? {});
  const [refund, setRefund] = useState<erp.Method>(draft?.refund ?? "credit");
  const [reason, setReason] = useState(draft?.reason ?? "");
  const [note, setNote] = useState(draft?.note ?? "");
  const purchase = s.purchases.find((x) => x.id === pid);
  const amount = purchase ? purchase.items.reduce((a, i) => a + (parseQty(qty[i.productId] ?? "") ?? 0) * i.cost, 0) : 0;
  const close = () => open(null);
  const complete = () => {
    if (!purchase) { toast.error(tr("Choose purchase")); return; }
    if (!reason) { toast.error(tr("Select reason")); return; }
    if (run(() => { fin.returnPurchase(purchase.id, Object.entries(qty).map(([productId, v]) => ({ productId, qty: erp.roundQty(parseQty(v) ?? 0) })), refund, note ? `${reason} — ${note}` : reason); return true; }, tr("Return completed"))) {
      if (draft) saveReturnDrafts(loadReturnDrafts().filter((d) => d.id !== draft.id));
      close();
    }
  };
  const keep = () => {
    if (!pid) { toast.error(tr("Choose purchase")); return; }
    const d: ReturnDraft = { id: draft?.id ?? randomUUID(), at: Date.now(), purchaseId: pid, qty, refund, reason, note };
    saveReturnDrafts([d, ...loadReturnDrafts().filter((x) => x.id !== d.id)]); toast.success(tr("Draft saved")); close();
  };
  return <div className="inventory-box dash-panel pw-page pw-form pm-form">
    <PanelHead title={tr(draft ? "Complete Return" : "New Return")} onClose={close} tr={tr} />
    <label className="inventory-field"><span>{tr("Original Purchase")} <span className="text-destructive">*</span></span><select className="inventory-input" value={pid} onChange={(e) => { setPid(e.target.value); setQty({}); }}><option value="">{tr("Choose purchase")}</option>{s.purchases.filter((p) => !pur.isCancelled(p)).map((p) => <option key={p.id} value={p.id}>{p.ref} - {supName(s, p.supplierId)}</option>)}</select></label>
    {purchase && <><label className="inventory-field"><span>{tr("Supplier")}</span><span className="inventory-input flex items-center">{supName(s, purchase.supplierId)}</span></label>
      {purchase.items.map((i) => <div key={i.productId} className="pm-receive"><span className="truncate">{i.name}</span><small>{erp.roundQty(i.qty - i.returned)} {tr("left")}</small><input className="inventory-input" placeholder="0" aria-label={`${tr("Quantity")} ${i.name}`} value={qty[i.productId] ?? ""} onChange={(e) => setQty({ ...qty, [i.productId]: e.target.value })} /></div>)}
      <label className="inventory-field"><span>{tr("Reason")} <span className="text-destructive">*</span></span><select className="inventory-input" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">{tr("Select reason")}</option>{REASONS.map((r) => <option key={r} value={r}>{tr(r)}</option>)}</select></label>
      <label className="inventory-field"><span>{tr("Refund")}</span><select className="inventory-input" value={refund} onChange={(e) => setRefund(e.target.value as erp.Method)}><option value="credit">{tr("Reduce amount owed")}</option>{fin.accounts(s).map((m) => <option key={m} value={m}>{tr("Refund")} • {tr(erp.methodName(m))}</option>)}</select></label>
      <label className="inventory-field"><span>{tr("Notes (Optional)")}</span><input className="inventory-input" placeholder={tr("Enter notes...")} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="pur-totals"><span>{tr("Return amount")}</span><b className="text-primary">{money(amount)}</b></div></>}
    <div className="pw-foot"><span /><span className="pw-foot-right"><button type="button" className="pw-btn" onClick={keep}>{tr("Save draft")}</button><button type="button" className="pw-btn is-primary" onClick={complete}>{tr("Complete Return")}</button></span></div>
  </div>;
}
