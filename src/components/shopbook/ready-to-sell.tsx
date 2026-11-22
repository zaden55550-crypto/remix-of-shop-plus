// "Ready to sell" (owner's request, 2026-11-22): everything a shop needs before its first real sale on one page with a progress
// bar. Each step is done from real settings and records (ready-setup.ts) or skipped, and can be reopened at any time.
import { useEffect, useState } from "react";
import { CircleCheck, ChevronDown, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { ImportCenter } from "@/components/shopbook/import-center";
import { FullImport } from "@/components/shopbook/full-import";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { getTax } from "@/lib/prefs";
import { readSettings, saveSettings } from "@/lib/settings-config";
import { clearDemoData, isDemo, isEmptyShop, loadDemoData, resetDemoData } from "@/lib/demo";
import { store } from "@/lib/shopbook";
import {
  READY_INFO, READY_STEPS, confirmStep, financialYearStart, paymentLines, printedRef, readyProgress, readyStatus, saveHours, saveNumbering,
  savePayments, saveTax, setOpeningFloat, setStaffPin, skipStep, type ReadyStep,
} from "@/lib/ready-setup";
import { cn } from "@/lib/utils";

type Tr = (x: string, v?: string | number) => string;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Exports to bring from other systems: where to find them and which Zakrio import takes them. */
export const MOVE_GUIDES: { system: string; steps: string[] }[] = [
  { system: "Odoo", steps: ["Inventory › Products › select all › Action › Export (Name, Internal Reference, Barcode, Sales Price, Cost, Quantity On Hand, Product Category)", "Contacts › select all › Action › Export (Name, Phone, Mobile, Email)", "Accounting › Reports › Aged Receivable and Aged Payable for what customers owe and what you owe"] },
  { system: "QuickBooks", steps: ["Sales › Products and services › Export to Excel", "Sales › Customers › Export to Excel; Expenses › Vendors › Export to Excel", "Reports › Accounts receivable aging summary and Accounts payable aging summary"] },
  { system: "Zoho Inventory / Books", steps: ["Items › ⋯ › Export Items (CSV or XLSX)", "Contacts › Customers and Vendors › Export", "Reports › AR Aging Summary and AP Aging Summary"] },
  { system: "Loyverse", steps: ["Items › Item list › Export (prices and stock per store)", "Customers › Export"] },
  { system: "Excel or another system", steps: ["One sheet per kind: Products, Customers, Suppliers, Opening balances. Column names in any order; download our template if you're starting fresh"] },
];

/** Re-reads the checklist when settings or prefs change (they live outside the ERP state). */
export function useReadyStatus(s: erp.ErpState) {
  const [, bump] = useState(0);
  useEffect(() => { const r = () => bump((n) => n + 1); window.addEventListener("shopbook-settings", r); window.addEventListener("shopbook-prefs", r); return () => { window.removeEventListener("shopbook-settings", r); window.removeEventListener("shopbook-prefs", r); }; }, []);
  return readyStatus(s);
}

/** The Setup header button: name, a small progress bar and how many steps are handled. */
export function ReadyButton({ s, onOpen }: { s: erp.ErpState; onOpen: () => void }) {
  const { tr } = useLanguage();
  const done = readyProgress(useReadyStatus(s));
  return <button type="button" className="bsetup-ready-sell" title={tr("Payment details, tax, opening stock and cash, receipt and more")} onClick={onOpen}>
    <span>{tr("Ready to sell")}</span><span className="bsetup-ready-sell-bar" aria-hidden><i style={{ width: `${(done / READY_STEPS.length) * 100}%` }} /></span><small>{done}/{READY_STEPS.length}</small>
  </button>;
}

export function ReadyToSell({ s, onClose }: { s: erp.ErpState; onClose?: () => void }) {
  const { tr } = useLanguage();
  const [, bump] = useState(0);
  const status = useReadyStatus(s), done = readyProgress(status);
  const [open, setOpen] = useState<ReadyStep | null>(() => READY_STEPS.find((k) => status[k] === "todo") ?? null);
  const refresh = () => bump((n) => n + 1);
  const run = (fn: () => unknown, then?: ReadyStep) => {
    try { const r = fn(); const after = () => { toast.success(tr("Saved")); refresh(); setOpen(nextAfter(then)); };
      if (r instanceof Promise) r.then(after, (e: unknown) => toast.error(tr(e instanceof Error ? e.message : "Something went wrong"))); else after();
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Something went wrong")); }
  };
  const nextAfter = (k?: ReadyStep) => { if (!k) return open; const st = readyStatus(erp.load()); const i = READY_STEPS.indexOf(k); return READY_STEPS.slice(i + 1).find((x) => st[x] === "todo") ?? null; };

  return <div className="ready-sell inventory-box dash-panel">
    <div className="ready-head">
      <div><h3>{tr("Ready to sell")}</h3><p className="settings-note">{tr("Everything your shop needs before its first real sale. Do a step now, or skip it and come back later.")}</p></div>
      {onClose && <ShopButton variant="outline" onClick={onClose}>{tr("Done")}</ShopButton>}
    </div>
    <div className="ready-progress" role="progressbar" aria-valuemin={0} aria-valuemax={READY_STEPS.length} aria-valuenow={done} aria-label={tr("Ready to sell")}>
      <span style={{ width: `${(done / READY_STEPS.length) * 100}%` }} />
    </div>
    <p className="ready-count">{tr("{x} done or skipped", `${done} / ${READY_STEPS.length}`)}{done < READY_STEPS.length ? ` · ${tr("Left")}: ${READY_STEPS.filter((k) => status[k] === "todo").map((k) => tr(READY_INFO[k].title)).join(", ")}` : ""}</p>
    <ol className="ready-steps">
      {READY_STEPS.map((k, i) => <li key={k} className={cn("ready-step", `is-${status[k]}`, open === k && "is-open")}>
        <button type="button" className="ready-step-head" aria-expanded={open === k} onClick={() => setOpen(open === k ? null : k)}>
          <span className="ready-step-mark" aria-hidden>{status[k] === "done" ? <CircleCheck /> : status[k] === "skipped" ? <SkipForward /> : i + 1}</span>
          <span className="ready-step-text"><b>{tr(READY_INFO[k].title)}</b><small>{tr(READY_INFO[k].hint)}</small></span>
          <span className="ready-step-state">{status[k] === "done" ? tr("Done") : status[k] === "skipped" ? tr("Skipped") : ""}</span>
          <ChevronDown aria-hidden className="ready-step-chev" />
        </button>
        {open === k && <div className="ready-step-body">
          <StepBody step={k} s={s} tr={tr} run={run} />
          <div className="ready-step-foot">
            {status[k] === "skipped"
              ? <button type="button" className="bsetup-link-btn" onClick={() => { skipStep(k, false); refresh(); }}>{tr("Undo skip")}</button>
              : status[k] === "todo" && <button type="button" className="bsetup-link-btn" onClick={() => { skipStep(k); refresh(); setOpen(nextAfter(k)); }}><SkipForward aria-hidden /> {tr("Skip for now")}</button>}
          </div>
        </div>}
      </li>)}
    </ol>
  </div>;
}

function Text({ label, value, set, ph, mode }: { label: string; value: string; set: (v: string) => void; ph?: string; mode?: "numeric" | "decimal" }) {
  return <label className="inventory-field"><span>{label}</span><input className="inventory-input" aria-label={label} inputMode={mode} value={value} placeholder={ph} onChange={(e) => set(e.target.value)} /></label>;
}

function StepBody({ step, s, tr, run }: { step: ReadyStep; s: erp.ErpState; tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const cfg = readSettings();
  switch (step) {
    case "payments": return <Payments tr={tr} run={run} />;
    case "tax": return <Tax tr={tr} run={run} />;
    case "stock": return <div className="ready-stack">
      <p className="settings-note">{tr("Upload your product list with the stock you have now, or add products one by one in Inventory › All Products.")}</p>
      <ImportCenter tr={tr} only="Products" />
    </div>;
    case "cash": return <OpeningCash s={s} tr={tr} run={run} />;
    case "receipt": return <ReceiptStep tr={tr} run={run} />;
    case "numbering": return <Numbering s={s} tr={tr} run={run} />;
    case "hours": return <Hours tr={tr} run={run} hours={cfg.hours} month={cfg.fyStartMonth} />;
    case "pins": return <Pins s={s} tr={tr} run={run} />;
    case "sample": return <Sample tr={tr} run={run} />;
    case "move": return <Move tr={tr} run={run} />;
  }
}

function Payments({ tr, run }: { tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const [p, setP] = useState(() => ({ tillNumber: "", paybill: "", paybillAccount: "", bankName: "", bankAccount: "", ...readSettings().payment }));
  const set = (k: keyof typeof p) => (v: string) => setP({ ...p, [k]: v });
  return <div className="ready-stack">
    <div className="ready-grid">
      <Text label={tr("M-Pesa Till number")} value={p.tillNumber} set={set("tillNumber")} mode="numeric" ph="123456" />
      <Text label={tr("M-Pesa Paybill")} value={p.paybill} set={set("paybill")} mode="numeric" ph="400200" />
      <Text label={tr("Paybill account number")} value={p.paybillAccount} set={set("paybillAccount")} ph={tr("Optional")} />
      <Text label={tr("Bank name")} value={p.bankName} set={set("bankName")} ph={tr("Optional")} />
      <Text label={tr("Bank account number")} value={p.bankAccount} set={set("bankAccount")} ph={tr("Optional")} />
    </div>
    <p className="settings-note">{tr("Printed at the bottom of every receipt and quotation so customers know where to pay.")}</p>
    <ShopButton onClick={() => run(() => savePayments(p), "payments")}>{tr("Save")}</ShopButton>
  </div>;
}

function Tax({ tr, run }: { tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const t = getTax();
  const [on, setOn] = useState(t.on), [rate, setRate] = useState(String(t.rate || 16)), [pin, setPin] = useState(readSettings().taxPin);
  return <div className="ready-stack">
    <div className="ready-choice" role="radiogroup" aria-label={tr("VAT-registered?")}>
      <button type="button" role="radio" aria-checked={on} className={cn(on && "is-on")} onClick={() => setOn(true)}>{tr("VAT-registered")}</button>
      <button type="button" role="radio" aria-checked={!on} className={cn(!on && "is-on")} onClick={() => setOn(false)}>{tr("Not VAT-registered")}</button>
    </div>
    <div className="ready-grid">
      {on && <Text label={tr("VAT rate %")} value={rate} set={setRate} mode="decimal" />}
      <Text label={tr("KRA PIN")} value={pin} set={setPin} ph="P051234567X" />
    </div>
    <p className="settings-note">{tr("eTIMS: sending invoices to KRA eTIMS needs your own KRA approval and is not connected yet. Your PIN and VAT are printed on receipts now.")}</p>
    <ShopButton onClick={() => run(() => saveTax(on, Number(rate), pin), "tax")}>{tr("Save")}</ShopButton>
  </div>;
}

function OpeningCash({ s, tr, run }: { s: erp.ErpState; tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const shop = erp.activeShop(s), count = erp.shopCounters(s, shop);
  const [amounts, setAmounts] = useState<string[]>(() => Array.from({ length: count }, () => ""));
  const save = () => run(() => erp.runErpTransaction(() => amounts.forEach((a, i) => { if (a.trim()) setOpeningFloat(i + 1, Number(a)); })), "cash");
  return <div className="ready-stack">
    <p className="settings-note">{tr("Count the notes and coins in each drawer before the first sale. Cash-up then expects this amount plus the day's cash sales.")}</p>
    <div className="ready-grid">
      {amounts.map((a, i) => <Text key={i} label={count > 1 ? `${tr("Counter")} ${i + 1}` : tr("Cash in the drawer")} value={a} mode="decimal" ph="0" set={(v) => setAmounts(amounts.map((x, j) => (j === i ? v : x)))} />)}
    </div>
    <ShopButton disabled={!amounts.some((a) => a.trim())} onClick={save}>{tr("Save")}</ShopButton>
  </div>;
}

function ReceiptStep({ tr, run }: { tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const cfg = readSettings();
  const [footer, setFooter] = useState(cfg.receiptFooter), [paper, setPaper] = useState(cfg.paper), [copies, setCopies] = useState(String(cfg.copies));
  const name = store.get()?.shopName ?? "";
  return <div className="ready-receipt">
    <div className="ready-stack">
      <label className="inventory-field"><span>{tr("Message at the bottom")}</span><textarea className="inventory-input" aria-label={tr("Message at the bottom")} rows={3} value={footer} placeholder={tr("e.g. Goods once sold are not returnable")} onChange={(e) => setFooter(e.target.value)} /></label>
      <div className="ready-grid">
        <label className="inventory-field"><span>{tr("Paper")}</span><select className="inventory-input" aria-label={tr("Paper")} value={paper} onChange={(e) => setPaper(e.target.value)}>{["58mm", "80mm", "A4"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label className="inventory-field"><span>{tr("Copies")}</span><select className="inventory-input" aria-label={tr("Copies")} value={copies} onChange={(e) => setCopies(e.target.value)}>{["1", "2", "3"].map((x) => <option key={x}>{x}</option>)}</select></label>
      </div>
      <p className="settings-note">{tr("Your logo, phone, KRA PIN, hours and payment details print automatically when they are filled in.")}</p>
      <ShopButton onClick={() => run(() => { saveSettings({ receiptFooter: footer, paper, copies: Number(copies) }); confirmStep("receipt"); }, "receipt")}>{tr("Save")}</ShopButton>
    </div>
    <div className={cn("ready-receipt-preview receipt-paper", paper === "58mm" && "is-58")} aria-label={tr("Receipt preview")}>
      <p className="font-bold uppercase">{name}</p>
      {cfg.phone && <p>{tr("Tel")}: {cfg.phone}</p>}
      {cfg.taxPin && <p>{tr("PIN")}: {cfg.taxPin}</p>}
      <p>{printedRef("S-000001")}</p>
      <p className="ready-receipt-line"><span>{tr("Sample item")} 1 × 100</span><span>100</span></p>
      <p className="ready-receipt-line font-bold"><span>{tr("TOTAL")}</span><span>100</span></p>
      {paymentLines(tr).map((l) => <p key={l}>{l}</p>)}
      <p>{tr("Thank you!")}</p>
      {footer.trim() && <p className="whitespace-pre-line">{footer.trim()}</p>}
    </div>
  </div>;
}

function Numbering({ s, tr, run }: { s: erp.ErpState; tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const [prefix, setPrefix] = useState(readSettings().docPrefix ?? ""), [sale, setSale] = useState(""), [quote, setQuote] = useState("");
  const nextSale = (s.seq["S"] ?? 0) + 1, nextQuote = (s.seq["QT"] ?? 0) + 1;
  return <div className="ready-stack">
    <div className="ready-grid">
      <Text label={tr("Prefix (optional)")} value={prefix} set={(v) => setPrefix(v.toUpperCase())} ph="KIF" />
      <Text label={tr("Next receipt number")} value={sale} set={setSale} mode="numeric" ph={String(nextSale)} />
      <Text label={tr("Next quotation number")} value={quote} set={setQuote} mode="numeric" ph={String(nextQuote)} />
    </div>
    <p className="settings-note">{tr("Moving from another system? Continue from your last number so nothing repeats. Numbers only move forward.")} {tr("Example")}: {prefix.trim() ? `${prefix.trim().toUpperCase()}/` : ""}S-{String(Number(sale) || nextSale).padStart(6, "0")}</p>
    <ShopButton onClick={() => run(() => saveNumbering(prefix, sale ? Number(sale) : undefined, quote ? Number(quote) : undefined), "numbering")}>{tr("Save")}</ShopButton>
  </div>;
}

function Hours({ tr, run, hours: h0, month: m0 }: { tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void; hours: string; month?: number | undefined }) {
  const [hours, setHours] = useState(h0), [month, setMonth] = useState(String(m0 ?? 1));
  return <div className="ready-stack">
    <div className="ready-grid">
      <Text label={tr("Opening hours")} value={hours} set={setHours} ph={tr("Mon–Sat 8am–8pm")} />
      <label className="inventory-field"><span>{tr("Financial year starts in")}</span><select className="inventory-input" aria-label={tr("Financial year starts in")} value={month} onChange={(e) => setMonth(e.target.value)}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{tr(m)}</option>)}</select></label>
    </div>
    <p className="settings-note">{tr("This year started on")} {new Date(financialYearStart(new Date(), Number(month))).toLocaleDateString("en-GB")}. {tr("Hours print on receipts.")}</p>
    <ShopButton onClick={() => run(() => saveHours(hours, Number(month)), "hours")}>{tr("Save")}</ShopButton>
  </div>;
}

function Pins({ s, tr, run }: { s: erp.ErpState; tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const staff = s.employees.filter((e) => e.active);
  const [pins, setPins] = useState<Record<string, string>>({});
  if (!staff.length) return <p className="settings-note">{tr("Add your staff first (Assign Users on Business Setup, or Contacts › Employees), then give each a PIN here.")}</p>;
  return <div className="ready-stack">
    <p className="settings-note">{tr("At a shared till, a cashier taps Switch cashier and types their PIN; their name goes on every sale until the next switch.")}</p>
    <ul className="ready-pins">
      {staff.map((e) => <li key={e.id}>
        <span>{e.name}{e.pin ? <small> · {tr("PIN set")}</small> : null}</span>
        <input className="inventory-input" aria-label={`${tr("PIN")} · ${e.name}`} inputMode="numeric" maxLength={4} type="password" autoComplete="off" value={pins[e.id] ?? ""} placeholder="••••" onChange={(ev) => setPins({ ...pins, [e.id]: ev.target.value.replace(/\D/g, "") })} />
        <ShopButton disabled={(pins[e.id] ?? "").length !== 4} onClick={() => run(async () => { await setStaffPin(e.id, pins[e.id]!); setPins({ ...pins, [e.id]: "" }); }, "pins")}>{tr(e.pin ? "Change" : "Set PIN")}</ShopButton>
      </li>)}
    </ul>
  </div>;
}

function Sample({ tr, run }: { tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const shop = store.get()?.shopName ?? "";
  if (isDemo()) return <div className="ready-stack">
    <p className="settings-note">{tr("Sample data is loaded. Practise selling, buying and cash-up, then clear it to start for real.")}</p>
    <div className="ready-actions">
      <ShopButton variant="outline" onClick={() => run(() => resetDemoData(shop))}>{tr("Reset sample data")}</ShopButton>
      <ShopButton onClick={() => run(() => { clearDemoData(shop); confirmStep("sample"); }, "sample")}>{tr("Clear sample data and start for real")}</ShopButton>
    </div>
  </div>;
  if (!isEmptyShop()) return <p className="settings-note">{tr("Your shop already has real records, so sample data can't be added here. Use a separate test shop to practise.")}</p>;
  return <div className="ready-stack">
    <p className="settings-note">{tr("Load a sample electronics shop with products, customers and sales to practise on. Your own records start only after you clear it.")}</p>
    <ShopButton onClick={() => run(() => { loadDemoData(); confirmStep("sample"); })}>{tr("Load sample data")}</ShopButton>
  </div>;
}

function Move({ tr, run }: { tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const [system, setSystem] = useState(MOVE_GUIDES[0]!.system);
  const guide = MOVE_GUIDES.find((g) => g.system === system)!;
  return <div className="ready-stack">
    <p className="settings-note">{tr("1. Export from your old system. 2. Upload the file below: columns are matched by name, and you see a preview before anything is saved. 3. Continue your receipt numbers under Document numbering.")}</p>
    <div className="ready-choice" role="radiogroup" aria-label={tr("Coming from")}>
      {MOVE_GUIDES.map((g) => <button key={g.system} type="button" role="radio" aria-checked={system === g.system} className={cn(system === g.system && "is-on")} onClick={() => setSystem(g.system)}>{tr(g.system)}</button>)}
    </div>
    <ol className="ready-guide">{guide.steps.map((x) => <li key={x}>{x}</li>)}</ol>
    <FullImport tr={tr} />
    <ShopButton variant="outline" onClick={() => run(() => confirmStep("move"), "move")}>{tr("I've brought everything over")}</ShopButton>
  </div>;
}
