// Dashboard refinements (owner's reference design, 2026-11-26): the announcement ticker and the one Recent Transactions section
// (tabs Recent Transactions · Sales · Purchases · Cash Moves, one row per transaction, and a Share menu). Read-only over real records.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowLeftRight, ArrowRight, ChevronDown, Copy, FileSpreadsheet, FileText, List, Mail,
  Megaphone, MessageCircle, MessageSquare, Share2, ShoppingBasket, ShoppingCart,
} from "lucide-react";
import { cachedAnnouncements, refreshAnnouncements, visibleAnnouncements, dismissedIds, type Announcement } from "@/lib/announcements";
import { methodLabel, payLines, type Audit, type ErpState, type Sale } from "@/lib/erp";
import { smsLink, waLink } from "@/lib/whatsapp";
import { openAsPdf } from "@/lib/share-pdf";
import { sharePdfTable } from "@/components/shopbook/print";
import { downloadBlob } from "@/lib/download";
import { xlsxBytes } from "@/lib/product-export";
import { cn } from "@/lib/utils";

type Tr = (t: string) => string;

/* ---------------- Announcement ticker ---------------- */
// Only recognizable operational events with a named actor are shown. The caller supplies
// the already business/location-scoped audit copy and checks the existing audit permission.
const ACTIVITY_ACTIONS = new Set(["SALE", "SALES RETURN", "SALE PAYMENT", "DEBT PAYMENT", "PURCHASE", "PURCHASE RETURN", "STOCK IN", "STOCK OUT", "STOCK ADJUSTMENT", "TRANSFER SENT", "TRANSFER RECEIVED", "CASH UP", "EXPENSE"]);
export function staffActivity(audit: readonly Audit[], allowed: boolean) {
  if (!allowed) return [];
  return audit.filter((a) => ACTIVITY_ACTIONS.has(a.action) && !!a.user?.trim() && a.user.trim().toLowerCase() !== "admin")
    .slice().sort((a, b) => b.at - a.at).slice(0, 20);
}
export function AnnouncementTicker({ tr, audit = [], canViewActivity = false }: { tr: Tr; audit?: readonly Audit[]; canViewActivity?: boolean }) {
  const [list, setList] = useState<Announcement[]>([]);
  const [i, setI] = useState(0);
  useEffect(() => {
    const show = (l: Announcement[]) => setList(visibleAnnouncements(l, Date.now(), dismissedIds()));
    show(cachedAnnouncements().list);
    void refreshAnnouncements().then((r) => show(r.list)).catch(() => undefined);
  }, []);
  const activity = staffActivity(audit, canViewActivity).map((a) => ({ id: `activity-${a.id}`, message: `${a.user} · ${tr(a.action)} · ${new Date(a.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` }));
  const messages = [...list, ...activity];
  const n = messages.length, now = n ? messages[i % n]! : null;
  const step = (d: number) => n && setI((x) => (x + d + n) % n);
  return (
    <section className={cn("dash-ticker", !now && "is-empty")} aria-label={tr("Announcement")}>
      <span className="dash-ticker-label"><Megaphone aria-hidden /> {tr("Announcement")}:</span>
      <span className="dash-ticker-sep" aria-hidden />
      <span className="dash-ticker-window">
        <span key={now?.id ?? "none"} className="dash-ticker-text">
          {now ? now.message : tr("No announcements right now")}
        </span>
      </span>
      <span className="dash-ticker-ctrl">
        <button type="button" onClick={() => step(-1)} disabled={n < 2} aria-label={tr("Previous announcement")}><ArrowLeft /></button>
        <button type="button" onClick={() => step(1)} disabled={n < 2} aria-label={tr("Next announcement")}><ArrowRight /></button>
      </span>
    </section>
  );
}

/* ---------------- Recent Transactions ---------------- */
type Move = { id: string; ref: string; at: number; kind: string; amount: number; method: string };
type Row = { key: string; ref: string; type: "Sale" | "Purchase" | "Cash Move"; details: string; amount: number; method: string; methodKey: string; at: number; sale?: Sale; to: string };
/** The most rows the list holds; older ones are in each app's own lists. */
export const TX_LIMIT = 100;
const TABS = ["Recent Transactions", "Sales", "Purchases", "Cash Moves"] as const;
type Tab = (typeof TABS)[number];
const MOVE_LABEL: Record<string, string> = {
  SALE: "Sale receipt", DEBT: "Customer payment", REFUND: "Customer refund", PURCHASE: "Purchase payment", "SUPPLIER PAYMENT": "Supplier payment",
  "SUPPLIER REFUND": "Supplier refund", EXPENSE: "Expense", DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", "CASH IN": "Cash in", "CASH OUT": "Cash out",
};
const when = (t: number) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });

export function RecentTransactions({ s, moves, cur, tr, shop, phone, country, staff, summary, onSale }: {
  s: ErpState; moves: Move[]; cur: string; tr: Tr; shop: string; phone?: string | undefined; country?: string | undefined; staff: boolean;
  summary: () => string; onSale: (sale: Sale) => void;
}) {
  const [tab, setTab] = useState<Tab>("Recent Transactions");
  const [shareOpen, setShareOpen] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shareOpen) return;
    const close = (e: MouseEvent) => { if (!shareRef.current?.contains(e.target as Node)) setShareOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [shareOpen]);

  const methodName = (m: string) => (m === "credit" ? tr("Credit") : methodLabel(m, s, tr));
  const all = useMemo<Row[]>(() => {
    const sales: Row[] = s.sales.map((x) => {
      const lines = payLines(s, x.pay), main = lines[0]?.[0] ?? "cash";
      const who = s.customers.find((c) => c.id === x.customerId)?.name ?? tr("Walk-in");
      return { key: `s-${x.id}`, ref: x.ref, type: "Sale", details: `${tr("Customer")}: ${who}`, amount: x.total, method: lines.map(([m]) => methodName(m)).join(" + ") || methodName(main), methodKey: lines.length > 1 ? "mixed" : main, at: x.at, sale: x, to: "/sales" };
    });
    const purchases: Row[] = s.purchases.map((p) => {
      const lines = payLines(s, p.pay), main = lines[0]?.[0] ?? "cash";
      return { key: `p-${p.id}`, ref: p.ref, type: "Purchase", details: s.suppliers.find((x) => x.id === p.supplierId)?.name ?? p.items.map((i) => i.name).join(", "), amount: -p.total, method: lines.map(([m]) => methodName(m)).join(" + ") || methodName(main), methodKey: lines.length > 1 ? "mixed" : main, at: p.at, to: "/purchases" };
    });
    // A cash move keeps the method's name ("M-Pesa"), not its code: show it as it is and pick the icon from the name.
    const keyOf = (m: string) => { const k = m.toLowerCase().replace(/[^a-z]/g, ""); return k === "mpesa" ? "mpesa" : k === "cash" ? "cash" : k === "bank" ? "bank" : m; };
    const isCode = (m: string) => ["cash", "mpesa", "bank", "credit"].includes(m) || m.startsWith("acct-");
    const cash: Row[] = moves.map((m) => ({ key: `m-${m.id}`, ref: m.ref, type: "Cash Move", details: tr(MOVE_LABEL[m.kind] ?? m.kind), amount: m.amount, method: isCode(m.method) ? methodName(m.method) : tr(m.method), methodKey: keyOf(m.method), at: m.at, to: "/float" }));
    return [...sales, ...purchases, ...cash].sort((a, b) => b.at - a.at);
  }, [s, moves, tr]);
  const filtered = tab === "Recent Transactions" ? all : all.filter((r) => r.type === (tab === "Sales" ? "Sale" : tab === "Purchases" ? "Purchase" : "Cash Move"));
  // One list, newest first; it fills the space left on the page and scrolls inside its own box (owner, 2026-11-26).
  const rows = filtered.slice(0, TX_LIMIT);

  const money = (n: number) => `${n < 0 ? "-" : ""}${cur} ${Math.round(Math.abs(n)).toLocaleString()}`;
  const head = [tr("No."), tr("Type"), tr("Details"), tr("Amount"), tr("Payment"), tr("Date & Time")];
  const table = rows.map((r) => [r.ref, tr(r.type), r.details, money(r.amount), r.method, when(r.at)]);
  const title = `${shop} · ${tr(tab)}`;
  const text = [title, ...rows.map((r) => `${r.ref} · ${tr(r.type)} · ${r.details} · ${money(r.amount)} · ${r.method} · ${when(r.at)}`)].join("\n");
  const run = (f: () => void | Promise<unknown>) => { setShareOpen(false); void Promise.resolve(f()).catch(() => toast.error(tr("That couldn't be shared. Try again."))); };
  const share = [
    { icon: MessageCircle, label: "WhatsApp", cls: "is-wa", go: () => openAsPdf(waLink(text, phone, country)) },
    { icon: MessageSquare, label: tr("Messages (SMS)"), cls: "is-sms", go: () => openAsPdf(smsLink(text, phone), "_self") },
    { icon: Mail, label: tr("Email"), cls: "is-mail", go: () => { window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`; } },
    { icon: Copy, label: tr("Copy Link"), cls: "is-link", go: async () => { await navigator.clipboard.writeText(`${window.location.origin}/dashboard`); toast.success(tr("Link copied")); } },
    { icon: FileText, label: tr("Export (PDF)"), cls: "is-pdf", go: () => sharePdfTable(title, when(Date.now()), head, table) },
    { icon: FileSpreadsheet, label: tr("Export (Excel)"), cls: "is-xls", go: async () => { const XLSX = await import("xlsx"); downloadBlob(new Blob([xlsxBytes(XLSX, head, table)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `dataquill-solutions-transactions-${new Date().toISOString().slice(0, 10)}.xlsx`); } },
    ...(staff ? [] : [{ icon: List, label: tr("Today's summary (WhatsApp)"), cls: "is-wa", go: () => openAsPdf(waLink(summary(), phone, country)) }]),
  ];

  return (
    <section className="dash-panel dash-tx">
      <header className="dash-tx-head">
        <div className="dash-tx-tabs" role="tablist" aria-label={tr("Recent Transactions")}>
          {TABS.map((t) => {
            const Icon = t === "Recent Transactions" ? List : t === "Sales" ? ShoppingCart : t === "Purchases" ? ShoppingBasket : ArrowLeftRight;
            return <button key={t} type="button" role="tab" aria-selected={tab === t} className={cn("dash-tx-tab", tab === t && "is-on")} onClick={() => setTab(t)}><Icon aria-hidden /> {tr(t)}</button>;
          })}
        </div>
        <div className="dash-tx-share" ref={shareRef}>
          <button type="button" className="dash-tx-share-btn" aria-label={tr("Share")} aria-haspopup="menu" aria-expanded={shareOpen} onClick={() => setShareOpen(!shareOpen)}><Share2 className="dash-share-icon" aria-hidden /><span className="dash-share-text">{tr("Share")}</span><ChevronDown className="dash-share-chevron" aria-hidden /></button>
          {shareOpen && <div className="dash-tx-menu" role="menu">
            {share.map((x) => <button key={x.label} type="button" role="menuitem" className={x.cls} onClick={() => run(x.go)}><x.icon aria-hidden /> {x.label}</button>)}
          </div>}
        </div>
      </header>
      <div className="dash-tx-table" role="table" aria-label={tr(tab)}>
        {rows.length > 0 && <div className="dash-tx-row is-head" role="row">
          <span role="columnheader" className="dash-tx-when">{tr("Date & Time")}</span>
          <span role="columnheader" className="dash-tx-ref">{tr("No.")}</span>
          <span role="columnheader" className="dash-tx-type">{tr("Type")}</span>
          <span role="columnheader" className="dash-tx-details">{tr("Details")}</span>
          <span role="columnheader" className="dash-tx-method">{tr("Payment")}</span>
          <span role="columnheader" className="dash-tx-amount">{tr("Amount")}</span>
        </div>}
        {rows.map((r) => {
          const description = `${tr(r.type)} · ${r.ref} · ${r.details} · ${r.method} · ${money(r.amount)} · ${when(r.at)}`;
          const body = <>
            <span role="cell" className="dash-tx-when">{when(r.at)}</span>
            <span role="cell" className="dash-tx-ref">{r.ref}</span>
            <span role="cell" className="dash-tx-type"><b className={cn("dash-tx-badge", `is-${r.type === "Sale" ? "sale" : r.type === "Purchase" ? "purchase" : "move"}`)}>{tr(r.type)}</b></span>
            <span role="cell" className="dash-tx-details">{r.details}<small>{r.ref} · {when(r.at)}</small></span>
            <span role="cell" className={cn("dash-tx-method", `is-${r.methodKey}`)}>{r.method}</span>
            <span role="cell" className={cn("dash-tx-amount", r.amount < 0 ? "is-out" : "is-in")}>{money(r.amount)}</span>
          </>;
          return r.sale
            ? <button key={r.key} type="button" role="row" className="dash-tx-row" title={description} aria-label={description} onClick={() => onSale(r.sale!)}>{body}</button>
            : <Link key={r.key} to={r.to} role="row" className="dash-tx-row" title={description} aria-label={description}>{body}</Link>;
        })}
        {!rows.length && <p className="dash-tx-empty">{tr("No transactions yet")} · <Link to="/pos">{tr("Record a sale")} <ArrowRight /></Link></p>}
      </div>
    </section>
  );
}
