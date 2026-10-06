import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { ReceiptSheet, moneyFor, useAccount } from "@/components/shopbook/selling";
import { useErp } from "@/components/shopbook/product-search";
import { useLanguage } from "@/hooks/use-language";
import { performance, position } from "@/lib/summary";
import { floatBalances, purchaseTotals } from "@/lib/finance";
import { profitAndLoss } from "@/lib/accounting";
import { lastBackup } from "@/lib/backup";
import { METHODS, METHOD_LABEL, type Method, type Sale } from "@/lib/erp";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [
    { title: "Dashboard — SHOPBOOK ERP" },
    { name: "description", content: "Your SHOPBOOK sales, purchases, expenses, profit and stock at a glance." },
    { property: "og:title", content: "Dashboard — SHOPBOOK ERP" },
    { property: "og:description", content: "A compact business overview for your shop." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Dashboard,
});

type P = "Today" | "This week" | "This month" | "This year" | "Custom";
const PS: P[] = ["Today", "This week", "This month", "This year", "Custom"];
const COLORS: Record<Method, string> = { cash: "var(--success, oklch(0.7 0.17 150))", mpesa: "var(--primary)", bank: "var(--warning, oklch(0.8 0.15 80))", credit: "var(--destructive)" };
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const fmtD = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function range(p: P, custom: [string, string]): [number, number] {
  const now = new Date(); const t = day(now);
  if (p === "Today") return [t.getTime(), now.getTime()];
  if (p === "This week") { const s = new Date(t); s.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return [s.getTime(), now.getTime()]; }
  if (p === "This month") return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), now.getTime()];
  if (p === "This year") return [new Date(now.getFullYear(), 0, 1).getTime(), now.getTime()];
  const a = custom[0] ? new Date(custom[0] + "T00:00").getTime() : 0;
  const b = custom[1] ? new Date(custom[1] + "T23:59:59").getTime() : now.getTime();
  return [a, b];
}

function compact(_cur: string) {
  return (n: number) => {
    const a = Math.abs(n), sign = n < 0 ? "−" : "";
    const v = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${+(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`;
    return `${sign}${v}`;
  };
}

function ago(t: number, tr: (s: string) => string) {
  const m = Math.floor((Date.now() - t) / 6e4);
  if (m < 1) return tr("now");
  if (m < 60) return `${m} ${tr("min ago")}`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} ${tr("h ago")}`;
  return `${Math.floor(h / 24)} ${tr("d ago")}`;
}

function Section({ title, to, link, children }: { title: string; to?: string; link?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {to && <Link to={to} className="flex items-center text-[11px] font-semibold text-primary">{link}<ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" /></Link>}
      </div>
      {children}
    </section>
  );
}

function Box({ label, value, tone, to }: { label: string; value: ReactNode; tone?: "good" | "warn" | "bad" | undefined; to?: string }) {
  const inner = (
    <div className="h-full rounded-lg border border-border bg-background/60 px-2.5 py-2">
      <p className="whitespace-nowrap text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 whitespace-nowrap text-sm font-bold tabular-nums", tone === "good" && "text-success", tone === "warn" && "text-warning", tone === "bad" && "text-destructive")}>{value}</p>
    </div>
  );
  return to ? <Link to={to} className="block min-w-0">{inner}</Link> : inner;
}

function Dashboard() {
  const account = useAccount("basic");
  const s = useErp();
  const { tr, dir } = useLanguage();
  const nav = useNavigate();
  const [p, setP] = useState<P>("This month");
  const [custom, setCustom] = useState<[string, string]>(["", ""]);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<Sale | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 30000); return () => clearInterval(i); }, []);

  const [from, to] = range(p, custom);
  const data = useMemo(() => {
    const perf = performance(s, from, to);
    const t = purchaseTotals(s, from, to);
    const pos = position(s);
    return { perf, t, pos, profit: profitAndLoss(s, from, to).net, bal: floatBalances(s) };
  }, [s, from, to]);
  if (!account) return <main className="app-screen" />;
  const cur = account.currency || "KSh";
  const money = moneyFor(cur);
  const k = compact(cur);
  const { perf, t, pos, profit, bal } = data;
  const byTotal = METHODS.reduce((a, m) => a + perf.byMethod[m], 0);
  const lastChange = s.audit[0]?.at ?? 0;
  const lb = lastBackup();
  const backed = lb && lb >= lastChange;
  const cashVariance = s.cash.find((e) => e.type === "CASH UP");
  const cashUp = pos.cashUpPending ? "Pending" : cashVariance && cashVariance.counted !== undefined && cashVariance.expected !== undefined && cashVariance.counted !== cashVariance.expected ? "Variance" : "Done";

  const rows: [string, string | number][] = [
    ["Period", `${fmtD(from || to)} - ${fmtD(to)}`],
    ["Sales", perf.sales], ["Purchases", t.purchases], ["Expenses", t.expenses], ["Profit", profit], ["Stock value", pos.stock],
    ...METHODS.map((m) => [`Sales ${METHOD_LABEL[m]}`, perf.byMethod[m]] as [string, number]),
    ["Cash balance", bal.cash], ["M-Pesa balance", bal.mpesa], ["Bank balance", bal.bank],
    ["Receivables", pos.receivables], ["Payables", pos.payables], ["Low stock", pos.low + pos.out], ["Cash-up", cashUp],
  ];
  const exportCsv = () => {
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `dashboard-${iso(Date.now())}.csv`; a.click(); setMenu(false);
  };
  const shareText = rows.map(([a, b]) => `${tr(a)}: ${typeof b === "number" ? money(b) : b}`).join("\n");
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <main dir={dir} className="app-screen mx-auto flex min-h-screen w-full max-w-md flex-col bg-background pb-10 text-foreground">
      <header className="sticky top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-1">
          <button aria-label={tr("Back")} onClick={() => nav({ to: "/apps" })} className="p-1"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></button>
          <h1 className="truncate text-sm font-bold tracking-wide">{tr("Dashboard").toUpperCase()}</h1>
        </div>
        <p className="max-w-[140px] truncate text-center text-[12px] font-semibold text-muted-foreground">{account.shopName}</p>
        <div className="flex justify-end">
          <button aria-label={tr("Menu")} onClick={() => setMenu((v) => !v)} className="p-1"><Menu className="h-5 w-5" /></button>
        </div>
        {menu && (
          <div className="absolute end-3 top-full z-30 mt-1 w-48 overflow-hidden rounded-lg border border-border bg-card text-[13px] shadow-lg">
            <button className="block w-full px-3 py-2 text-start hover:bg-muted" onClick={() => { tick((n) => n + 1); setMenu(false); }}>{tr("Refresh dashboard")}</button>
            <button className="block w-full px-3 py-2 text-start hover:bg-muted" onClick={exportCsv}>{tr("Export dashboard")}</button>
            {canShare && <button className="block w-full px-3 py-2 text-start hover:bg-muted" onClick={() => { navigator.share({ title: "SHOPBOOK Dashboard", text: shareText }).catch(() => {}); setMenu(false); }}>{tr("Share dashboard")}</button>}
            <Link to="/reports" className="block px-3 py-2 hover:bg-muted">{tr("View details")}</Link>
          </div>
        )}
      </header>

      <div className="flex flex-col gap-3 px-3 pt-2">
        <p className={cn("text-[10px]", backed ? "text-success" : "text-muted-foreground")}>
          {backed ? `✓ ${tr("Backed up")} • ${ago(lb, tr)}` : `⚠ ${tr("Backup pending")}`}
        </p>

        <section className="rounded-xl border border-border bg-card p-2 shadow-sm">
          <div className="flex gap-1 overflow-x-auto">
            {PS.map((x) => (
              <button key={x} onClick={() => setP(x)} className={cn("shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[11px] font-bold uppercase", p === x ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{tr(x)}</button>
            ))}
          </div>
          {p === "Custom" && (
            <div className="mt-2 flex gap-2 text-[11px]">
              <input type="date" aria-label={tr("From")} value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1" />
              <input type="date" aria-label={tr("To")} value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1" />
            </div>
          )}
          <p className="mt-1 px-1 text-[10px] text-muted-foreground">{fmtD(from || (s.sales.at(-1)?.at ?? to))} - {fmtD(to)}</p>
        </section>

        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          {([["Sales", perf.sales, "good"], ["Purchases", t.purchases], ["Expenses", t.expenses], ["Profit", profit, profit < 0 ? "bad" : "good"], ["Stock value", pos.stock]] as [string, number, ("good" | "bad")?][]).map(([l, v, tone]) => (
            <div key={l} className="shrink-0 rounded-xl border border-border bg-card px-3 py-2 shadow-sm">
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase text-muted-foreground">{tr(l)}</p>
              <p className={cn("mt-0.5 whitespace-nowrap text-base font-bold tabular-nums", tone === "good" && "text-success", tone === "bad" && "text-destructive")}>{k(v)}</p>
            </div>
          ))}
        </div>

        <Section title={tr("Sales by payment method")} to="/reports" link={tr("View details")}>
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20 shrink-0 rounded-full" style={{ background: byTotal ? `conic-gradient(${(() => { let acc = 0; return METHODS.map((m) => { const a = acc; acc += (perf.byMethod[m] / byTotal) * 360; return `${COLORS[m]} ${a}deg ${acc}deg`; }).join(", "); })()})` : "var(--muted)" }}>
              <div className="absolute inset-2.5 grid place-items-center rounded-full bg-card text-center">
                <div><p className="text-[13px] font-bold tabular-nums">{k(byTotal)}</p><p className="text-[8px] text-muted-foreground">{tr("Total sales")}</p></div>
              </div>
            </div>
            <ul className="min-w-0 flex-1 space-y-1.5 text-[12px]">
              {METHODS.map((m) => (
                <li key={m} className="grid grid-cols-[auto_minmax(0,1fr)_auto_2.5rem] items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: COLORS[m] }} />
                  <span className="truncate">{tr(METHOD_LABEL[m])}</span>
                  <b className="tabular-nums">{k(perf.byMethod[m])}</b>
                  <span className="text-end tabular-nums text-muted-foreground">{byTotal ? Math.round((perf.byMethod[m] / byTotal) * 100) : 0}%</span>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <Section title={tr("Money position")} to="/float" link={tr("View details")}>
          <div className="grid grid-cols-4 gap-1.5">
            <Box label={tr("Cash")} value={k(bal.cash)} />
            <Box label={tr("M-Pesa")} value={k(bal.mpesa)} />
            <Box label={tr("Bank")} value={k(bal.bank)} />
            <Box label={tr("Credit")} value={k(pos.receivables)} to="/contacts" />
          </div>
        </Section>

        <Section title={tr("Needs attention")}>
          <div className="grid grid-cols-2 gap-2">
            <Box to="/inventory" label={tr("Low stock")} value={pos.low + pos.out} tone={pos.low + pos.out ? "warn" : "good"} />
            <Box to="/contacts" label={tr("Receivables")} value={money(pos.receivables)} />
            <Box to="/contacts" label={tr("Payables")} value={money(pos.payables)} tone={pos.payables > 0 ? "warn" : undefined} />
            <Box to="/pos" label={tr("Cash-up")} value={cashUp === "Variance" && cashVariance ? money((cashVariance.counted ?? 0) - (cashVariance.expected ?? 0)) : tr(cashUp)} tone={cashUp === "Done" ? "good" : cashUp === "Pending" ? "warn" : "bad"} />
          </div>
        </Section>

        <Section title={tr("Recent sales")} to="/sales" link={tr("View all")}>
          {s.sales.length === 0 ? <p className="py-4 text-center text-[12px] text-muted-foreground">{tr("No sales yet")}</p> : s.sales.slice(0, 5).map((sale) => {
            const methods = METHODS.filter((m) => sale.pay[m] > 0).sort((a, b) => sale.pay[b] - sale.pay[a]);
            const cust = sale.customerId ? s.customers.find((c) => c.id === sale.customerId)?.name : undefined;
            const item = sale.items[0]?.name ?? "";
            const more = sale.items.length > 1 ? ` +${sale.items.length - 1}` : "";
            return (
              <button key={sale.id} onClick={() => setOpen(sale)} className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)_auto] items-start gap-2 border-b border-border py-2 text-start last:border-0">
                <p className="text-[11px] font-bold tabular-nums">{sale.ref}</p>
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold">{item}{more}</p>
                  <p className="text-[12px] font-bold tabular-nums text-success">{money(sale.total)}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{methods.map((m) => tr(METHOD_LABEL[m])).join(" + ")}{cust ? ` • ${cust}` : ""}</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground rtl:rotate-180" />
              </button>
            );
          })}
        </Section>
      </div>
      {open && <ReceiptSheet sale={open} s={s} money={money} tr={tr} shop={account.shopName} onClose={() => setOpen(null)} />}
    </main>
  );
}
