// Purchases app, menus 3 to 5 and the Overview: orders, invoices, suppliers, payments and reports. All records go through
// src/lib/purchasing.ts and src/lib/finance.ts; suppliers are the same records Contacts edits (saveContact).
import { useState, type ReactNode } from "react";
import { Banknote, CircleDollarSign, MinusCircle, PackageCheck, Plus, Printer, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Box, Dot, Empty, MoneyTrio, Row, type Tr } from "@/components/shopbook/erp-shell";
import { GlassPage } from "@/components/shopbook/glass-page";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { PayPicker, emptyPay, payInvalid, payRecord, type PayState } from "@/components/shopbook/pay-picker";
import { PrintPreview } from "@/components/shopbook/print";
import { ProductListHead, ProductRow } from "@/components/shopbook/product-catalog";
import { ProductSearch } from "@/components/shopbook/product-search";
import { Act, DataTable, ListScreen, dayMs, dayText, isoDay, type Col } from "@/components/shopbook/purchase-ui";
import { SearchPicker } from "@/components/shopbook/search-picker";
import { run } from "@/components/shopbook/selling";
import type { DateRange } from "@/lib/period";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import { saveContact } from "@/lib/people";
import * as pur from "@/lib/purchasing";
import { parseQty } from "@/lib/qty-parse";

export type Base = { s: erp.ErpState; money: (n: number) => string; tr: Tr; shop: string };
const supName = (s: erp.ErpState, id?: string) => s.suppliers.find((x) => x.id === id)?.name ?? "—";
const today = () => isoDay(Date.now());
const Status = ({ s }: { s: string }) => <Badge s={s} />;
const Field = ({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) => <label className="inventory-field"><span>{label}{required && <span className="text-destructive"> *</span>}</span>{children}</label>;
function PanelHead({ title, onClose, tr, children }: { title: string; onClose: () => void; tr: Tr; children?: ReactNode }) {
  return <div className="pw-page-head"><span className="pm-head-side">{children}</span><h2>{title}</h2><button type="button" className="pw-btn" aria-label={tr("Close")} onClick={onClose}><X /></button></div>;
}
const Foot = ({ children }: { children: ReactNode }) => <div className="pw-foot"><span /><span className="pw-foot-right">{children}</span></div>;
const Facts = ({ rows }: { rows: [string, ReactNode][] }) => <dl className="pm-facts">{rows.filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;

// ---------- Overview ----------
export function PurchasesOverview({ s, money, tr, onPurchase, go, range }: Base & { onPurchase: (id: string) => void; go: (menu: string, sub?: string) => void; range?: DateRange | undefined }) {
  const kpi = pur.purchaseKpis(s, range);
  const recent = s.purchases.slice(0, 6);
  const received = pur.stockReceived(s).slice(0, 6);
  const invoiced = s.supplierInvoices.filter((i) => pur.invoiceBalance(s, i) > 0.001).map((i) => ({ id: i.id, supplier: supName(s, i.supplierId), number: i.number, owed: pur.invoiceBalance(s, i), due: i.dueAt, status: pur.invoiceStatus(s, i) as string }));
  const covered = new Set(s.supplierInvoices.flatMap((i) => pur.invoicePurchases(s, i).map((p) => p.id)));
  const owing = [...invoiced, ...s.purchases.filter((p) => !covered.has(p.id) && fin.purchaseBalance(s, p) > 0.001).map((p) => ({ id: p.id, supplier: supName(s, p.supplierId), number: "", owed: fin.purchaseBalance(s, p), due: undefined, status: fin.purchaseStatus(s, p) as string }))].slice(0, 6);
  const activity = pur.purchaseActivity(s).slice(0, 6);
  return <div className="pm-overview">
    <KpiRow className="pm-kpis">
      <Kpi tone="info" label={tr("Total Purchases")} value={money(kpi.total)} icon={<ShoppingCart />} />
      <Kpi tone="good" label={tr("Amount Paid")} value={money(kpi.paid)} icon={<Banknote />} />
      <Kpi tone="bad" label={tr("Outstanding Balance")} value={money(kpi.outstanding)} icon={<CircleDollarSign />} />
      <Kpi tone="warn" label={tr("Stock Received")} value={money(kpi.received)} icon={<PackageCheck />} />
    </KpiRow>
    <Box title={tr("Recent Purchases")} action={() => go("Purchases", "All Purchases")}>
      {recent.length ? <DataTable rows={recent} idOf={(p) => p.id} money={money} tr={tr} actionLabel="" columns={[
        { label: "Purchase No", value: (p) => p.ref }, { label: "Supplier", value: (p) => supName(s, p.supplierId) }, { label: "Date", value: (p) => dayText(p.at) }, { label: "Total", value: (p) => p.total, money: true },
        { label: "Payment", value: (p) => fin.purchaseStatus(s, p), render: (p) => <Status s={fin.purchaseStatus(s, p)} /> }, { label: "Status", value: (p) => pur.purchaseState(p), render: (p) => <Status s={pur.purchaseState(p)} /> },
      ]} actions={(p) => <Act label={`${tr("View")} ${p.ref}`} onClick={() => onPurchase(p.id)}>{tr("View")}</Act>} /> : <Empty>{tr("No purchases yet")}</Empty>}
    </Box>
    <Box title={tr("Recent Stock Received")} action={() => go("Reports", "Stock Received Reports")}>
      {received.length ? <DataTable rows={received} idOf={(r) => r.id} money={money} tr={tr} columns={[
        { label: "Product", value: (r) => r.name }, { label: "Supplier", value: (r) => supName(s, r.supplierId) }, { label: "Quantity", value: (r) => r.qty, end: true }, { label: "Received", value: (r) => dayText(r.at) }, { label: "Purchase No", value: (r) => r.ref },
      ]} /> : <Empty>{tr("No stock received yet")}</Empty>}
    </Box>
    <Box title={tr("Outstanding Payments")} action={() => go("Orders & Invoices", "Supplier Invoices")}>
      {owing.length ? <DataTable rows={owing} idOf={(r) => r.id} money={money} tr={tr} columns={[
        { label: "Supplier", value: (r) => r.supplier }, { label: "Invoice No", value: (r) => r.number }, { label: "Owed", value: (r) => r.owed, money: true }, { label: "Due", value: (r) => dayText(r.due) }, { label: "Status", value: (r) => r.status, render: (r) => <Status s={r.status} /> },
      ]} /> : <Empty>{tr("Nothing owed to suppliers")}</Empty>}
    </Box>
    <Box title={tr("Purchase Activity")}>
      {activity.length ? activity.map((a) => <Row key={a.id}><Dot tone={/CANCEL/.test(a.action) ? "bad" : "ok"} /><span className="pur-name">{tr(a.label)}</span><span className="pur-muted pm-grow">{a.detail}</span><span className="pur-muted">{dayText(a.at)}</span></Row>) : <Empty>{tr("No activity yet")}</Empty>}
    </Box>
  </div>;
}

// ---------- Purchase orders ----------
const ORDER_STATUS = ["Draft", "Sent", "Partially Received", "Completed", "Cancelled"] as const;
type Line = { productId: string; qty: string; cost: string };

function OrderForm({ s, tr, money, order, onClose }: Base & { order?: erp.PurchaseOrder | undefined; onClose: () => void }) {
  const [sup, setSup] = useState(order?.supplierId ?? "");
  const [at, setAt] = useState(isoDay(order?.at) || today());
  const [exp, setExp] = useState(isoDay(order?.expectedAt));
  const [note, setNote] = useState(order?.note ?? "");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Line[]>(order?.lines.map((l) => ({ productId: l.productId, qty: String(l.qty), cost: String(l.cost) })) ?? []);
  const results = q.trim() ? erp.searchProducts(s, q).slice(0, 6) : [];
  const qty = (l: Line) => erp.roundQty(parseQty(l.qty) ?? 0);
  const total = lines.reduce((a, l) => a + qty(l) * (+l.cost || 0), 0);
  const save = (status?: "Draft" | "Sent") => {
    const ok = run(() => pur.saveOrder({ id: order?.id, supplierId: sup, at: dayMs(at) ?? Date.now(), expectedAt: dayMs(exp), note, status, lines: lines.map((l) => ({ productId: l.productId, qty: qty(l), cost: +l.cost || 0 })) }), tr("Order saved"));
    if (ok) onClose();
  };
  const title = tr(order ? "Edit Order" : "New Order");
  return <GlassPage label={title} onClose={onClose}><div className="inventory-box dash-panel pw-page pw-form pm-form">
    <PanelHead title={title} onClose={onClose} tr={tr} />
    <div className="inventory-field" role="group" aria-label={tr("Supplier")}><span>{tr("Supplier")} <span className="text-destructive">*</span></span>
      <SearchPicker tr={tr} items={s.suppliers.filter((x) => x.active !== false).map((x) => ({ id: x.id, label: x.name, hint: x.phone }))} value={sup} onChange={setSup} placeholder={tr("Select supplier")} addLabel={tr("Add Supplier")} withPhone onAdd={(n, ph) => run(() => fin.addSupplier(n, ph))?.id} /></div>
    <div className="pm-two"><Field label={tr("Order Date")} required><input type="date" className="inventory-input" value={at} onChange={(e) => setAt(e.target.value)} /></Field><Field label={tr("Expected Delivery")}><input type="date" className="inventory-input" value={exp} onChange={(e) => setExp(e.target.value)} /></Field></div>
    <ProductSearch q={q} setQ={setQ} tr={tr} onScan={(code) => { const p = erp.findByCode(s, code); if (p && !lines.some((l) => l.productId === p.id)) setLines([...lines, { productId: p.id, qty: "1", cost: String(p.buy) }]); }} />
    {results.length > 0 && <ProductListHead tr={tr} price="Cost" />}
    {results.map((p) => <ProductRow key={p.id} p={p} tr={tr} price={p.buy} selected={lines.some((l) => l.productId === p.id)} onPick={() => { if (!lines.some((l) => l.productId === p.id)) setLines([...lines, { productId: p.id, qty: "1", cost: String(p.buy) }]); setQ(""); }} />)}
    {lines.length > 0 && <div className="pur-scroll"><div className="pm-line pur-line-head"><span>{tr("Product")}</span><span>{tr("Qty")}</span><span>{tr("Cost")}</span><span>{tr("Total")}</span><span /></div>
      {lines.map((l, i) => { const p = s.products.find((x) => x.id === l.productId); return <div key={l.productId} className="pm-line"><span className="truncate">{p?.name}</span>
        <input className="inventory-input" aria-label={`${tr("Quantity")} ${p?.name ?? ""}`} value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
        <input className="inventory-input" inputMode="decimal" aria-label={`${tr("Cost")} ${p?.name ?? ""}`} value={l.cost} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))} />
        <span className="text-end tabular-nums">{(qty(l) * (+l.cost || 0)).toLocaleString("en-KE")}</span>
        <button type="button" aria-label={`${tr("Remove")} ${p?.name ?? ""}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><MinusCircle className="h-4 w-4 text-destructive" /></button></div>; })}</div>}
    <div className="pur-totals"><span>{tr("Total")}</span><b>{money(total)}</b></div>
    <Field label={tr("Notes (Optional)")}><input className="inventory-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    <p className="pw-note">{tr("An order doesn't change stock. Stock goes up when you receive the goods.")}</p>
    <Foot><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="button" className="pw-btn" onClick={() => save(order?.status === "Sent" ? "Sent" : "Draft")}>{tr(order?.status === "Sent" ? "Save Order" : "Save as Draft")}</button>{order?.status !== "Sent" && <button type="button" className="pw-btn is-primary" onClick={() => save("Sent")}>{tr("Save & Mark Sent")}</button>}</Foot>
  </div></GlassPage>;
}

function ReceiveOrder({ s, tr, money, order, onClose }: Base & { order: erp.PurchaseOrder; onClose: () => void }) {
  const open = order.lines.filter((l) => l.qty - l.received > 0);
  const [got, setGot] = useState<Record<string, string>>(Object.fromEntries(open.map((l) => [l.productId, String(erp.roundQty(l.qty - l.received))])));
  const [pay, setPay] = useState<PayState>(emptyPay("credit"));
  const total = Math.round(open.reduce((a, l) => a + (parseQty(got[l.productId] ?? "") ?? 0) * l.cost, 0) * 100) / 100;
  const confirm = () => {
    if (payInvalid(pay, total)) { toast.error(tr("Check the payment amounts")); return; }
    if (run(() => pur.receiveOrder(order.id, open.map((l) => ({ productId: l.productId, qty: parseQty(got[l.productId] ?? "") ?? 0 })), payRecord(pay, total)), tr("Goods received and stock updated"))) onClose();
  };
  const title = `${tr("Receive Goods")} ${order.ref}`;
  return <GlassPage label={title} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pw-form pm-form">
    <PanelHead title={title} onClose={onClose} tr={tr} />
    {open.map((l) => <div key={l.productId} className="pm-receive"><span className="truncate">{l.name}</span><small>{tr("Still to come")}: {erp.roundQty(l.qty - l.received)}</small><input className="inventory-input" aria-label={`${tr("Received")} ${l.name}`} value={got[l.productId] ?? ""} onChange={(e) => setGot({ ...got, [l.productId]: e.target.value })} /></div>)}
    <div className="pur-totals"><span>{tr("Total")}</span><b>{money(total)}</b></div>
    <PayPicker value={pay} onChange={setPay} total={total} money={money} tr={tr} creditNote="The unpaid balance is added to what you owe this supplier" />
    <Foot><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="button" className="pw-btn is-primary" onClick={confirm}>{tr("Confirm Received")}</button></Foot>
  </div></GlassPage>;
}

function OrderView({ s, tr, money, shop, order, onClose, onEdit, onReceive }: Base & { order: erp.PurchaseOrder; onClose: () => void; onEdit: () => void; onReceive: () => void }) {
  const [why, setWhy] = useState<string | null>(null);
  const received = s.purchases.filter((p) => p.orderId === order.id);
  const live = order.status !== "Completed" && order.status !== "Cancelled";
  return <GlassPage label={order.ref} onClose={onClose}><div className="inventory-box dash-panel pw-page pm-form">
    <PanelHead title={`${tr("Order")} ${order.ref}`} onClose={onClose} tr={tr}><Status s={order.status} /></PanelHead>
    <Facts rows={[[tr("Supplier"), supName(s, order.supplierId)], [tr("Order Date"), dayText(order.at)], [tr("Expected Delivery"), dayText(order.expectedAt)], [tr("Total"), money(order.total)], [tr("Notes"), order.note ?? ""], [tr("Reason"), order.cancelReason ?? ""]]} />
    <DataTable rows={order.lines} idOf={(l) => l.productId} money={money} tr={tr} columns={[{ label: "Product", value: (l) => l.name }, { label: "Ordered", value: (l) => l.qty, end: true }, { label: "Received", value: (l) => l.received, end: true }, { label: "Cost", value: (l) => l.cost, money: true }, { label: "Total", value: (l) => erp.roundQty(l.qty * l.cost), money: true }]} />
    {received.length > 0 && <Box title={tr("Goods received")}>{received.map((p) => <Row key={p.id}><b>{p.ref}</b><span className="pur-muted">{dayText(p.at)}</span><span className="pur-amt">{money(p.total)}</span></Row>)}</Box>}
    {why !== null && <div className="pm-form"><Field label={tr("Reason for cancelling")} required><input autoFocus className="inventory-input" value={why} onChange={(e) => setWhy(e.target.value)} /></Field><Foot><button type="button" className="pw-btn" onClick={() => setWhy(null)}>{tr("Keep Order")}</button><button type="button" className="pw-btn is-danger" onClick={() => { if (run(() => pur.cancelOrder(order.id, why), tr("Order cancelled")) !== undefined) onClose(); }}>{tr("Cancel Order")}</button></Foot></div>}
    {why === null && <Foot>
      {live && order.lines.every((l) => l.received === 0) && <button type="button" className="pw-btn" onClick={onEdit}>{tr("Edit")}</button>}
      {order.status === "Draft" && <button type="button" className="pw-btn" onClick={() => run(() => pur.sendOrder(order.id), tr("Order marked as sent"))}>{tr("Mark as Sent")}</button>}
      {live && <button type="button" className="pw-btn" onClick={() => setWhy("")}>{tr("Cancel Order")}</button>}
      {live && <button type="button" className="pw-btn is-primary" onClick={onReceive}>{tr("Receive Goods")}</button>}
    </Foot>}
  </div></GlassPage>;
}

export function PurchaseOrders(c: Base) {
  const { s, money, tr, shop } = c;
  const [form, setForm] = useState<{ order?: erp.PurchaseOrder } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);
  const viewed = s.purchaseOrders.find((o) => o.id === viewId), toReceive = s.purchaseOrders.find((o) => o.id === receiving);
  const columns: Col<erp.PurchaseOrder>[] = [
    { label: "Order No", value: (o) => o.ref }, { label: "Supplier", value: (o) => supName(s, o.supplierId) }, { label: "Order Date", value: (o) => dayText(o.at) }, { label: "Expected", value: (o) => dayText(o.expectedAt) },
    { label: "Products", value: (o) => o.lines.map((l) => l.name).join(", ") }, { label: "Quantities", value: (o) => o.lines.map((l) => l.qty).join(", ") }, { label: "Unit Prices", value: (o) => o.lines.map((l) => l.cost).join(", ") },
    { label: "Total", value: (o) => o.total, money: true }, { label: "Status", value: (o) => o.status, render: (o) => <Status s={o.status} /> },
  ];
  return <>
    <ListScreen title="Purchase Orders" shop={shop} items={s.purchaseOrders} columns={columns} idOf={(o) => o.id} money={money} tr={tr} empty="No orders yet" ph="Search orders..."
      text={(o) => `${o.ref} ${supName(s, o.supplierId)} ${o.lines.map((l) => l.name).join(" ")}`} when={(o) => o.at}
      filters={[{ label: "Status", get: (o) => o.status, options: ORDER_STATUS }, { label: "Supplier", get: (o) => supName(s, o.supplierId) }]}
      primary={{ label: "New Order", icon: <Plus />, onClick: () => setForm({}) }}
      actions={(o) => <><Act label={`${tr("View")} ${o.ref}`} onClick={() => setViewId(o.id)}>{tr("View")}</Act><Act label={`${tr("Edit")} ${o.ref}`} onClick={() => { if (o.lines.some((l) => l.received > 0) || o.status === "Completed" || o.status === "Cancelled") toast.error(tr("Only a draft or sent order with nothing received can be edited")); else setForm({ order: o }); }}>{tr("Edit")}</Act></>} />
    {form && <OrderForm {...c} order={form.order} onClose={() => setForm(null)} />}
    {viewed && !form && !receiving && <OrderView {...c} order={viewed} onClose={() => setViewId(null)} onEdit={() => { setViewId(null); setForm({ order: viewed }); }} onReceive={() => setReceiving(viewed.id)} />}
    {toReceive && <ReceiveOrder {...c} order={toReceive} onClose={() => setReceiving(null)} />}
  </>;
}

// ---------- Supplier invoices ----------
const INVOICE_STATUS = ["Paid", "Partially Paid", "Unpaid", "Overdue"] as const;
function InvoiceForm({ s, tr, invoice, onClose }: Base & { invoice?: erp.SupplierInvoice | undefined; onClose: () => void }) {
  const [sup, setSup] = useState(invoice?.supplierId ?? "");
  const [number, setNumber] = useState(invoice?.number ?? "");
  const [link, setLink] = useState(invoice?.purchaseId ? `p:${invoice.purchaseId}` : invoice?.orderId ? `o:${invoice.orderId}` : "");
  const [at, setAt] = useState(isoDay(invoice?.at) || today());
  const [due, setDue] = useState(isoDay(invoice?.dueAt));
  const [amount, setAmount] = useState(invoice ? String(invoice.amount) : "");
  const [note, setNote] = useState(invoice?.note ?? "");
  const purchases = s.purchases.filter((p) => p.supplierId === sup && !p.cancelled), orders = s.purchaseOrders.filter((o) => o.supplierId === sup && o.status !== "Cancelled");
  const pick = (v: string) => { setLink(v); const doc = v.startsWith("p:") ? purchases.find((p) => p.id === v.slice(2)) : orders.find((o) => o.id === v.slice(2)); if (doc && !amount) setAmount(String(doc.total)); };
  const save = () => { if (run(() => pur.saveInvoice({ id: invoice?.id, number, supplierId: sup, purchaseId: link.startsWith("p:") ? link.slice(2) : undefined, orderId: link.startsWith("o:") ? link.slice(2) : undefined, at: dayMs(at) ?? Date.now(), dueAt: dayMs(due), amount: +amount || 0, note }), tr("Invoice saved"))) onClose(); };
  const title = tr(invoice ? "Edit Invoice" : "Add Invoice");
  return <GlassPage label={title} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pw-form pm-form">
    <PanelHead title={title} onClose={onClose} tr={tr} />
    <div className="inventory-field" role="group" aria-label={tr("Supplier")}><span>{tr("Supplier")} <span className="text-destructive">*</span></span><SearchPicker tr={tr} items={s.suppliers.map((x) => ({ id: x.id, label: x.name, hint: x.phone }))} value={sup} onChange={(v) => { setSup(v); setLink(""); }} placeholder={tr("Select supplier")} addLabel={tr("Add Supplier")} withPhone onAdd={(n, ph) => run(() => fin.addSupplier(n, ph))?.id} /></div>
    <Field label={tr("Invoice Number")} required><input className="inventory-input" value={number} onChange={(e) => setNumber(e.target.value)} /></Field>
    <Field label={tr("Related Purchase or Order")} required><select className="inventory-input" value={link} onChange={(e) => pick(e.target.value)}><option value="">{tr("Choose one")}</option>{purchases.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.ref} • {p.total.toLocaleString("en-KE")}</option>)}{orders.map((o) => <option key={o.id} value={`o:${o.id}`}>{o.ref} • {o.total.toLocaleString("en-KE")}</option>)}</select></Field>
    <div className="pm-two"><Field label={tr("Invoice Date")} required><input type="date" className="inventory-input" value={at} onChange={(e) => setAt(e.target.value)} /></Field><Field label={tr("Due Date")}><input type="date" className="inventory-input" value={due} onChange={(e) => setDue(e.target.value)} /></Field></div>
    <Field label={tr("Invoice Amount")} required><input className="inventory-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
    <Field label={tr("Notes (Optional)")}><input className="inventory-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    <p className="pw-note">{tr("An invoice records the document. What you owe comes from the purchase, so it isn't counted twice.")}</p>
    <Foot><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="button" className="pw-btn is-primary" onClick={save}>{tr("Save Invoice")}</button></Foot>
  </div></GlassPage>;
}
function InvoiceDoc({ inv, s, money, tr, shop }: Base & { inv: erp.SupplierInvoice }) {
  return <div><p className="text-center text-sm font-extrabold uppercase">{shop}</p><p className="mt-2">{tr("Invoice No")}: {inv.number}</p><p>{tr("Supplier")}: {supName(s, inv.supplierId)}</p><p>{tr("Invoice Date")}: {dayText(inv.at)}</p><p>{tr("Due Date")}: {dayText(inv.dueAt)}</p><div className="my-2 border-t border-dashed" /><div className="flex justify-between font-bold"><span>{tr("Amount")}</span><span>{money(inv.amount)}</span></div><div className="flex justify-between"><span>{tr("Paid")}</span><span>{money(pur.invoicePaid(s, inv))}</span></div><div className="flex justify-between font-bold"><span>{tr("Balance")}</span><span>{money(pur.invoiceBalance(s, inv))}</span></div></div>;
}
export function SupplierInvoices(c: Base) {
  const { s, money, tr, shop } = c;
  const [form, setForm] = useState<{ invoice?: erp.SupplierInvoice } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);
  const viewed = s.supplierInvoices.find((i) => i.id === viewId), printing = s.supplierInvoices.find((i) => i.id === printId);
  const related = (i: erp.SupplierInvoice) => s.purchases.find((p) => p.id === i.purchaseId)?.ref ?? s.purchaseOrders.find((o) => o.id === i.orderId)?.ref ?? "";
  const columns: Col<erp.SupplierInvoice>[] = [
    { label: "Invoice No", value: (i) => i.number }, { label: "Supplier", value: (i) => supName(s, i.supplierId) }, { label: "Related", value: related }, { label: "Invoice Date", value: (i) => dayText(i.at) }, { label: "Due Date", value: (i) => dayText(i.dueAt) },
    { label: "Amount", value: (i) => i.amount, money: true }, { label: "Paid", value: (i) => pur.invoicePaid(s, i), money: true }, { label: "Balance", value: (i) => pur.invoiceBalance(s, i), money: true }, { label: "Status", value: (i) => pur.invoiceStatus(s, i), render: (i) => <Status s={pur.invoiceStatus(s, i)} /> },
  ];
  return <>
    <ListScreen title="Supplier Invoices" shop={shop} items={s.supplierInvoices} columns={columns} idOf={(i) => i.id} money={money} tr={tr} empty="No invoices yet" ph="Search invoices..."
      text={(i) => `${i.number} ${supName(s, i.supplierId)} ${related(i)}`} when={(i) => i.at}
      filters={[{ label: "Status", get: (i) => pur.invoiceStatus(s, i), options: INVOICE_STATUS }, { label: "Supplier", get: (i) => supName(s, i.supplierId) }]}
      primary={{ label: "Add Invoice", icon: <Plus />, onClick: () => setForm({}) }}
      actions={(i) => <><Act label={`${tr("View")} ${i.number}`} onClick={() => setViewId(i.id)}>{tr("View")}</Act><Act label={`${tr("Edit")} ${i.number}`} onClick={() => setForm({ invoice: i })}>{tr("Edit")}</Act><Act label={`${tr("Print")} ${i.number}`} onClick={() => setPrintId(i.id)}><Printer /></Act></>} />
    {form && <InvoiceForm {...c} invoice={form.invoice} onClose={() => setForm(null)} />}
    {viewed && <GlassPage label={viewed.number} onClose={() => setViewId(null)} narrow><div className="inventory-box dash-panel pw-page pm-form"><PanelHead title={`${tr("Invoice")} ${viewed.number}`} onClose={() => setViewId(null)} tr={tr}><Status s={pur.invoiceStatus(s, viewed)} /></PanelHead><Facts rows={[[tr("Supplier"), supName(s, viewed.supplierId)], [tr("Related"), related(viewed)], [tr("Invoice Date"), dayText(viewed.at)], [tr("Due Date"), dayText(viewed.dueAt)], [tr("Notes"), viewed.note ?? ""]]} /><MoneyTrio total={viewed.amount} paid={pur.invoicePaid(s, viewed)} balance={pur.invoiceBalance(s, viewed)} money={money} tr={tr} /></div></GlassPage>}
    {printing && <PrintPreview title={tr("Print Invoice")} onClose={() => setPrintId(null)}><InvoiceDoc {...c} inv={printing} /></PrintPreview>}
  </>;
}

// ---------- Suppliers ----------
function SupplierForm({ tr, supplier, onClose }: Base & { supplier?: erp.Supplier | undefined; onClose: () => void }) {
  const [f, setF] = useState({ name: supplier?.name ?? "", contact: supplier?.contact ?? "", phone: supplier?.phone ?? "", email: supplier?.email ?? "", address: supplier?.address ?? "", info: supplier?.info ?? "", notes: supplier?.notes ?? "" });
  const [active, setActive] = useState(supplier?.active !== false);
  const field = (k: keyof typeof f, label: string, req = false) => <Field label={tr(label)} required={req}><input className="inventory-input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  const title = tr(supplier ? "Edit Supplier" : "New Supplier");
  return <GlassPage label={title} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pw-form pm-form">
    <PanelHead title={title} onClose={onClose} tr={tr} />
    {field("name", "Supplier Name", true)}{field("contact", "Contact Person")}{field("phone", "Phone")}{field("email", "Email")}{field("address", "Location")}{field("info", "Business Information")}{field("notes", "Notes (Optional)")}
    <label className="pm-tick"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>{tr("Active supplier")}</span></label>
    <Foot><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="button" className="pw-btn is-primary" onClick={() => { if (run(() => saveContact("suppliers", { ...f, active }, supplier?.id), tr("Supplier saved"))) onClose(); }}>{tr("Save Supplier")}</button></Foot>
  </div></GlassPage>;
}
function SupplierView({ s, money, tr, shop, sup, onClose, onEdit }: Base & { sup: erp.Supplier; onClose: () => void; onEdit: () => void }) {
  const [printing, setPrinting] = useState(false);
  const t = pur.supplierTotals(s, sup), statement = pur.supplierStatement(s, sup);
  const purchases = s.purchases.filter((p) => p.supplierId === sup.id), invoices = s.supplierInvoices.filter((i) => i.supplierId === sup.id);
  const pays = pur.supplierPaymentRows(s).filter((p) => pur.supplierOfPayment(s, p)?.id === sup.id);
  const stColumns: Col<pur.StatementRow>[] = [{ label: "Date", value: (r) => dayText(r.at) }, { label: "Reference", value: (r) => r.ref }, { label: "Details", value: (r) => r.what }, { label: "Debit", value: (r) => r.debit, money: true }, { label: "Credit", value: (r) => r.credit, money: true }, { label: "Balance", value: (r) => r.balance, money: true }];
  return <GlassPage label={sup.name} onClose={onClose}><div className="inventory-box dash-panel pw-page pm-form">
    <PanelHead title={sup.name} onClose={onClose} tr={tr}><Status s={sup.active === false ? "Inactive" : "Active"} /></PanelHead>
    <Box title={tr("Supplier Information")}><Facts rows={[[tr("Business Information"), sup.info ?? ""], [tr("Notes"), sup.notes ?? ""], [tr("Since"), dayText(sup.createdAt)]]} /></Box>
    <Box title={tr("Contact Details")}><Facts rows={[[tr("Contact Person"), sup.contact ?? ""], [tr("Phone"), sup.phone ?? ""], [tr("Email"), sup.email ?? ""], [tr("Location"), sup.address ?? ""]]} /></Box>
    <Box title={tr("Outstanding Balance")}><MoneyTrio total={t.total} paid={t.paid} balance={sup.balance} money={money} tr={tr} /></Box>
    <Box title={tr("Purchase History")}>{purchases.length ? <DataTable rows={purchases} idOf={(p) => p.id} money={money} tr={tr} columns={[{ label: "Purchase No", value: (p) => p.ref }, { label: "Date", value: (p) => dayText(p.at) }, { label: "Total", value: (p) => p.total, money: true }, { label: "Status", value: (p) => fin.purchaseStatus(s, p), render: (p) => <Status s={fin.purchaseStatus(s, p)} /> }]} /> : <Empty>{tr("No purchases yet")}</Empty>}</Box>
    <Box title={tr("Supplier Invoices")}>{invoices.length ? <DataTable rows={invoices} idOf={(i) => i.id} money={money} tr={tr} columns={[{ label: "Invoice No", value: (i) => i.number }, { label: "Due Date", value: (i) => dayText(i.dueAt) }, { label: "Amount", value: (i) => i.amount, money: true }, { label: "Balance", value: (i) => pur.invoiceBalance(s, i), money: true }]} /> : <Empty>{tr("No invoices yet")}</Empty>}</Box>
    <Box title={tr("Payment History")}>{pays.length ? <DataTable rows={pays} idOf={(p) => p.id} money={money} tr={tr} columns={[{ label: "Reference", value: (p) => p.ref }, { label: "Date", value: (p) => dayText(p.at) }, { label: "Method", value: (p) => erp.methodName(p.method) }, { label: "Amount", value: (p) => -p.amount, money: true }]} /> : <Empty>{tr("No payments yet")}</Empty>}</Box>
    <Box title={tr("Supplier Statement")}>{statement.length ? <DataTable rows={statement} idOf={(r) => r.id} money={money} tr={tr} columns={stColumns} /> : <Empty>{tr("Nothing on this account yet")}</Empty>}</Box>
    <Foot><button type="button" className="pw-btn" onClick={() => setPrinting(true)}><Printer /><span>{tr("Print Statement")}</span></button><button type="button" className="pw-btn is-primary" onClick={onEdit}>{tr("Edit")}</button></Foot>
    {printing && <PrintPreview title={tr("Supplier Statement")} onClose={() => setPrinting(false)}><div><p className="text-center text-sm font-extrabold uppercase">{shop}</p><p className="text-center">{tr("Supplier Statement")}: {sup.name}</p><table className="pm-print"><thead><tr>{stColumns.map((c) => <th key={c.label}>{tr(c.label)}</th>)}</tr></thead><tbody>{statement.map((r) => <tr key={r.id}>{stColumns.map((c) => { const v = c.value(r); return <td key={c.label}>{c.money && typeof v === "number" ? money(v) : v}</td>; })}</tr>)}</tbody></table></div></PrintPreview>}
  </div></GlassPage>;
}
export function Suppliers(c: Base) {
  const { s, money, tr, shop } = c;
  const [form, setForm] = useState<{ supplier?: erp.Supplier } | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const viewed = s.suppliers.find((x) => x.id === viewId);
  const columns: Col<erp.Supplier>[] = [
    { label: "Supplier", value: (x) => x.name }, { label: "Contact Person", value: (x) => x.contact ?? "" }, { label: "Phone", value: (x) => x.phone ?? "" }, { label: "Email", value: (x) => x.email ?? "" }, { label: "Location", value: (x) => x.address ?? "" },
    { label: "Total Purchases", value: (x) => pur.supplierTotals(s, x).total, money: true }, { label: "Paid", value: (x) => pur.supplierTotals(s, x).paid, money: true }, { label: "Balance", value: (x) => x.balance, money: true }, { label: "Status", value: (x) => (x.active === false ? "Inactive" : "Active"), render: (x) => <Status s={x.active === false ? "Inactive" : "Active"} /> },
  ];
  return <>
    <ListScreen title="Suppliers" shop={shop} items={s.suppliers} columns={columns} idOf={(x) => x.id} money={money} tr={tr} empty="No suppliers yet" ph="Search suppliers..."
      text={(x) => `${x.name} ${x.contact ?? ""} ${x.phone ?? ""} ${x.email ?? ""} ${x.address ?? ""}`} when={(x) => x.createdAt}
      filters={[{ label: "Status", get: (x) => (x.active === false ? "Inactive" : "Active"), options: ["Active", "Inactive"] }, { label: "Balance", get: (x) => (x.balance > 0.001 ? "Owes money" : "Nothing owed"), options: ["Owes money", "Nothing owed"] }]}
      primary={{ label: "New Supplier", icon: <Plus />, onClick: () => setForm({}) }}
      actions={(x) => <><Act label={`${tr("View")} ${x.name}`} onClick={() => setViewId(x.id)}>{tr("View")}</Act><Act label={`${tr("Edit")} ${x.name}`} onClick={() => setForm({ supplier: x })}>{tr("Edit")}</Act></>} />
    {viewed && !form && <SupplierView {...c} sup={viewed} onClose={() => setViewId(null)} onEdit={() => setForm({ supplier: viewed })} />}
    {form && <SupplierForm {...c} supplier={form.supplier} onClose={() => setForm(null)} />}
  </>;
}

// ---------- Supplier payments ----------
function RecordPayment({ s, money, tr, onClose }: Base & { onClose: () => void }) {
  const [sup, setSup] = useState("");
  const [target, setTarget] = useState("");
  const [rows, setRows] = useState<{ m: erp.Method; a: string }[]>(() => [{ m: erp.defaultMethod(erp.load()), a: "" }]);
  const [note, setNote] = useState("");
  const supplier = s.suppliers.find((x) => x.id === sup);
  const invoices = s.supplierInvoices.filter((i) => i.supplierId === sup && pur.invoiceBalance(s, i) > 0.001), purchases = s.purchases.filter((p) => p.supplierId === sup && fin.purchaseBalance(s, p) > 0.001);
  const owed = target.startsWith("i:") ? pur.invoiceBalance(s, s.supplierInvoices.find((i) => i.id === target.slice(2))!) : target.startsWith("p:") ? fin.purchaseBalance(s, s.purchases.find((p) => p.id === target.slice(2))!) : supplier?.balance ?? 0;
  const paying = Math.round(rows.reduce((a, r) => a + (+r.a || 0), 0) * 100) / 100;
  const save = () => {
    if (paying > owed + 0.001) { toast.error(tr("Amount is more than the outstanding balance")); return; }
    const ok = run(() => pur.recordSupplierPayment({ supplierId: sup, purchaseId: target.startsWith("p:") ? target.slice(2) : undefined, invoiceId: target.startsWith("i:") ? target.slice(2) : undefined, parts: rows.map((r) => ({ method: r.m, amount: +r.a || 0 })), note }), tr("Payment recorded"));
    if (ok) onClose();
  };
  const title = tr("Record Payment");
  return <GlassPage label={title} onClose={onClose} narrow><div className="inventory-box dash-panel pw-page pw-form pm-form">
    <PanelHead title={title} onClose={onClose} tr={tr} />
    <div className="inventory-field" role="group" aria-label={tr("Supplier")}><span>{tr("Supplier")} <span className="text-destructive">*</span></span><SearchPicker tr={tr} items={s.suppliers.map((x) => ({ id: x.id, label: x.name, hint: x.balance > 0 ? money(x.balance) : x.phone }))} value={sup} onChange={(v) => { setSup(v); setTarget(""); }} placeholder={tr("Select supplier")} addLabel={tr("Add Supplier")} /></div>
    <Field label={tr("Pay Towards")}><select className="inventory-input" value={target} onChange={(e) => setTarget(e.target.value)}><option value="">{tr("Whole balance, oldest first")}</option>{invoices.map((i) => <option key={i.id} value={`i:${i.id}`}>{tr("Invoice")} {i.number} • {pur.invoiceBalance(s, i).toLocaleString("en-KE")}</option>)}{purchases.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.ref} • {fin.purchaseBalance(s, p).toLocaleString("en-KE")}</option>)}</select></Field>
    <div className="pur-totals"><span>{tr("Outstanding Balance")}</span><b>{money(owed)}</b></div>
    {rows.map((r, i) => <div key={i} className="pm-pay-row"><select className="inventory-input" aria-label={tr("Payment Method")} value={r.m} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, m: e.target.value as erp.Method } : x)))}>{fin.accounts(s).map((m) => <option key={m} value={m} disabled={m !== r.m && rows.some((x) => x.m === m)}>{tr(erp.methodName(m))}</option>)}</select><input className="inventory-input" inputMode="decimal" aria-label={`${tr("Amount")} ${tr(erp.methodName(r.m))}`} placeholder="0" value={r.a} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} /><button type="button" aria-label={tr("Remove")} disabled={rows.length === 1} onClick={() => setRows(rows.filter((_, j) => j !== i))}><MinusCircle className="h-4 w-4 text-destructive" /></button></div>)}
    {rows.length < fin.accounts(s).length && <button type="button" className="pw-btn" onClick={() => setRows([...rows, { m: fin.accounts(s).find((m) => !rows.some((x) => x.m === m)) ?? "cash", a: "" }])}><Plus /><span>{tr("Add Payment Method")}</span></button>}
    <div className="pur-totals"><span>{tr("Total Payment")}</span><b>{money(paying)}</b><span>{tr("Remaining Balance")}</span><b>{money(Math.max(0, owed - paying))}</b></div>
    <Field label={tr("Notes (Optional)")}><input className="inventory-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    <Foot><button type="button" className="pw-btn" onClick={onClose}>{tr("Cancel")}</button><button type="button" className="pw-btn is-primary" onClick={save}>{tr("Save Payment")}</button></Foot>
  </div></GlassPage>;
}
export function SupplierPayments(c: Base) {
  const { s, money, tr, shop } = c;
  const [adding, setAdding] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [printId, setPrintId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const rows = pur.supplierPaymentRows(s);
  const viewed = rows.find((p) => p.id === viewId), editing = rows.find((p) => p.id === editId), printing = rows.find((p) => p.id === printId);
  const who = (p: erp.Payment) => pur.supplierOfPayment(s, p)?.name ?? (p.kind === "SUPPLIER PAYMENT" ? p.source : "—");
  const columns: Col<erp.Payment>[] = [
    { label: "Reference", value: (p) => p.ref }, { label: "Supplier", value: who }, { label: "Related", value: (p) => pur.paymentFor(s, p) }, { label: "Date", value: (p) => dayText(p.at) }, { label: "Method", value: (p) => erp.methodName(p.method) }, { label: "Amount", value: (p) => -p.amount, money: true }, { label: "Recorded By", value: (p) => p.user },
  ];
  return <>
    <ListScreen title="Supplier Payments" shop={shop} items={rows} columns={columns} idOf={(p) => p.id} money={money} tr={tr} empty="No supplier payments yet" ph="Search payments..."
      text={(p) => `${p.ref} ${who(p)} ${pur.paymentFor(s, p)}`} when={(p) => p.at}
      filters={[{ label: "Method", get: (p) => erp.methodName(p.method), options: ["Cash", "M-Pesa", "Bank"] }, { label: "Supplier", get: who }]}
      primary={{ label: "Record Payment", icon: <Plus />, onClick: () => setAdding(true) }}
      actions={(p) => <><Act label={`${tr("View")} ${p.ref}`} onClick={() => setViewId(p.id)}>{tr("View")}</Act>{erp.isAdmin() && <Act label={`${tr("Edit")} ${p.ref}`} onClick={() => { setNote(p.note ?? ""); setEditId(p.id); }}>{tr("Edit")}</Act>}<Act label={`${tr("Print receipt")} ${p.ref}`} onClick={() => setPrintId(p.id)}><Printer /></Act></>} />
    {adding && <RecordPayment {...c} onClose={() => setAdding(false)} />}
    {viewed && <GlassPage label={viewed.ref} onClose={() => setViewId(null)} narrow><div className="inventory-box dash-panel pw-page pm-form"><PanelHead title={`${tr("Payment")} ${viewed.ref}`} onClose={() => setViewId(null)} tr={tr} /><Facts rows={[[tr("Supplier"), who(viewed)], [tr("Related"), pur.paymentFor(s, viewed)], [tr("Date"), dayText(viewed.at)], [tr("Method"), tr(erp.methodName(viewed.method))], [tr("Amount"), money(-viewed.amount)], [tr("Recorded By"), viewed.user], [tr("Notes"), viewed.note ?? ""]]} /></div></GlassPage>}
    {editing && <GlassPage label={editing.ref} onClose={() => setEditId(null)} narrow><div className="inventory-box dash-panel pw-page pw-form pm-form"><PanelHead title={`${tr("Edit Payment")} ${editing.ref}`} onClose={() => setEditId(null)} tr={tr} /><Facts rows={[[tr("Amount"), money(-editing.amount)], [tr("Method"), tr(erp.methodName(editing.method))]]} /><Field label={tr("Notes")}><input autoFocus className="inventory-input" value={note} onChange={(e) => setNote(e.target.value)} /></Field><p className="pw-note">{tr("The amount and method of a recorded payment stay as they are, so balances and the audit trail stay true.")}</p><Foot><button type="button" className="pw-btn" onClick={() => setEditId(null)}>{tr("Cancel")}</button><button type="button" className="pw-btn is-primary" onClick={() => { if (run(() => pur.editPaymentNote(editing.id, note), tr("Payment updated")) !== undefined) setEditId(null); }}>{tr("Save")}</button></Foot></div></GlassPage>}
    {printing && <PrintPreview title={tr("Payment Receipt")} onClose={() => setPrintId(null)}><div><p className="text-center text-sm font-extrabold uppercase">{shop}</p><p className="text-center">{tr("Payment Receipt")}</p><p className="mt-2">{tr("Reference")}: {printing.ref}</p><p>{tr("Supplier")}: {who(printing)}</p><p>{tr("Date")}: {new Date(printing.at).toLocaleString("en-GB")}</p><p>{tr("Method")}: {tr(erp.methodName(printing.method))}</p>{pur.paymentFor(s, printing) && <p>{tr("Related")}: {pur.paymentFor(s, printing)}</p>}<div className="my-2 border-t border-dashed" /><div className="flex justify-between font-bold"><span>{tr("Amount")}</span><span>{money(-printing.amount)}</span></div></div></PrintPreview>}
  </>;
}

// ---------- Reports ----------
export function PurchaseReports({ s, money, tr, shop, view }: Base & { view: string }) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sum = <T,>(rows: T[], f: (x: T) => number) => r2(rows.reduce((a, x) => a + f(x), 0));
  const base = { shop, money, tr, ph: "Search report..." };
  if (view === "Supplier Reports") return <ListScreen key={view} {...base} title={view} items={s.suppliers} idOf={(x) => x.id} empty="No suppliers yet" text={(x) => `${x.name} ${x.phone ?? ""}`}
    filters={[{ label: "Balance", get: (x) => (x.balance > 0.001 ? "Owes money" : "Nothing owed"), options: ["Owes money", "Nothing owed"] }]}
    summary={(rows) => [["Suppliers", String(rows.length)], ["Purchases", money(sum(rows, (x) => pur.supplierTotals(s, x).total))], ["Outstanding", money(sum(rows, (x) => x.balance))]]}
    columns={[{ label: "Supplier", value: (x) => x.name }, { label: "Purchases Made", value: (x) => pur.supplierTotals(s, x).count, end: true }, { label: "Total Purchases", value: (x) => pur.supplierTotals(s, x).total, money: true }, { label: "Paid", value: (x) => pur.supplierTotals(s, x).paid, money: true }, { label: "Returns", value: (x) => pur.supplierTotals(s, x).returns, money: true }, { label: "Balance", value: (x) => x.balance, money: true }, { label: "Last Activity", value: (x) => dayText(s.purchases.find((p) => p.supplierId === x.id)?.at) }]} />;
  if (view === "Payment Reports") { const rows0 = pur.supplierPaymentRows(s); const who = (p: erp.Payment) => pur.supplierOfPayment(s, p)?.name ?? p.source; return <ListScreen key={view} {...base} title={view} items={rows0} idOf={(p) => p.id} empty="No supplier payments yet" text={(p) => `${p.ref} ${who(p)} ${pur.paymentFor(s, p)}`} when={(p) => p.at}
    filters={[{ label: "Method", get: (p) => erp.methodName(p.method), options: ["Cash", "M-Pesa", "Bank"] }, { label: "Supplier", get: who }]}
    summary={(rows) => [["Total Payments", money(sum(rows, (p) => -p.amount))], ...fin.shownAccounts(s).map((m) => [erp.methodName(m), money(sum(rows.filter((p) => p.method === m), (p) => -p.amount))] as [string, string]), ["Outstanding", money(sum(s.suppliers, (x) => x.balance))]]}
    columns={[{ label: "Reference", value: (p) => p.ref }, { label: "Date", value: (p) => dayText(p.at) }, { label: "Supplier", value: who }, { label: "Related", value: (p) => pur.paymentFor(s, p) }, { label: "Method", value: (p) => erp.methodName(p.method) }, { label: "Amount", value: (p) => -p.amount, money: true }]} />; }
  if (view === "Returns Reports") { const items = s.purchaseReturns.flatMap((r) => r.items.map((i) => ({ ...i, id: `${r.id}-${i.productId}`, at: r.at, ref: r.ref, purchaseRef: r.purchaseRef, reason: r.reason ?? "", supplier: supName(s, s.purchases.find((p) => p.id === r.purchaseId)?.supplierId) }))); return <ListScreen key={view} {...base} title={view} items={items} idOf={(i) => i.id} empty="No returns yet" text={(i) => `${i.ref} ${i.purchaseRef} ${i.name} ${i.supplier}`} when={(i) => i.at}
    filters={[{ label: "Supplier", get: (i) => i.supplier }]}
    summary={(rows) => [["Total Returns", String(new Set(rows.map((i) => i.ref)).size)], ["Returned Quantity", String(erp.roundQty(rows.reduce((a, i) => a + i.qty, 0)))], ["Return Value", money(sum(rows, (i) => i.amount))]]}
    columns={[{ label: "Return No", value: (i) => i.ref }, { label: "Date", value: (i) => dayText(i.at) }, { label: "Purchase No", value: (i) => i.purchaseRef }, { label: "Supplier", value: (i) => i.supplier }, { label: "Product", value: (i) => i.name }, { label: "Quantity", value: (i) => i.qty, end: true }, { label: "Value", value: (i) => i.amount, money: true }, { label: "Reason", value: (i) => i.reason }]} />; }
  if (view === "Stock Received Reports") return <ListScreen key={view} {...base} title={view} items={pur.stockReceived(s)} idOf={(r) => r.id} empty="No stock received yet" text={(r) => `${r.name} ${r.ref} ${supName(s, r.supplierId)}`} when={(r) => r.at}
    filters={[{ label: "Supplier", get: (r) => supName(s, r.supplierId) }]}
    summary={(rows) => [["Products Received", String(new Set(rows.map((r) => r.productId)).size)], ["Quantity Received", String(erp.roundQty(rows.reduce((a, r) => a + r.qty, 0)))]]}
    columns={[{ label: "Product", value: (r) => r.name }, { label: "Quantity", value: (r) => r.qty, end: true }, { label: "Received", value: (r) => dayText(r.at) }, { label: "Purchase No", value: (r) => r.ref }, { label: "Supplier", value: (r) => supName(s, r.supplierId) }]} />;
  return <ListScreen key={view} {...base} title="Purchase Reports" items={s.purchases} idOf={(p) => p.id} empty="No purchases yet" text={(p) => `${p.ref} ${supName(s, p.supplierId)} ${p.items.map((i) => i.name).join(" ")}`} when={(p) => p.at}
    filters={[{ label: "Status", get: pur.purchaseState, options: ["Completed", "Partly Returned", "Returned", "Cancelled"] }, { label: "Supplier", get: (p) => supName(s, p.supplierId) }]}
    summary={(rows) => [["Total Purchase Value", money(sum(rows, (p) => p.total))], ["Purchases", String(rows.length)], ["Quantity Bought", String(erp.roundQty(rows.reduce((a, p) => a + pur.purchaseTotalQty(p), 0)))]]}
    columns={[{ label: "Purchase No", value: (p) => p.ref }, { label: "Date", value: (p) => dayText(p.at) }, { label: "Supplier", value: (p) => supName(s, p.supplierId) }, { label: "Quantity", value: pur.purchaseTotalQty, end: true }, { label: "Total", value: (p) => p.total, money: true }, { label: "Status", value: pur.purchaseState, render: (p) => <Status s={pur.purchaseState(p)} /> }]} />;
}
