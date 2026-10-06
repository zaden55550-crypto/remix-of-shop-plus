import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { ReceiptSheet, moneyFor, useAccount } from "@/components/shopbook/selling";
import { useErp } from "@/components/shopbook/product-search";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
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
    <section className="border-b border-border py-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[13px] font-bold">{title}</h2>
        {to && <Link to={to} className="flex items-center text-[11px] font-semibold text-primary">{link}<ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" /></Link>}
      </div>
      {children}
    </section>
  );
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
  const cashUp = pos.cashUpPending ? "Pending" : cashVariance && "variance" in cashVariance && Number((cashVariance as { variance?: number }).variance) ? "Variance" : "Done";

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
      <header className="sticky top-0 z-20 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background/95 px-3 py-2 backdrop-blur">
        <button aria-label={tr("Back")} onClick={() => nav({ to: "/apps" })} className="p-1"><ChevronLeft className="h-5 w-5 rtl:rotate-180" /></button>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold tracking-wide">{tr("Dashboard").toUpperCase()}</h1>
          <p className={cn("truncate text-[10px]", backed ? "text-success" : "text-muted-foreground")}>
            {backed ? `✓ ${tr("Backed up")} • ${ago(lb, tr)}` : `⚠ ${tr("Backup pending")}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="max-w-[90px] truncate text-[11px] text-muted-foreground">{tr("Admin")}</span>
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

      <div className="px-3">
        <div className="flex items-center justify-between gap-2 border-b border-border py-2">
          <select aria-label={tr("Period")} value={p} onChange={(e) => setP(e.target.value as P)} className="rounded-md border border-border bg-card px-2 py-1 text-[12px] font-semibold">
            {PS.map((x) => <option key={x} value={x}>{tr(x)}</option>)}
          </select>
          <span className="truncate text-[11px] text-muted-foreground">{fmtD(from || (s.sales.at(-1)?.at ?? to))} - {fmtD(to)}</span>
        </div>
        {p === "Custom" && (
          <div className="flex gap-2 border-b border-border py-2 text-[11px]">
            <input type="date" aria-label={tr("From")} value={custom[0]} onChange={(e) => setCustom([e.target.value, custom[1]])} className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1" />
            <input type="date" aria-label={tr("To")} value={custom[1]} onChange={(e) => setCustom([custom[0], e.target.value])} className="min-w-0 flex-1 rounded border border-border bg-card px-2 py-1" />
          </div>
        )}

        <Section title={tr("Business overview")}>
          <KpiRow>
            <Kpi label={tr("Sales")} value={k(perf.sales)} />
            <Kpi label={tr("Purchases")} value={k(t.purchases)} />
            <Kpi label={tr("Expenses")} value={k(t.expenses)} />
            <Kpi label={tr("Profit")} value={k(profit)} tone={profit < 0 ? "bad" : undefined} />
            <Kpi label={tr("Stock value")} value={k(pos.stock)} />
          </KpiRow>
        </Section>

        <Section title={tr("Sales by payment method")} to="/reports" link={tr("View details")}>
          <div className="flex items-center gap-4">
            <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: byTotal ? `conic-gradient(${(() => { let acc = 0; return METHODS.map((m) => { const a = acc; acc += (perf.byMethod[m] / byTotal) * 360; return `${COLORS[m]} ${a}deg ${acc}deg`; }).join(", "); })()})` : "var(--muted)" }}>
              <div className="absolute inset-3 grid place-items-center rounded-full bg-background text-center">
                <div><p className="text-sm font-bold tabular-nums">{k(byTotal)}</p><p className="text-[9px] text-muted-foreground">{tr("Total sales")}</p></div>
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
          <KpiRow>
            <Kpi label={tr("Cash")} value={k(bal.cash)} />
            <Kpi label={tr("M-Pesa")} value={k(bal.mpesa)} />
            <Kpi label={tr("Bank")} value={k(bal.bank)} />
            <Link to="/contacts"><Kpi label={tr("Credit")} value={k(pos.receivables)} /></Link>
          </KpiRow>
        </Section>

        <Section title={tr("Needs attention")}>
          <KpiRow>
            <Link to="/inventory"><Kpi label={tr("Low stock")} value={pos.low + pos.out} tone={pos.low + pos.out ? "warn" : undefined} /></Link>
            <Link to="/contacts"><Kpi label={tr("Receivables")} value={k(pos.receivables)} /></Link>
            <Link to="/contacts"><Kpi label={tr("Payables")} value={k(pos.payables)} tone={pos.payables > 0 ? "warn" : undefined} /></Link>
            <Link to="/pos"><Kpi label={tr("Cash-up")} value={tr(cashUp)} tone={cashUp === "Done" ? undefined : cashUp === "Pending" ? "warn" : "bad"} /></Link>
          </KpiRow>
        </Section>

        <Section title={tr("Recent sales")} to="/sales" link={tr("View all")}>
          {s.sales.length === 0 ? <p className="py-4 text-center text-[12px] text-muted-foreground">{tr("No sales yet")}</p> : s.sales.slice(0, 5).map((sale) => {
            const method = METHODS.filter((m) => sale.pay[m] > 0).sort((a, b) => sale.pay[b] - sale.pay[a])[0];
            const cust = sale.customerId ? s.customers.find((c) => c.id === sale.customerId)?.name : undefined;
            return (
              <button key={sale.id} onClick={() => setOpen(sale)} className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-border py-2 text-start last:border-0">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-semibold">{sale.ref}{cust ? <span className="font-normal text-muted-foreground"> • {cust}</span> : null}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(sale.at).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <div className="text-end">
                  <p className="whitespace-nowrap text-[12px] font-semibold tabular-nums">{money(sale.total)}</p>
                  {method && <p className="text-[10px] font-semibold" style={{ color: COLORS[method] }}>{tr(METHOD_LABEL[method])}</p>}
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground rtl:rotate-180" />
              </button>
            );
          })}
        </Section>
      </div>
      {open && <ReceiptSheet sale={open} s={s} money={money} tr={tr} shop={account.shopName} onClose={() => setOpen(null)} />}
    </main>
  );
}
