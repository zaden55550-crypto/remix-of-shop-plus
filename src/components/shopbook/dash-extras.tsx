// Dashboard refinements (owner's reference design, 2026-11-26): the announcement ticker and the one Recent Transactions section
// (tabs Recent Transactions · Sales · Purchases · Cash Moves, one row per transaction, and a Share menu). Read-only over real records.
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CalendarDays, ChevronDown, ChevronUp, Copy, FileSpreadsheet, FileText, Filter, List, Mail,
  Megaphone, MessageCircle, MessageSquare, Search, Share2,
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
      <span className="dash-ticker-label"><Megaphone aria-hidden /> {tr("Announcements")}</span>
      <i className={cn("dash-ticker-dot", !now && "is-off")} aria-hidden />
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
/** Rows per column before Show More (owner, 2026-11-26). */
export const PER_COLUMN = 8;
/** Two columns where there is room: laptops and desktops (a fine pointer and a wide window), or any very wide screen. */
export const twoColumns = () => typeof window !== "undefined" && (window.innerWidth >= 1400 || (window.innerWidth >= 1100 && !window.matchMedia?.("(pointer: coarse)").matches));
const TABS = ["Recent Transactions", "Sales", "Purchases", "Cash Moves"] as const;
type Tab = (typeof TABS)[number];
const MOVE_LABEL: Record<string, string> = {
  SALE: "Sale receipt", DEBT: "Customer payment", REFUND: "Customer refund", PURCHASE: "Purchase payment", "SUPPLIER PAYMENT": "Supplier payment",
  "SUPPLIER REFUND": "Supplier refund", EXPENSE: "Expense", DEPOSIT: "Deposit", WITHDRAWAL: "Withdrawal", "CASH IN": "Cash in", "CASH OUT": "Cash out",
};
const whenShort = (t: number) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", hour12: true }).replace(" am", "am").replace(" pm", "pm");
const when = (t: number) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });

export function RecentTransactions({ s, moves, cur, tr, shop, phone, country, staff, summary, onSale }: {
  s: ErpState; moves: Move[]; cur: string; tr: Tr; shop: string; phone?: string | undefined; country?: string | undefined; staff: boolean;
  summary: () => string; onSale: (sale: Sale) => void;
}) {
  const [tab, setTab] = useState<Tab>("Recent Transactions");
  const [shareOpen, setShareOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false), [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false), [method, setMethod] = useState("");
  // Laptops and desktops: two columns of eight; phones and iPads: one column of eight (owner, 2026-11-26).
  const [cols, setCols] = useState(1);
  const [pages, setPages] = useState(1);
  useEffect(() => {
    const update = () => setCols(twoColumns() ? 2 : 1);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
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
    // A cash move keeps the method's name ("M-Pesa"), not its code: show it as it is and pick the colour from the name.
    const keyOf = (m: string) => { const k = m.toLowerCase().replace(/[^a-z]/g, ""); return k === "mpesa" ? "mpesa" : k === "cash" ? "cash" : k === "bank" ? "bank" : m; };
    const isCode = (m: string) => ["cash", "mpesa", "bank", "credit"].includes(m) || m.startsWith("acct-");
    const cash: Row[] = moves.map((m) => ({ key: `m-${m.id}`, ref: m.ref, type: "Cash Move", details: tr(MOVE_LABEL[m.kind] ?? m.kind), amount: m.amount, method: isCode(m.method) ? methodName(m.method) : tr(m.method), methodKey: keyOf(m.method), at: m.at, to: "/float" }));
    return [...sales, ...purchases, ...cash].sort((a, b) => b.at - a.at);
  }, [s, moves, tr]);
  const ofTab = tab === "Recent Transactions" ? all : all.filter((r) => r.type === (tab === "Sales" ? "Sale" : tab === "Purchases" ? "Purchase" : "Cash Move"));
  const methods = [...new Set(ofTab.map((r) => r.method))].sort();
  const q = query.trim().toLowerCase();
  const filtered = ofTab.filter((r) => (!method || r.method === method) && (!q || `${r.ref} ${r.details} ${r.method} ${tr(r.type)} ${Math.round(Math.abs(r.amount))} ${when(r.at)}`.toLowerCase().includes(q)));
  // Eight per column to start; Show More adds eight more to every column, Show Less goes back.
  const step = cols * PER_COLUMN, shown = Math.min(filtered.length, pages * step);
  const rows = filtered.slice(0, shown);
  const half = Math.ceil(rows.length / cols);
  const columns = cols === 2 ? [rows.slice(0, half), rows.slice(half)].filter((c) => c.length) : [rows];

  const money = (n: number) => `${n < 0 ? "-" : ""}${cur} ${Math.round(Math.abs(n)).toLocaleString()}`;
  const head = [tr("Type"), tr("Reference"), tr("Details"), tr("Payment"), tr("Amount"), tr("Date & Time")];
  const table = rows.map((r) => [tr(r.type), r.ref, r.details, r.method, money(r.amount), when(r.at)]);
  const title = `${shop} · ${tr(tab)}`;
  const text = [title, ...rows.map((r) => `${tr(r.type)} · ${r.ref} · ${r.details} · ${r.method} · ${money(r.amount)} · ${when(r.at)}`)].join("\n");
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
  const viewAll = tab === "Sales" ? "/sales" : tab === "Purchases" ? "/purchases" : tab === "Cash Moves" ? "/float" : "/accounting";
  const typeCls = (t: Row["type"]) => (t === "Sale" ? "sale" : t === "Purchase" ? "purchase" : "move");

  return (
    <section className="dash-panel dash-tx" data-columns={cols}>
      <header className="dash-tx-head">
        <h2 className="dash-panel-title"><CalendarDays className="dash-panel-icon" aria-hidden />{tr("Recent Transactions")}</h2>
        <div className="dash-tx-tabs" role="tablist" aria-label={tr("Recent Transactions")}>
          {TABS.map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} aria-label={tr(t)} className={cn("dash-tx-tab", tab === t && "is-on")} onClick={() => { setTab(t); setPages(1); setMethod(""); }}>{t === "Recent Transactions" ? tr("All") : tr(t)}</button>)}
        </div>
        <div className="dash-tx-tools">
          <button type="button" className={cn("dash-tx-icon", searchOpen && "is-on")} aria-label={tr("Search")} aria-pressed={searchOpen} onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }}><Search aria-hidden /></button>
          <button type="button" className={cn("dash-tx-icon", (filterOpen || method) && "is-on")} aria-label={tr("Filter")} aria-pressed={filterOpen} onClick={() => setFilterOpen(!filterOpen)}><Filter aria-hidden /></button>
          <div className="dash-tx-share" ref={shareRef}>
            <button type="button" className="dash-tx-icon dash-tx-share-btn" aria-label={tr("Share")} aria-haspopup="menu" aria-expanded={shareOpen} onClick={() => setShareOpen(!shareOpen)}><Share2 aria-hidden /></button>
            {shareOpen && <div className="dash-tx-menu" role="menu">
              {share.map((x) => <button key={x.label} type="button" role="menuitem" className={x.cls} onClick={() => run(x.go)}><x.icon aria-hidden /> {x.label}</button>)}
            </div>}
          </div>
          <span className="dash-tx-divider" aria-hidden />
          <Link to={viewAll} className="dash-view-all">{tr("View All")} <ArrowRight aria-hidden /></Link>
        </div>
      </header>
      {(searchOpen || filterOpen) && <div className="dash-tx-find">
        {searchOpen && <input autoFocus type="search" value={query} onChange={(e) => { setQuery(e.target.value); setPages(1); }} placeholder={tr("Search")} aria-label={tr("Search")} />}
        {filterOpen && <select value={method} onChange={(e) => { setMethod(e.target.value); setPages(1); }} aria-label={tr("Payment")}>
          <option value="">{tr("All payment methods")}</option>
          {methods.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>}
      </div>}
      <div className="dash-tx-table" role="table" aria-label={tr(tab)}>
        {columns.map((column, i) => <div className="dash-tx-column" role="rowgroup" key={i}>
          <div className="dash-tx-row is-head" role="row">
            <span role="columnheader" className="dash-tx-type">{tr("Type")}</span>
            <span role="columnheader" className="dash-tx-ref">{tr("Reference")}</span>
            <span role="columnheader" className="dash-tx-details">{tr("Details")}</span>
            <span role="columnheader" className="dash-tx-method">{tr("Payment")}</span>
            <span role="columnheader" className="dash-tx-amount">{tr("Amount")}</span>
            <span role="columnheader" className="dash-tx-when">{tr("Date & Time")}</span>
          </div>
          {column.map((r) => {
            const description = `${tr(r.type)} · ${r.ref} · ${r.details} · ${r.method} · ${money(r.amount)} · ${when(r.at)}`;
            const body = <>
              <span role="cell" className="dash-tx-type"><b className={cn("dash-tx-badge", `is-${typeCls(r.type)}`)}>{tr(r.type)}</b></span>
              <span role="cell" className="dash-tx-ref">{r.ref}</span>
              <span role="cell" className="dash-tx-details">{r.details}</span>
              <span role="cell" className={cn("dash-tx-method", `is-${r.methodKey}`)}>{r.method}</span>
              <span role="cell" className={cn("dash-tx-amount", r.amount < 0 ? "is-out" : "is-in")}>{money(r.amount)}</span>
              <span role="cell" className="dash-tx-when"><span className="dash-when-full">{when(r.at)}</span><span className="dash-when-short">{whenShort(r.at)}</span></span>
            </>;
            return r.sale
              ? <button key={r.key} type="button" role="row" className="dash-tx-row" title={description} aria-label={description} onClick={() => onSale(r.sale!)}>{body}</button>
              : <Link key={r.key} to={r.to} role="row" className="dash-tx-row" title={description} aria-label={description}>{body}</Link>;
          })}
        </div>)}
        {!rows.length && <p className="dash-tx-empty">{q || method ? tr("No matching transactions") : <>{tr("No transactions yet")} · <Link to="/pos">{tr("Record a sale")} <ArrowRight /></Link></>}</p>}
      </div>
      {(filtered.length > shown || pages > 1) && <div className="dash-tx-foot">
        {filtered.length > shown && <button type="button" className="dash-more" onClick={() => setPages((n) => n + 1)}>{tr("Show More")} <ChevronDown aria-hidden /></button>}
        {pages > 1 && <button type="button" className="dash-more" onClick={() => setPages(1)}>{tr("Show Less")} <ChevronUp aria-hidden /></button>}
      </div>}
    </section>
  );
}
