// "Ready to sell" (owner's request, 2026-11-22): everything a shop needs before its first real sale on one page with a progress
// bar. Each step is done from real settings and records (ready-setup.ts) or skipped, and can be reopened at any time.
import { useEffect, useState } from "react";
import { CircleCheck, ChevronDown, SkipForward } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { ImportCenter } from "@/components/shopbook/import-center";
import { SmartImport } from "@/components/shopbook/smart-import";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { getTax } from "@/lib/prefs";
import { readSettings, saveSettings } from "@/lib/settings-config";
import { clearDemoData, isDemo, isEmptyShop, loadDemoData, resetDemoData } from "@/lib/demo";
import { store } from "@/lib/shopbook";
import { applyOB, obLabel, previewOB, readSheets, suggestOB, type OBKind } from "@/lib/opening-import";
import { etimsCsv, matchMpesa, mpesaFromSheets } from "@/lib/setup-extras";
import {
  MAX_PAY_ACCOUNTS, PAY_SUGGESTIONS, payAccounts, savePayAccounts, type PayAccount, READY_INFO, READY_STEPS, confirmStep, financialYearStart, paymentLines, printedRef, readyProgress, readyStatus, saveHours, saveNumbering,
  savePayments, saveTax, setOpeningFloat, setStaffPin, skipStep, type ReadyStep,
} from "@/lib/ready-setup";
import { cn } from "@/lib/utils";

type Tr = (x: string, v?: string | number) => string;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Exports to bring from other systems: where to find them and which DataQuill import takes them. */
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

export function ReadyToSell({ s, onClose, start }: { s: erp.ErpState; onClose?: () => void; start?: ReadyStep | undefined }) {
  const { tr } = useLanguage();
  const [, bump] = useState(0);
  const status = useReadyStatus(s), done = readyProgress(status);
  const [open, setOpen] = useState<ReadyStep | null>(() => start ?? READY_STEPS.find((k) => status[k] === "todo") ?? null);
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
    case "payments": return <><Payments tr={tr} run={run} /><MpesaCheck s={s} tr={tr} /></>;
    case "tax": return <><Tax tr={tr} run={run} /><EtimsExport s={s} tr={tr} /></>;
    case "stock": return <div className="ready-stack">
      <p className="settings-note">{tr("Upload your product list with the stock you have now, or add products one by one in Inventory › All Products.")}</p>
      <ImportCenter tr={tr} only="Products" />
    </div>;
    case "cash": return <OpeningCash s={s} tr={tr} run={run} />;
    case "balances": return <OpeningBalances s={s} tr={tr} run={run} />;
    case "receipt": return <ReceiptStep tr={tr} run={run} />;
    case "numbering": return <Numbering s={s} tr={tr} run={run} />;
    case "hours": return <Hours tr={tr} run={run} hours={cfg.hours} month={cfg.fyStartMonth} />;
    case "pins": return <Pins s={s} tr={tr} run={run} />;
    case "sample": return <Sample tr={tr} run={run} />;
    case "move": return <Move tr={tr} run={run} />;
  }
}

function Payments({ tr, run }: { tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  // Any country's ways to pay (owner, 2026-11-23): up to ten rows of name + number, e.g. EVC Plus 61xxxxxxx, Tigo Pesa, a bank.
  const country = store.get()?.country ?? "KEN";
  const [rows, setRows] = useState<PayAccount[]>(() => { const saved = payAccounts(); return saved.length ? saved : [{ name: "", number: "" }]; });
  const set = (i: number, p: Partial<PayAccount>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const add = (name = "") => { if (rows.length >= MAX_PAY_ACCOUNTS) return; const empty = rows.findIndex((r) => !r.name && !r.number); if (empty >= 0 && name) set(empty, { name }); else setRows([...rows, { name, number: "" }]); };
  const quick = (PAY_SUGGESTIONS[country] ?? ["Mobile money", "Bank"]).filter((n) => !rows.some((r) => r.name.toLowerCase() === n.toLowerCase()));
  return <div className="ready-stack">
    <p className="settings-note">{tr("How customers pay you: mobile money, Till, Paybill or bank, with the number. Each one becomes a payment method at the till and prints on receipts and quotations. Up to 10.")}</p>
    {quick.length > 0 && <div className="ready-choice">{quick.map((n) => <button key={n} type="button" onClick={() => add(n)}>+ {tr(n)}</button>)}</div>}
    <ul className="ready-pay-rows">
      {rows.map((r, i) => <li key={i}>
        <input className="inventory-input" aria-label={tr("Name")} placeholder={tr("e.g. EVC Plus, Tigo Pesa, KCB Bank")} value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
        <input className="inventory-input" aria-label={tr("Number")} placeholder={tr("Number (Till, phone or account)")} value={r.number} onChange={(e) => set(i, { number: e.target.value })} />
        <input className="inventory-input" aria-label={tr("Account or reference (optional)")} placeholder={tr("Account or reference (optional)")} value={r.extra ?? ""} onChange={(e) => set(i, { extra: e.target.value })} />
        <button type="button" className="ready-pay-remove" aria-label={`${tr("Remove")} ${r.name}`} onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ name: "", number: "" }])}>×</button>
      </li>)}
    </ul>
    <div className="ready-actions">
      <ShopButton variant="outline" disabled={rows.length >= MAX_PAY_ACCOUNTS} onClick={() => add()}>{tr("Add a way to pay")}</ShopButton>
      <ShopButton onClick={() => run(() => savePayAccounts(rows), "payments")}>{tr("Save")}</ShopButton>
    </div>
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
  // The same Smart Import as Business Setup (smart-import.tsx): where from, drop files, automatic check, one Import button.
  return <div className="ready-stack">
    <SmartImport tr={tr} />
    <ShopButton variant="outline" onClick={() => run(() => confirmStep("move"), "move")}>{tr("I've brought everything over")}</ShopButton>
  </div>;
}

/* Opening balances in one step (owner, 2026-11-22, like QuickBooks' opening balance wizard): typed lines go through the same engine
   as the Opening Balances import (opening-import.ts), so they post as OPENING rows with an import key and saving twice never doubles. */
type BalanceLine = { kind: OBKind; account: string; phone: string; amount: string };
const BALANCE_KINDS: [OBKind, string][] = [["mpesa", "M-Pesa"], ["bank", "Bank"], ["cash", "Cash at hand"], ["receivable", "A customer owes you"], ["payable", "You owe a supplier"]];
function OpeningBalances({ s, tr, run }: { s: erp.ErpState; tr: Tr; run: (fn: () => unknown, then?: ReadyStep) => void }) {
  const blank = (kind: OBKind = "mpesa"): BalanceLine => ({ kind, account: "", phone: "", amount: "" });
  const [lines, setLines] = useState<BalanceLine[]>(() => [blank("mpesa"), blank("bank"), blank("receivable")]);
  const set = (i: number, p: Partial<BalanceLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const save = () => run(() => {
    const filled = lines.filter((l) => l.amount.trim());
    if (!filled.length) throw new erp.ErpError("Enter at least one amount");
    const label = Object.fromEntries(BALANCE_KINDS) as Record<OBKind, string>;
    const today = new Date().toLocaleDateString("en-GB");
    const sheet = { file: "Business Setup", sheet: "Opening balances", columns: ["Source ID", "Account Type", "Account", "Phone", "Opening Amount", "Effective Date"],
      rows: filled.map((l) => ({ "Source ID": `SETUP-${l.kind}-${(l.account || label[l.kind]).trim().toLowerCase().replace(/s+/g, "-")}`, "Account Type": obLabel(l.kind), Account: l.account.trim() || label[l.kind], Phone: l.phone.trim(), "Opening Amount": l.amount.trim(), "Effective Date": today })) };
    const rows = previewOB(s, [{ sheet, mapping: suggestOB(sheet.columns) }], "DMY");
    const bad = rows.find((r) => r.status === "INVALID");
    if (bad) throw new erp.ErpError(bad.issues[0]?.problem ?? "Check the amounts");
    applyOB(rows, ["Business Setup"]);
  }, "balances");
  return <div className="ready-stack">
    <p className="settings-note">{tr("What the business has and owes on the day you start. Cash in each till is under Opening cash. These never count as sales or expenses.")}</p>
    <ul className="ready-balances">
      {lines.map((l, i) => <li key={i}>
        <select className="inventory-input" aria-label={tr("Account type")} value={l.kind} onChange={(e) => set(i, { kind: e.target.value as OBKind })}>{BALANCE_KINDS.map(([k, n]) => <option key={k} value={k}>{tr(n)}</option>)}</select>
        <input className="inventory-input" aria-label={tr("Name")} placeholder={tr(l.kind === "receivable" ? "Customer name" : l.kind === "payable" ? "Supplier name" : "Account name (optional)")} value={l.account} onChange={(e) => set(i, { account: e.target.value })} />
        {(l.kind === "receivable" || l.kind === "payable") ? <input className="inventory-input" aria-label={tr("Phone")} placeholder={tr("Phone (optional)")} value={l.phone} onChange={(e) => set(i, { phone: e.target.value })} /> : <span />}
        <input className="inventory-input" aria-label={tr("Amount")} inputMode="decimal" placeholder="0" value={l.amount} onChange={(e) => set(i, { amount: e.target.value })} />
      </li>)}
    </ul>
    <div className="ready-actions">
      <ShopButton variant="outline" onClick={() => setLines([...lines, blank("receivable")])}>{tr("Add a line")}</ShopButton>
      <ShopButton onClick={save}>{tr("Save")}</ShopButton>
    </div>
  </div>;
}

/* Suggestion 8: check an M-Pesa statement against recorded sales. Read-only; automatic matching needs a Safaricom Daraja account. */
function MpesaCheck({ s, tr }: { s: erp.ErpState; tr: Tr }) {
  const [res, setRes] = useState<ReturnType<typeof matchMpesa> | null>(null);
  const read = async (files: FileList | null) => {
    try {
      const lines = mpesaFromSheets(await readSheets(Array.from(files ?? [])));
      if (!lines.length) { toast.error(tr("No money received was found. Download the statement from M-Pesa as CSV or Excel")); return; }
      setRes(matchMpesa(s, lines));
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "That file could not be read")); }
  };
  return <div className="ready-stack ready-extra">
    <b>{tr("Check an M-Pesa statement")}</b>
    <p className="settings-note">{tr("Upload your M-Pesa statement (CSV or Excel). Each payment is matched to a sale paid by M-Pesa for the same amount within 30 minutes. Nothing is changed.")}</p>
    <label className="ready-file"><input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { void read(e.target.files); e.target.value = ""; }} /></label>
    {res && <div className="ready-mpesa">
      <p><b>{res.matched.length}</b> {tr("payments match a sale")} · <b>{res.unmatched.length}</b> {tr("payments have no sale")} · <b>{res.salesWithoutMoney.length}</b> {tr("M-Pesa sales have no payment")}</p>
      {res.unmatched.length > 0 && <ul>{res.unmatched.slice(0, 20).map((l) => <li key={l.receipt + l.at}>{l.receipt} · {new Date(l.at).toLocaleString("en-GB")} · {l.amount.toLocaleString("en-KE")} · {l.details}</li>)}</ul>}
      {res.salesWithoutMoney.length > 0 && <ul>{res.salesWithoutMoney.slice(0, 20).map((x) => <li key={x.id}>{x.ref} · {new Date(x.at).toLocaleString("en-GB")} · {(x.pay.mpesa ?? 0).toLocaleString("en-KE")}</li>)}</ul>}
    </div>}
  </div>;
}

/* Suggestion 9: a month's sales laid out for a tax agent preparing eTIMS returns. Not KRA's own upload, which needs KRA's approval. */
function EtimsExport({ s, tr }: { s: erp.ErpState; tr: Tr }) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const download = () => {
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return;
    const csv = etimsCsv(s, readSettings().taxPin, new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime() - 1);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `dataquill-solutions-sales-for-etims-${month}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  };
  return <div className="ready-stack ready-extra">
    <b>{tr("Sales for eTIMS")}</b>
    <p className="settings-note">{tr("Download a month's sales, item by item, with your KRA PIN and VAT, for your tax agent. Sending invoices to KRA directly needs KRA's approval first.")}</p>
    <div className="ready-actions"><input className="inventory-input" type="month" aria-label={tr("Month")} value={month} onChange={(e) => setMonth(e.target.value)} /><ShopButton onClick={download}>{tr("Download")}</ShopButton></div>
  </div>;
}
