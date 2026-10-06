import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ShopButton } from "@/components/ui/shop-button";
import { useErp, inputCls } from "@/components/shopbook/product-search";
import { AppShell, Empty, Title, dt, moneyFor, run, useAccount, type Tr } from "@/components/shopbook/selling";
import { Kpi, KpiRow } from "@/components/shopbook/kpi";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";

export const Route = createFileRoute("/payroll")({
  head: () => ({ meta: [
    { title: "Payroll — SHOPBOOK ERP" },
    { name: "description", content: "Employees, salaries, sales commission, payroll runs and payments." },
    { property: "og:title", content: "Payroll — SHOPBOOK ERP" },
    { property: "og:description", content: "Pay staff salaries and commission with a full history." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Payroll,
});

const TABS = ["Overview", "Employees", "Payroll", "Payments", "Reports"];
type M = (n: number) => string;
const due = (s: erp.ErpState) => s.payrolls.reduce((a, p) => a + p.net - p.paid, 0);
const name = (s: erp.ErpState, id: string) => s.employees.find((e) => e.id === id)?.name ?? "—";

function Payroll() {
  const acct = useAccount("business");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState("Overview");
  if (!acct) return <main className="app-screen" />;
  const money = moneyFor(acct.currency || "KSh");
  return (
    <AppShell title="Payroll" tabs={TABS} tab={tab} setTab={setTab}>
      {tab === "Overview" && <Overview s={s} money={money} tr={tr} />}
      {tab === "Employees" && <Employees s={s} money={money} tr={tr} />}
      {tab === "Payroll" && <Runs s={s} money={money} tr={tr} />}
      {tab === "Payments" && <Payments s={s} money={money} tr={tr} />}
      {tab === "Reports" && <Report s={s} money={money} tr={tr} />}
    </AppShell>
  );
}

type P = { s: erp.ErpState; money: M; tr: Tr };

function Overview({ s, money, tr }: P) {
  const comm = s.commissions.reduce((a, c) => a + c.amount, 0);
  const paid = s.payrollPayments.reduce((a, p) => a + p.amount, 0);
  return (<>
    <KpiRow>
      <Kpi label={tr("Employees")} value={s.employees.filter((e) => e.active).length} />
      <Kpi label={tr("Payroll due")} value={money(due(s))} />
      <Kpi label={tr("Commission")} value={money(comm)} />
      <Kpi label={tr("Paid")} value={money(paid)} />
    </KpiRow>
    <Title>{tr("Commission history")}</Title>
    {s.commissions.length === 0 ? <Empty>{tr("No commission yet")}</Empty> : s.commissions.slice(0, 10).map((c) => (
      <div key={c.id} className="flex justify-between border-b border-border py-2 text-sm"><span>{name(s, c.employeeId)} • {c.source} • {tr(c.kind)}{c.pending ? ` • ${tr("Awaiting payment")}` : ""}</span><b className="tabular-nums">{money(c.amount)}</b></div>
    ))}
  </>);
}

function Employees({ s, money, tr }: P) {
  const [f, setF] = useState({ name: "", phone: "", role: "Seller", comp: "salary" as erp.Employee["comp"], salary: "", kind: "percent" as erp.CommissionRule["kind"], value: "", paidOnly: false });
  const [view, setView] = useState<string | null>(null);
  const sel = s.employees.find((e) => e.id === view);
  if (sel) return <Profile e={sel} s={s} money={money} tr={tr} onBack={() => setView(null)} />;
  const add = () => run(() => erp.addEmployee({ name: f.name, phone: f.phone || undefined, role: f.role, comp: f.comp, salary: +f.salary || 0, rule: { kind: f.kind, value: +f.value || 0, paidOnly: f.paidOnly } }), tr("Employee added")) && setF({ ...f, name: "", phone: "", salary: "", value: "" });
  return (<>
    <Title>{tr("Add employee")}</Title>
    <div className="grid gap-2">
      <input className={inputCls} placeholder={tr("Name")} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className={inputCls} placeholder={tr("Phone")} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <input className={inputCls} placeholder={tr("Role")} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} />
      </div>
      <select className={inputCls} value={f.comp} onChange={(e) => setF({ ...f, comp: e.target.value as erp.Employee["comp"] })}>
        <option value="salary">{tr("Fixed salary")}</option><option value="salary+commission">{tr("Salary + commission")}</option><option value="commission">{tr("Commission only")}</option>
      </select>
      {f.comp !== "commission" && <input className={inputCls} inputMode="decimal" placeholder={tr("Monthly salary")} value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} />}
      {f.comp !== "salary" && <>
        <div className="grid grid-cols-2 gap-2">
          <select className={inputCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as erp.CommissionRule["kind"] })}>
            <option value="percent">{tr("% of sale")}</option><option value="fixed">{tr("Fixed per sale")}</option><option value="profit">{tr("% of profit")}</option>
          </select>
          <input className={inputCls} inputMode="decimal" placeholder={tr("Value")} value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.paidOnly} onChange={(e) => setF({ ...f, paidOnly: e.target.checked })} />{tr("Eligible paid sales only")}</label>
      </>}
      <ShopButton onClick={add}>{tr("Add employee")}</ShopButton>
    </div>
    <Title>{tr("All employees")}</Title>
    {s.employees.length === 0 ? <Empty>{tr("No employees yet")}</Empty> : s.employees.map((e) => (
      <button key={e.id} onClick={() => setView(e.id)} className="flex w-full justify-between border-b border-border py-2.5 text-start text-sm">
        <span><b>{e.name}</b><span className="block text-[11px] text-muted-foreground">{e.role} • {tr(e.comp === "salary" ? "Fixed salary" : e.comp === "commission" ? "Commission only" : "Salary + commission")}</span></span>
        <span className={e.active ? "" : "text-muted-foreground"}>{tr(e.active ? "Active" : "Inactive")}</span>
      </button>
    ))}
  </>);
}

function Profile({ e, s, money, tr, onBack }: P & { e: erp.Employee; onBack: () => void }) {
  const comm = s.commissions.filter((c) => c.employeeId === e.id).reduce((a, c) => a + c.amount, 0);
  const runs = s.payrolls.filter((p) => p.employeeId === e.id);
  const paid = runs.reduce((a, p) => a + p.paid, 0);
  const bal = runs.reduce((a, p) => a + p.net - p.paid, 0);
  const sales = s.sales.filter((x) => x.sellerId === e.id);
  return (<>
    <ShopButton variant="outline" className="mb-3 h-9 text-sm" onClick={onBack}>{tr("Back")}</ShopButton>
    <h2 className="mb-2 text-lg font-bold">{e.name}</h2>
    <KpiRow><Kpi label={tr("Salary")} value={money(e.salary)} /><Kpi label={tr("Commission")} value={money(comm)} /><Kpi label={tr("Paid")} value={money(paid)} /><Kpi label={tr("Balance")} value={money(bal)} /></KpiRow>
    <Title>{tr("Sales")}</Title>
    {sales.length === 0 ? <Empty>{tr("No sales yet")}</Empty> : sales.slice(0, 10).map((x) => <div key={x.id} className="flex justify-between border-b border-border py-2 text-sm"><span>{x.ref}</span><span>{money(x.total)}</span></div>)}
    <ShopButton variant="outline" className="mt-4" onClick={() => run(() => erp.setEmployeeActive(e.id, !e.active), tr("Saved"))}>{tr(e.active ? "Deactivate" : "Activate")}</ShopButton>
  </>);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function Runs({ s, money, tr }: P) {
  const now = new Date();
  const [emp, setEmp] = useState(s.employees.find((e) => e.active)?.id ?? "");
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)));
  const [ded, setDed] = useState("");
  const [payFor, setPayFor] = useState<string | null>(null);
  const [pm, setPm] = useState<erp.Method>("mpesa");
  const [amt, setAmt] = useState("");
  let pv: ReturnType<typeof erp.payrollPreview> | null = null;
  try { pv = emp ? erp.payrollPreview(s, emp, +ded || 0) : null; } catch { pv = null; }
  return (<>
    <Title>{tr("Process payroll")}</Title>
    {s.employees.length === 0 ? <Empty>{tr("No employees yet")}</Empty> : <div className="grid gap-2">
      <select className={inputCls} value={emp} onChange={(e) => setEmp(e.target.value)}>{s.employees.filter((e) => e.active).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
      <div className="grid grid-cols-2 gap-2"><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <input className={inputCls} inputMode="decimal" placeholder={tr("Deductions")} value={ded} onChange={(e) => setDed(e.target.value)} />
      {pv && <KpiRow><Kpi label={tr("Gross pay")} value={money(pv.salary)} /><Kpi label={tr("Commission")} value={money(pv.commission)} /><Kpi label={tr("Deductions")} value={money(pv.deductions)} /><Kpi label={tr("Net pay")} value={money(pv.net)} /></KpiRow>}
      <ShopButton onClick={() => run(() => erp.confirmPayroll(emp, new Date(from).getTime(), new Date(to).getTime() + 86399999, +ded || 0), tr("Payroll confirmed"))}>{tr("Confirm payroll")}</ShopButton>
    </div>}
    <Title>{tr("Payroll history")}</Title>
    {s.payrolls.length === 0 ? <Empty>{tr("No payroll yet")}</Empty> : s.payrolls.map((r) => (
      <div key={r.id} className="border-b border-border py-2.5 text-sm">
        <div className="flex justify-between"><b>{r.ref} • {name(s, r.employeeId)}</b><span>{money(r.net)}</span></div>
        <p className="text-[11px] text-muted-foreground">{new Date(r.from).toLocaleDateString("en-GB")} – {new Date(r.to).toLocaleDateString("en-GB")} • {tr("Paid")} {money(r.paid)} • {tr("Outstanding")} {money(r.net - r.paid)}</p>
        {r.net - r.paid > 0.001 && (payFor === r.id ? <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
          <select className={inputCls} value={pm} onChange={(e) => setPm(e.target.value as erp.Method)}>{(["cash", "mpesa", "bank"] as erp.Method[]).map((m) => <option key={m} value={m}>{tr(erp.METHOD_LABEL[m])}</option>)}</select>
          <input className={inputCls} inputMode="decimal" placeholder={tr("Amount")} value={amt} onChange={(e) => setAmt(e.target.value)} />
          <ShopButton className="h-11 px-3 text-sm" onClick={() => { if (run(() => erp.payPayroll(r.id, pm, +amt), tr("Payment recorded")) !== undefined) { setPayFor(null); setAmt(""); } }}>{tr("Pay")}</ShopButton>
        </div> : <ShopButton variant="outline" className="mt-2 h-9 text-sm" onClick={() => setPayFor(r.id)}>{tr("Pay")}</ShopButton>)}
      </div>
    ))}
  </>);
}

function Payments({ s, money, tr }: P) {
  return s.payrollPayments.length === 0 ? <Empty>{tr("No payments yet")}</Empty> : <>{s.payrollPayments.map((p) => (
    <div key={p.id} className="flex justify-between border-b border-border py-2.5 text-sm"><span><b>{p.ref}</b><span className="block text-[11px] text-muted-foreground">{name(s, p.employeeId)} • {tr(erp.METHOD_LABEL[p.method])} • {dt(p.at)}</span></span><span>{money(p.amount)}</span></div>
  ))}</>;
}

function Report({ s, money, tr }: P) {
  return (<>
    <Title>{tr("Commission by employee")}</Title>
    {s.employees.length === 0 ? <Empty>{tr("No employees yet")}</Empty> : s.employees.map((e) => {
      const sales = s.sales.filter((x) => x.sellerId === e.id).reduce((a, x) => a + x.total, 0);
      const c = s.commissions.filter((x) => x.employeeId === e.id).reduce((a, x) => a + x.amount, 0);
      const out = s.payrolls.filter((p) => p.employeeId === e.id).reduce((a, p) => a + p.net - p.paid, 0);
      return <div key={e.id} className="border-b border-border py-2 text-sm"><b>{e.name}</b><p className="text-[11px] text-muted-foreground">{tr("Sales")} {money(sales)} • {tr("Commission")} {money(c)} • {tr("Outstanding")} {money(out)}</p></div>;
    })}
  </>);
}
