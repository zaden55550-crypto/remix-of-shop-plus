// "Ready to sell" (Business Setup, owner's request 2026-11-22): what a shop needs before its first real sale, as one checklist
// with a progress bar where each step can be done or skipped. Payment details, tax, opening stock, opening cash per till,
// receipt, document numbering, business hours and financial year, staff quick PINs, sample data and moving from another
// system. Business details are business settings (settings-config.ts); records go through the ERP engine (commit).
import { addMoneyAccount } from "@/lib/finance";
import { commit, ErpError, load, paymentMethods, runErpTransaction, MAIN_LOCATION, activeShop, shopCounters, type ErpState } from "@/lib/erp";
import { hashPassword, checkPassword } from "@/lib/device-password";
import { getTax, setTax } from "@/lib/prefs";
import { countryDefaults } from "@/lib/country-defaults";
import { DEFAULT_SETTINGS, readSettings, saveSettings } from "@/lib/settings-config";
import { store } from "@/lib/shopbook";
import { isManagerRole } from "@/lib/staff-access";
import { TILL_CASHIER, tillCashier, tillLimited } from "@/lib/till-cashier";

export type PaymentDetails = { tillNumber?: string; paybill?: string; paybillAccount?: string; bankName?: string; bankAccount?: string; accounts?: PayAccount[] };
/** One way customers can pay this business, in any country (owner, 2026-11-23): EVC Plus, Tigo Pesa, MTN MoMo, a bank, a Till… */
export type PayAccount = { name: string; number: string; extra?: string | undefined };
export const MAX_PAY_ACCOUNTS = 10;
/** Common ways to pay, by country, offered as quick choices. */
export const PAY_SUGGESTIONS: Record<string, string[]> = {
  KEN: ["M-Pesa Till", "M-Pesa Paybill", "Airtel Money", "Bank"],
  SOM: ["EVC Plus", "Zaad", "Sahal", "E-Dahab", "Bank"],
  TZA: ["M-Pesa", "Tigo Pesa", "Airtel Money", "HaloPesa", "Bank"],
  UGA: ["MTN MoMo", "Airtel Money", "Bank"],
  RWA: ["MTN MoMo", "Airtel Money", "Bank"],
  ETH: ["telebirr", "CBE Birr", "Bank"],
  SSD: ["m-Gurush", "Bank"],
  NGA: ["Bank transfer", "OPay", "Moniepoint"],
  GHA: ["MTN MoMo", "Telecel Cash", "Bank"],
};
/** The business's payment accounts: the list, or (for an older setup) the Till, Paybill and bank fields it saved. */
export function payAccounts(p: PaymentDetails = readSettings().payment ?? {}): PayAccount[] {
  if (p.accounts?.length) return p.accounts;
  return [
    ...(p.tillNumber ? [{ name: "M-Pesa Till", number: p.tillNumber }] : []),
    ...(p.paybill ? [{ name: "M-Pesa Paybill", number: p.paybill, ...(p.paybillAccount ? { extra: p.paybillAccount } : {}) }] : []),
    ...(p.bankAccount ? [{ name: p.bankName || "Bank", number: p.bankAccount }] : []),
  ];
}
export const READY_STEPS = ["payments", "tax", "stock", "cash", "balances", "receipt", "numbering", "hours", "pins", "sample", "move"] as const;
export type ReadyStep = (typeof READY_STEPS)[number];
export const READY_INFO: Record<ReadyStep, { title: string; hint: string }> = {
  payments: { title: "Payment details", hint: "Up to 10 ways to pay (mobile money, Till, Paybill, bank) with their numbers, for any country" },
  tax: { title: "Tax", hint: "VAT-registered or not, the VAT rate and your KRA PIN" },
  stock: { title: "Opening stock", hint: "Bring in your products and the stock you have now" },
  cash: { title: "Opening cash", hint: "The money in each till's drawer before the first sale" },
  balances: { title: "Opening balances", hint: "Money in M-Pesa and the bank, what customers owe you and what you owe suppliers, in one step" },
  receipt: { title: "Receipt", hint: "Footer message and paper size, with a preview" },
  numbering: { title: "Document numbering", hint: "A prefix for your receipts and quotations, and where numbering starts" },
  hours: { title: "Hours & financial year", hint: "Opening hours and the month your financial year starts" },
  pins: { title: "Staff quick PIN", hint: "A 4-digit PIN so cashiers switch at a shared till in a second" },
  sample: { title: "Try with sample data", hint: "Practise on a sample shop, then clear it and start for real" },
  move: { title: "Moving from another system", hint: "Bring your products, customers, suppliers and balances from Odoo, QuickBooks, Zoho, Loyverse or Excel" },
};

/** Whether each step is done, read from real settings and records; skipped steps count as handled. */
export function readyStatus(s: Pick<ErpState, "products" | "cash" | "employees" | "seq" | "locations" | "payments">): Record<ReadyStep, "done" | "skipped" | "todo"> {
  const cfg = readSettings(), skipped = new Set(cfg.readySkipped ?? []), pay = cfg.payment ?? {};
  const done: Record<ReadyStep, boolean> = {
    payments: payAccounts(pay).length > 0,
    tax: !!cfg.taxConfirmed,
    stock: s.products.some((p) => !p.archived),
    cash: s.cash.some((e) => e.type === "OPENING"),
    balances: s.payments.some((p) => p.kind === "OPENING"),
    receipt: !!cfg.receiptConfirmed,
    numbering: !!cfg.docPrefix || Object.keys(s.seq).length > 0 && !!cfg.numberingConfirmed,
    hours: !!cfg.hours.trim() && !!cfg.fyStartMonth,
    pins: s.employees.some((e) => !!e.pin),
    sample: !!cfg.sampleTried,
    move: !!cfg.moveConfirmed,
  };
  return Object.fromEntries(READY_STEPS.map((k) => [k, done[k] ? "done" : skipped.has(k) ? "skipped" : "todo"])) as Record<ReadyStep, "done" | "skipped" | "todo">;
}
export const readyProgress = (st: Record<ReadyStep, string>) => READY_STEPS.filter((k) => st[k] !== "todo").length;

export function skipStep(step: ReadyStep, skip = true) {
  const list = new Set(readSettings().readySkipped ?? []);
  if (skip) list.add(step); else list.delete(step);
  saveSettings({ readySkipped: [...list] });
}

const digits = (v: string) => v.replace(/\s+/g, "");
export function savePayments(p: PaymentDetails) {
  const clean: PaymentDetails = {};
  for (const [k, v] of Object.entries(p) as [Exclude<keyof PaymentDetails, "accounts">, string | undefined][]) if (typeof v === "string" && v.trim()) clean[k] = v.trim();
  if (clean.tillNumber && !/^\d{5,8}$/.test(digits(clean.tillNumber))) throw new ErpError("A Till number has 5 to 8 digits");
  if (clean.paybill && !/^\d{5,7}$/.test(digits(clean.paybill))) throw new ErpError("A Paybill number has 5 to 7 digits");
  if (clean.paybillAccount && !clean.paybill) throw new ErpError("Enter the Paybill number for that account");
  saveSettings({ payment: clean });
}
/** Saves up to ten ways to pay (name + account number, and an account/reference for a Paybill). Each new name also becomes a
 *  payment method at the till, unless the business already has one by that name (M-Pesa, Cash and Bank stay as they are). */
export function savePayAccounts(list: PayAccount[]) {
  const clean = list.map((a) => ({ name: a.name.trim(), number: a.number.trim(), ...(a.extra?.trim() ? { extra: a.extra.trim() } : {}) })).filter((a) => a.name || a.number);
  if (clean.length > MAX_PAY_ACCOUNTS) throw new ErpError("Up to 10 ways to pay");
  for (const a of clean) {
    if (!a.name) throw new ErpError("Give each way to pay a name");
    if (!a.number) throw new ErpError(`Enter the number for ${a.name}`);
    if (a.name.length > 40 || a.number.length > 40) throw new ErpError("Keep names and numbers under 40 characters");
  }
  const keyOf = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (new Set(clean.map((a) => keyOf(a.name))).size !== clean.length) throw new ErpError("Each way to pay needs its own name");
  runErpTransaction(() => {
    const s = load();
    const have = new Set(paymentMethods(s).map((m) => keyOf(m.name)));
    for (const a of clean) {
      const k = keyOf(a.name);
      // M-Pesa Till and Paybill are the built-in M-Pesa method; "Bank" is the built-in Bank.
      if (have.has(k) || /^mpesa(till|paybill)?$/.test(k) || k === "bank" || k === "cash") continue;
      addMoneyAccount(a.name, /bank/i.test(a.name) ? "bank" : "mobile");
      have.add(k);
    }
  });
  saveSettings({ payment: { accounts: clean } });
}
/** The payment lines printed under a receipt or quotation. */
export function paymentLines(tr: (x: string) => string): string[] {
  const p = readSettings().payment ?? {};
  if (p.accounts?.length) return p.accounts.map((a) => `${a.name}: ${a.number}${a.extra ? ` · ${tr("Account")}: ${a.extra}` : ""}`);
  return [
    ...(p.tillNumber ? [`M-Pesa ${tr("Till")}: ${p.tillNumber}`] : []),
    ...(p.paybill ? [`M-Pesa ${tr("Paybill")}: ${p.paybill}${p.paybillAccount ? ` · ${tr("Account")}: ${p.paybillAccount}` : ""}`] : []),
    ...(p.bankAccount ? [`${p.bankName ? `${p.bankName} ` : ""}${tr("Account")}: ${p.bankAccount}`] : []),
  ];
}

export const KRA_PIN = /^[AP]\d{9}[A-Z]$/i;
export function saveTax(registered: boolean, rate: number, pin: string) {
  if (registered && !(rate > 0 && rate <= 100)) throw new ErpError("Enter the VAT rate");
  if (pin.trim() && !KRA_PIN.test(pin.trim())) throw new ErpError("A KRA PIN looks like P051234567X");
  localStorage.setItem("shopbook.tax", JSON.stringify({ on: registered, rate: registered ? rate : getTax().rate }));
  window.dispatchEvent(new Event("shopbook-prefs"));
  saveSettings({ taxPin: pin.trim().toUpperCase(), taxConfirmed: true });
}

/** Opening cash in a till's drawer (counter 1 is the shop's first till). One OPENING cash event at that counter. */
export const setOpeningFloat = (counter: number, amount: number) => commit((s, c) => {
  if (!(amount >= 0)) throw new ErpError("Enter the cash in the drawer");
  const max = shopCounters(s, activeShop(s));
  if (!(Number.isInteger(counter) && counter >= 1 && counter <= max)) throw new ErpError("Choose a till of this shop");
  if (amount === 0) return;
  s.cash.unshift({ id: crypto.randomUUID(), at: Date.now(), type: "OPENING", amount, note: "Opening float (setup)", user: c.user, ...(counter > 1 ? { counter } : {}) });
  c.audit("OPENING FLOAT", `${activeShop(s) === MAIN_LOCATION ? "Main shop" : activeShop(s)} • till ${counter} • ${amount}`);
});

/** Document numbering: an optional printed prefix (e.g. KIF) and, for a business moving from another system, the number its
 *  sales and quotations continue from. Numbers only ever move forward, so nothing already issued is repeated. */
export const PREFIX = /^[A-Z0-9]{1,6}$/;
export const saveNumbering = (prefix: string, nextSale?: number, nextQuote?: number) => commit((s, c) => {
  const p = prefix.trim().toUpperCase();
  if (p && !PREFIX.test(p)) throw new ErpError("The prefix is 1 to 6 letters or numbers");
  for (const [key, next] of [["S", nextSale], ["QT", nextQuote]] as const) {
    if (next === undefined) continue;
    if (!(Number.isInteger(next) && next >= 1 && next < 100_000_000)) throw new ErpError("Numbering starts from a whole number");
    if (next - 1 < (s.seq[key] ?? 0)) throw new ErpError(`Numbers up to ${s.seq[key]} are already used`);
    s.seq[key] = next - 1;
  }
  saveSettings({ docPrefix: p || undefined, numberingConfirmed: true });
  c.audit("NUMBERING", `${p || "no prefix"}${nextSale ? ` • sales from ${nextSale}` : ""}${nextQuote ? ` • quotations from ${nextQuote}` : ""}`);
});
/** A reference as printed: with the business's prefix when it has one (KIF/S-000001). */
export const printedRef = (ref: string) => { const p = readSettings().docPrefix; return p ? `${p}/${ref}` : ref; };

export function saveHours(hours: string, fyStartMonth: number) {
  if (!(Number.isInteger(fyStartMonth) && fyStartMonth >= 1 && fyStartMonth <= 12)) throw new ErpError("Choose the month your financial year starts");
  saveSettings({ hours: hours.trim(), fyStartMonth });
}
/** The current financial year's first day, from the month it starts. */
export function financialYearStart(now = new Date(), month = readSettings().fyStartMonth ?? 1) {
  const y = now.getMonth() + 1 >= month ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(y, month - 1, 1).getTime();
}

/* ---------- Staff quick PIN for shared tills ---------- */
// A cashier who switches in is the name and employee id on sales from this device (the server checks the id is an active employee
// with a PIN, proposed 0021). Unless their role is admin or manager, only the selling screens open (till-cashier.ts), and only the
// owner's password, the owner's till PIN or an admin/manager PIN ends their turn.
export { tillCashier, tillLimited } from "@/lib/till-cashier";
export const PIN = /^\d{4}$/;
export const setStaffPin = async (employeeId: string, pin: string) => {
  if (!PIN.test(pin)) throw new ErpError("A PIN is 4 digits");
  const hash = await hashPassword(pin);
  commit((s, c) => {
    const e = s.employees.find((x) => x.id === employeeId && x.active);
    if (!e) throw new ErpError("Employee not found");
    e.pin = hash;
    c.audit("STAFF PIN SET", e.name);
  });
};
/** The owner's own till PIN (a salted hash in business settings), to end a cashier's turn quickly. */
export async function setOwnerPin(pin: string) {
  if (!PIN.test(pin)) throw new ErpError("A PIN is 4 digits");
  saveSettings({ ownerPin: await hashPassword(pin) });
}
/** Switches the till's cashier by PIN. Returns the cashier, or throws on a wrong PIN. */
export async function switchCashier(s: Pick<ErpState, "employees">, pin: string) {
  if (!PIN.test(pin)) throw new ErpError("A PIN is 4 digits");
  for (const e of s.employees.filter((x) => x.active && x.pin)) {
    if ((await checkPassword(pin, e.pin!)).ok) {
      const who = { id: e.id, name: e.name, role: e.role };
      localStorage.setItem(TILL_CASHIER, JSON.stringify(who));
      window.dispatchEvent(new Event("shopbook-cashier"));
      return who;
    }
  }
  throw new ErpError("Wrong PIN");
}
/** Whether anything can unlock the till: an owner password, an owner till PIN or an admin/manager with a PIN. */
export function tillHasUnlock(s: Pick<ErpState, "employees">) {
  return !!(store.get()?.password || readSettings().ownerPin || s.employees.some((e) => e.active && e.pin && isManagerRole(e.role)));
}
/** Ends the cashier's turn. A limited cashier's turn needs the owner's password, the owner's till PIN or an admin/manager PIN. */
export async function endCashier(s: Pick<ErpState, "employees">, secret = "") {
  const who = tillCashier();
  if (!who) return;
  if (tillLimited() && tillHasUnlock(s)) {
    const owner = store.get()?.password, ownerPin = readSettings().ownerPin;
    const managers = s.employees.filter((e) => e.active && e.pin && isManagerRole(e.role));
    const ok = (!!owner && secret !== "" && (await checkPassword(secret, owner)).ok)
      || (!!ownerPin && PIN.test(secret) && (await checkPassword(secret, ownerPin)).ok)
      || (PIN.test(secret) && (await Promise.all(managers.map((e) => checkPassword(secret, e.pin!)))).some((r) => r.ok));
    if (!ok) throw new ErpError("Only the owner or a manager can end this turn");
  }
  localStorage.setItem(TILL_CASHIER, "null");
  window.dispatchEvent(new Event("shopbook-cashier"));
  commit((_s, c) => c.audit("TILL TURN ENDED", who.name));
}

export const confirmStep = (step: "receipt" | "move" | "sample") => saveSettings(step === "receipt" ? { receiptConfirmed: true } : step === "move" ? { moveConfirmed: true } : { sampleTried: true });

/** After Activate: the country's time zone, date format and VAT rate (country-defaults.ts), only where the owner hasn't set them. */
export function applyCountryDefaults(country?: string | null) {
  const c = countryDefaults(country);
  if (!c) return;
  const cfg = readSettings();
  const patch: Partial<typeof cfg> = {};
  if (cfg.timezone === DEFAULT_SETTINGS.timezone && c.timezone !== cfg.timezone) patch.timezone = c.timezone;
  if (cfg.dateFormat === DEFAULT_SETTINGS.dateFormat && c.dateFormat !== cfg.dateFormat) patch.dateFormat = c.dateFormat;
  if (Object.keys(patch).length) saveSettings(patch);
  if (!cfg.taxConfirmed && c.vatRate > 0 && !getTax().on) setTax({ on: false, rate: c.vatRate });
}
