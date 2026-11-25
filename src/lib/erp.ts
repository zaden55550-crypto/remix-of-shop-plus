// Zakrio Systems ERP Core — shared business data + one transaction engine.
// Every module (Inventory, Sales, POS, Purchases, Returns, Reports) reads and
// writes through `commit`, which validates and applies a whole transaction or nothing.
import { tillCashier } from "@/lib/till-cashier";
import { randomUUID } from "@/lib/id";
import { businessId, createOperation, getOutbox, persistErp, type Operation } from "@/lib/outbox";
import { canRecord, READ_ONLY_MESSAGE, STAFF_READ_ONLY_MESSAGE, store as accountStore } from "@/lib/shopbook";
import { type IndustryFamilyId } from "@/lib/industry-config";
import { businessProblem, cleanDetails, type BusinessDetails } from "@/lib/business-rules";

export type Product = AtShop & AtBusiness & {
  id: string; name: string; buy: number; sell: number; qty: number;
  sku?: string | undefined; barcode?: string | undefined; categoryId?: string | undefined; brandId?: string | undefined;
  unit?: string | undefined; image?: string | undefined; minStock?: number | undefined; createdAt: number;
  /** Pieces in one unit (a carton of 12). Information only: stock is always counted in the unit. */
  pieces?: number | undefined; description?: string | undefined; reorderLevel?: number | undefined;
  /** Kept for its history but hidden from selling, buying and stock screens. */
  archived?: boolean | undefined;
  variants?: { id: string; name: string; qty: number; sell?: number | undefined }[] | undefined;
  /** Chosen attribute values, by attribute id (Size: S, M). Stock stays on the product total. */
  attributes?: Record<string, string[]> | undefined;
  /** What another shop charges, by location id. A shop not listed charges `sell`, which is also the main shop's price. */
  prices?: Record<string, number> | undefined;
  /** Wholesale & retail prices (Settings › Features): this price each from `from` units (6 and above…), and for wholesale
   *  customers. Applied at the till as the line's own price (reason "Wholesale price"), so the sale records what was charged. */
  wholesale?: { price: number; from: number } | undefined;
  /** Serial / IMEI tracking (Settings › Features): every unit sold must name one of `serials`, and each is sold once
   *  (recordSale refuses otherwise, on the device and on the server). `warrantyMonths` dates the warranty on the receipt. */
  serialTracked?: boolean | undefined;
  warrantyMonths?: number | undefined;
  serials?: SerialUnit[] | undefined;
  /** Gas cylinder exchange (Settings › Features): this product is the full or the empty cylinders of one brand and size,
   *  `pairId` the other one. A full one's `deposit` is charged with a new cylinder and paid back when it is returned. */
  gas?: GasCylinder | undefined;
  /** Prescriptions & controlled drugs: a sale of it needs the prescription's details; controlled ones go in the register. */
  rx?: "prescription" | "controlled" | undefined;
};
export type GasCylinder = { brand: string; size: number; kind: "full" | "empty"; pairId: string; deposit?: number | undefined };
/** How a full gas cylinder was sold: a refill for an empty brought in (`emptyId`, any brand of the same size), or a new
 *  cylinder with its deposit (part of the line's price, held for the customer, not sales income). */
export type GasSale = { mode: "refill"; emptyId: string } | { mode: "new"; deposit: number };
/** One unit of a serial-tracked product: its serial / IMEI, and the sale it went to (none while in stock). */
export type SerialUnit = { code: string; addedAt: number; sold?: { saleId: string; ref: string; at: number } | undefined };
/** The location a record belongs to. Untagged means the main shop, so records from before shops were separated need no conversion. */
export type AtShop = { locationId?: string | undefined };
/** The business a record belongs to. Untagged means the owner's first/active business, so records from before multi-business
 *  was separated need no conversion and stay visible there. */
export type AtBusiness = { businessId?: string | undefined };
export type Named = { id: string; name: string };
export type CatalogItem = AtBusiness & Named & { description?: string | undefined; icon?: string | undefined; logo?: string | undefined; active?: boolean | undefined };
export type UnitType = "quantity" | "weight" | "volume" | "length";
/** `factor` of `baseId` make one of this unit: a Carton with base Piece and factor 24. */
export type Unit = { id: string; name: string; abbr: string; type: UnitType; active?: boolean | undefined; baseId?: string | undefined; factor?: number | undefined };
export type LocationType = "shop" | "store" | "warehouse";
/** `connected`: on a shop, the stores and warehouses whose stock it may view. Viewing changes nothing. */
export type Location = AtBusiness & { id: string; name: string; code: string; type: LocationType; address?: string | undefined; phone?: string | undefined; managerId?: string | undefined; connected?: string[] | undefined; active?: boolean | undefined; createdAt: number;
  /** Pictures of the place (shop front, inside), small data URLs. Information only. */
  photos?: string[] | undefined;
  /** This shop's or warehouse's own logo, a small data URL. Information only; separate from the business logo and the photos. */
  logo?: string | undefined;
  /** A shop's tills (Counter 1…N), within the plan's counter allowance (`counterLimit`, shopbook.ts). Left out: one counter. */
  counters?: number | undefined;
  /** Which of the business's types this shop is (Supermarket, Butchery…), chosen on Business Setup. Display only; left out: the main type. */
  placeType?: string | undefined;
  /** Per-location receipt details (owner, 2026-11-23): a heading line, opening hours and a tax PIN printed on this location's receipts
   *  instead of the business's. Left out: the business's own. */
  receiptHeader?: string | undefined; hours?: string | undefined; taxPin?: string | undefined;
  /** A shop's usual warehouse: transfers and restocking start from it. Must be one of its connected warehouses. */
  defaultWarehouse?: string | undefined;
};
/** The till a sale, payment, cash event or return happened at. Left out: counter 1, so a one-counter shop's records never change. */
export type AtCounter = { counter?: number | undefined };
/** One business the owner runs. The first has the fixed id `biz-main`, like the default units, so older records need no conversion.
 *  It usually has no row: its name, currency and industry are the owner's account details (`mainBusiness`). */
export type Business = { id: string; name: string; currency: string; country?: string | undefined; phone?: string | undefined; email?: string | undefined; businessType?: string | undefined; businessTypes?: readonly string[] | undefined; industryFamilyId?: string | undefined; createdAt: number; active?: boolean | undefined;
  /** A short code that starts this business's reference numbers (B2-SALE-000001), so they never repeat another business's. Not on the first business. */
  code?: string | undefined;
  /** This business's own settings for the built-in Cash, M-Pesa and Bank (name, order, category, disabled). The first business keeps them as
   *  `moneyAccounts` rows with the fixed ids; another business can't reuse those ids, so its settings live on its own record. */
  paymentSettings?: Partial<Record<BuiltInMoney, MoneyAccount>> | undefined };
export type AttributeValue = { id: string; name: string; active?: boolean | undefined };
export type Attribute = { id: string; name: string; values: AttributeValue[]; active?: boolean | undefined };
export type MoveType = "OPENING" | "PURCHASE" | "STOCK IN" | "SALE" | "STOCK OUT" | "ADJUSTMENT" | "RETURN" | "TRANSFER OUT" | "TRANSFER IN" | "TRANSFER CANCEL";
export type Movement = AtBusiness & {
  id: string; at: number; type: MoveType; productId: string; qty: number;
  prev: number; next: number; reason?: string | undefined; source?: string | undefined; user: string;
  /** The store or warehouse this movement happened at. Untagged stock is the shared pool the shops sell from. */
  locationId?: string | undefined;
} & Lot;
/** A batch and its expiry date (YYYY-MM-DD), recorded when stock comes in and on an expired write-off (batches.ts). */
export type Lot = { batch?: string | undefined; expiry?: string | undefined };
export type Transfer = AtBusiness & {
  id: string; ref: string; productId: string; qty: number; from: string; to: string;
  status: "PENDING" | "SENT" | "RECEIVED" | "CANCELLED"; at: number; user: string; note?: string | undefined;
  /** Set when that end of the transfer is a store or warehouse, whose stock is counted separately. */
  fromId?: string | undefined; toId?: string | undefined;
};
export type Audit = AtShop & AtBusiness & { id: string; at: number; action: string; detail: string; user: string };
export type ErpState = {
  products: Product[]; categories: CatalogItem[]; brands: CatalogItem[]; units: Unit[]; attributes: Attribute[]; locations: Location[];
  movements: Movement[]; transfers: Transfer[]; audit: Audit[]; seq: Record<string, number>;
  customers: Customer[]; sales: Sale[]; payments: Payment[]; returns: SaleReturn[]; cash: CashEvent[];
  employees: Employee[]; commissions: Commission[]; payrolls: PayrollRun[]; payrollPayments: PayrollPayment[];
  suppliers: Supplier[]; purchases: Purchase[]; purchaseReturns: PurchaseReturn[]; purchaseOrders: PurchaseOrder[]; supplierInvoices: SupplierInvoice[]; expenses: Expense[]; expenseCategories: (Named & AtBusiness)[];
  otherContacts: OtherContact[]; contactCategories: (Named & AtBusiness)[]; payrollDrafts: PayrollDraft[];
  moneyAccounts: MoneyAccount[];
  /** One row per business the owner runs. Untagged means the first business, so older records need no conversion. */
  businesses: Business[];
  /** Trade documents (features 5, 6, 8). Held on this device until the server says it takes them (proposed 0021; heldOnDevice in outbox.ts). */
  laybys: Layby[]; quotations: Quotation[]; prescriptions: Prescription[];
};
/** Deposits & lay-by: goods kept aside for a customer who pays in parts and collects when paid in full. The goods leave
 *  sellable stock when it starts (a STOCK OUT "Lay-by held"), and come back if it is cancelled; each part payment is a
 *  payment (kind DEBT, source the lay-by's ref) into "Lay-by deposits held"; collecting turns it into a normal sale. */
export type Layby = AtShop & AtBusiness & { id: string; ref: string; at: number; customerId: string; items: { productId: string; name: string; qty: number; price: number }[];
  total: number; paid: number; dueAt?: number | undefined; status: "open" | "collected" | "cancelled"; saleId?: string | undefined; saleRef?: string | undefined;
  fee?: number | undefined; refunded?: number | undefined; closedAt?: number | undefined; user: string; note?: string | undefined };
/** Quotations: a priced offer that changes nothing until it is turned into a sale. */
export type Quotation = AtShop & AtBusiness & { id: string; ref: string; at: number; validUntil: number; customerId?: string | undefined; customerName?: string | undefined;
  items: { productId: string; name: string; qty: number; price: number }[]; total: number; status: "open" | "converted" | "cancelled"; saleId?: string | undefined; saleRef?: string | undefined; note?: string | undefined; user: string };
/** Prescriptions & controlled drugs: the prescription kept with a sale of prescription-only or controlled products. */
export type Prescription = AtShop & AtBusiness & { id: string; at: number; saleId: string; saleRef: string; patient: string; prescriber: string; number?: string | undefined;
  photo?: string | undefined; items: { productId: string; name: string; qty: number; controlled: boolean }[]; user: string };
export type ContactDetails = { email?: string | undefined; address?: string | undefined; notes?: string | undefined; active?: boolean | undefined };
export type OtherContact = ContactDetails & AtBusiness & { id: string; name: string; phone?: string | undefined; category?: string | undefined; createdAt: number };
export type PayrollDraft = AtBusiness & { id: string; employeeId: string; from: number; to: number; deductions: number; notes?: string; at: number };
export type Supplier = AtBusiness & { id: string; name: string; phone?: string | undefined; email?: string | undefined; address?: string | undefined; info?: string | undefined; notes?: string | undefined; contact?: string | undefined; active?: boolean | undefined; balance: number; createdAt: number };
export type PurchaseItem = Lot & { productId: string; name: string; qty: number; cost: number; returned: number; bought?: { qty: number; unit: string } | undefined };
export type Purchase = AtShop & AtBusiness & { id: string; ref: string; at: number; supplierId?: string | undefined; items: PurchaseItem[]; total: number; pay: PayRecord; user: string; settled?: number | undefined; importKey?: string | undefined; note?: string | undefined; orderId?: string | undefined; cancelled?: { at: number; reason: string; user: string } | undefined };
export type OrderStatus = "Draft" | "Sent" | "Partially Received" | "Completed" | "Cancelled";
/** Goods asked for. Stock only moves when they are received, which makes a purchase linked back by `orderId`. */
export type PurchaseOrder = AtShop & AtBusiness & { id: string; ref: string; at: number; supplierId: string; expectedAt?: number | undefined; lines: { productId: string; name: string; qty: number; cost: number; received: number }[]; total: number; status: OrderStatus; note?: string | undefined; cancelReason?: string | undefined; user: string };
/** The supplier's document. It never moves a balance: what it shows as paid is read from its purchases (purchasing.ts). */
export type SupplierInvoice = AtShop & AtBusiness & { id: string; number: string; supplierId: string; purchaseId?: string | undefined; orderId?: string | undefined; at: number; dueAt?: number | undefined; amount: number; note?: string | undefined; user: string; createdAt: number };
export type PurchaseReturn = AtShop & AtBusiness & { id: string; ref: string; at: number; purchaseId: string; purchaseRef: string; items: { productId: string; name: string; qty: number; amount: number }[]; amount: number; refund: Method; reason?: string | undefined; user: string };
export type Expense = AtShop & AtBusiness & { id: string; ref: string; at: number; category: string; description?: string | undefined; note?: string | undefined; amount: number; method: Method; user: string };
export type CommissionRule = { kind: "none" | "percent" | "fixed" | "profit"; value: number; paidOnly: boolean; products?: { productId: string; kind: "percent" | "fixed" | "profit"; value: number }[] | undefined };
export type Employee = AtBusiness & { id: string; name: string; /** Staff quick PIN for shared tills (a salted hash). */ pin?: string | undefined; phone?: string | undefined; notes?: string; role: string; comp: "salary" | "salary+commission" | "commission"; salary: number; rule: CommissionRule; active: boolean; createdAt: number;
  /** People & Access. All optional: an employee made in Payroll has none of them until someone edits it there. */
  code?: string | undefined; email?: string | undefined; businessRefs?: string[] | undefined; locationIds?: string[] | undefined; accessRole?: string | undefined; startDate?: string | undefined; employmentType?: string | undefined; status?: "active" | "suspended" | "terminated" | undefined; terminatedAt?: number | undefined; memberId?: string | undefined;
  /** The counters this person may sell at, per shop (location id → counter numbers), chosen on Business Setup. A shop left out: any counter. */
  counters?: Record<string, number[]> | undefined;
  /** Their own access chosen before they had a login (differences from the role, access-levels.ts); applied to the server when the login is made. */
  access?: Record<string, boolean> | undefined;
};
/** Commission ledger: adjustments are new negative rows, never edits/deletes. */
export type Commission = AtBusiness & { id: string; at: number; employeeId: string; source: string; amount: number; kind: "EARNED" | "RETURN ADJUSTMENT"; pending: boolean; payrollId?: string | undefined; productAmounts?: Record<string, number> };
export type PayrollRun = AtBusiness & { id: string; ref: string; at: number; employeeId: string; from: number; to: number; salary: number; commission: number; deductions: number; net: number; paid: number; user: string };
export type PayrollPayment = AtShop & AtBusiness & { id: string; ref: string; at: number; payrollId: string; employeeId: string; method: Method; amount: number; user: string };
export type BaseMethod = "cash" | "mpesa" | "bank" | "credit";
/** A money account the owner named (Airtel Money, Equity Bank…). Its id is what payments and pay splits record. */
export type AccountMethod = `acct-${string}`;
export type Method = BaseMethod | AccountMethod;
/** Anywhere money actually sits: every method except Credit. */
export type MoneyMethod = Exclude<Method, "credit">;
/** How a sale or purchase was paid. Cash, M-Pesa, Bank and Credit are always present; named accounts only when used. */
export type PayRecord = Record<BaseMethod, number> & { [k: AccountMethod]: number };
/** What kind of money a payment method is, whatever the business calls it (EVC and M-Pesa are both mobile money). Credit is never a method. */
export type PaymentCategory = "cash" | "mobile" | "bank" | "card" | "cheque" | "wallet" | "other";
export const PAYMENT_CATEGORIES: { id: PaymentCategory; label: string }[] = [
  { id: "cash", label: "Cash" }, { id: "mobile", label: "Mobile money" }, { id: "bank", label: "Bank transfer" }, { id: "card", label: "Card" },
  { id: "cheque", label: "Cheque" }, { id: "wallet", label: "Wallet" }, { id: "other", label: "Other" },
];
/**
 * A business's payment method. Methods the owner adds have an `acct-` id. Cash, M-Pesa and Bank keep their fixed ids ("cash", "mpesa",
 * "bank") and need no record; a record with that id is written only when the owner renames, disables, reorders or recategorises one
 * (like the built-in units), so every sale, payment and balance keeps pointing at the same id whatever it is called.
 */
export type MoneyAccount = AtBusiness & { id: MoneyMethod; name: string; active?: boolean | undefined; createdAt: number; category?: PaymentCategory | undefined; order?: number | undefined };
/** The built-in methods, in their default order. Credit is a payment state, not a method. */
export const METHODS: BaseMethod[] = ["cash", "mpesa", "bank", "credit"];
export const BUILT_IN_MONEY = ["cash", "mpesa", "bank"] as const;
export type BuiltInMoney = (typeof BUILT_IN_MONEY)[number];
export const isBuiltInMoney = (m: string): m is BuiltInMoney => m === "cash" || m === "mpesa" || m === "bank";
export const METHOD_LABEL: Record<BaseMethod, string> = { cash: "Cash", mpesa: "M-Pesa", bank: "Bank", credit: "Credit" };
const BUILT_IN_CATEGORY: Record<BuiltInMoney, PaymentCategory> = { cash: "cash", mpesa: "mobile", bank: "bank" };
/** A guard against runaway lists, not a business rule: far more than any shop uses. Counts methods in use. */
export const MONEY_ACCOUNT_LIMIT = 30;
export const isAccountMethod = (m: string): m is AccountMethod => m.startsWith("acct-");
/** Methods the owner added (acct- ids); the built-in rows are only settings for Cash, M-Pesa and Bank. */
export const namedAccounts = (s: Pick<ErpState, "moneyAccounts">) => (s.moneyAccounts ?? []).filter((a) => isAccountMethod(a.id));
/** Names of every method, refreshed whenever records load, so a label can be shown without passing the records around. */
const accountNames = new Map<string, string>();
function rememberAccounts(list: MoneyAccount[] | undefined) { accountNames.clear(); for (const a of list ?? []) accountNames.set(a.id, a.name); }
/** A method's name as this business calls it. Built-ins without a saved name give their default (English, for `tr`). */
export function methodName(m: string, s?: Pick<ErpState, "moneyAccounts">): string {
  if (m === "credit") return METHOD_LABEL.credit;
  // With records given, a built-in's name is that business's own; the device-wide cache holds the first business's names, so it is used only without records.
  const own = s?.moneyAccounts?.find((a) => a.id === m)?.name ?? (s && isBuiltInMoney(m) ? undefined : accountNames.get(m));
  if (own) return own;
  return isBuiltInMoney(m) ? METHOD_LABEL[m] : "Other account";
}
export type PaymentMethodInfo = { id: MoneyMethod; name: string; category: PaymentCategory; active: boolean; builtIn: boolean; order: number; createdAt: number };
/** Payment methods suited to a new business's country. Mobile money is called M-Pesa in Kenya and Mobile Money elsewhere; the method's id
 *  (and so every pay record) stays "mpesa". The owner can rename, reorder or disable any of them later. */
export function defaultPaymentSettings(country: string | undefined): Business["paymentSettings"] {
  const c = (country ?? "").trim().toUpperCase();
  if (!c || c === "KEN" || c === "KENYA") return undefined;
  return { mpesa: { id: "mpesa", name: "Mobile Money", category: "mobile", order: 1, createdAt: Date.now() } };
}
/** The payment method settings one business reads: the first business's untagged rows (Cash, M-Pesa and Bank under their fixed ids, and the
 *  methods it added), or another business's own settings for the built-ins and the methods it added. Rows are returned as saved, so a change
 *  made through them is saved on the right business. */
export function businessMoneyAccounts(s: Pick<ErpState, "moneyAccounts" | "businesses">, business: string): MoneyAccount[] {
  const rows = s.moneyAccounts ?? [];
  if (business === MAIN_BUSINESS) return rows.filter((a) => !a.businessId || a.businessId === MAIN_BUSINESS);
  const settings = (s.businesses ?? []).find((b) => b.id === business)?.paymentSettings ?? {};
  return [...BUILT_IN_MONEY.flatMap((id) => (settings[id] ? [settings[id]!] : [])), ...rows.filter((a) => isAccountMethod(a.id) && a.businessId === business)];
}
/** Every payment method of this business in its display order (disabled ones included, marked). The one list every screen reads. */
export function paymentMethods(s: Pick<ErpState, "moneyAccounts">): PaymentMethodInfo[] {
  const rows = s.moneyAccounts ?? [];
  const built = BUILT_IN_MONEY.map((id, i): PaymentMethodInfo => { const r = rows.find((a) => a.id === id); return { id, name: r?.name || METHOD_LABEL[id], category: r?.category ?? BUILT_IN_CATEGORY[id], active: r?.active !== false, builtIn: true, order: r?.order ?? i, createdAt: r?.createdAt ?? 0 }; });
  const named = rows.filter((a) => isAccountMethod(a.id)).map((a, i): PaymentMethodInfo => ({ id: a.id, name: a.name, category: a.category ?? "other", active: a.active !== false, builtIn: false, order: a.order ?? BUILT_IN_MONEY.length + i, createdAt: a.createdAt }));
  const all = [...built, ...named], pos = new Map(all.map((m, i) => [m.id, i]));
  return all.sort((x, y) => x.order - y.order || pos.get(x.id)! - pos.get(y.id)!);
}
/** Where money can be received or paid from now, in the business's order. With `all`, disabled methods too (history and balances). */
export function moneyMethods(s: Pick<ErpState, "moneyAccounts">, all = false): MoneyMethod[] {
  return paymentMethods(s).filter((m) => all || m.active).map((m) => m.id);
}
/** The method a new payment starts on: the first one in use (Cash unless the owner changed it). */
export const defaultMethod = (s: Pick<ErpState, "moneyAccounts">): MoneyMethod => moneyMethods(s)[0] ?? "cash";
const known = (s: Pick<ErpState, "moneyAccounts">, m: string) => isBuiltInMoney(m) || moneyMethods(s, true).includes(m as MoneyMethod);
/** A method's on-screen label: the business's own names exactly as typed, the default names (Cash, M-Pesa, Bank, Credit) translated. */
export function methodLabel(m: string, s: Pick<ErpState, "moneyAccounts"> | undefined, tr: (t: string) => string): string {
  const own = s?.moneyAccounts?.find((a) => a.id === m)?.name ?? (s && isBuiltInMoney(m) ? undefined : accountNames.get(m));
  return own ?? tr(methodName(m, s));
}
/** The methods a pay record used, in the business's order, then any it no longer lists, then Credit (what is still owed) last. */
export function payLines(s: Pick<ErpState, "moneyAccounts">, pay: Record<string, number | undefined>): [Method, number][] {
  const order = moneyMethods(s, true) as string[];
  const used = Object.entries(pay).filter(([m, v]) => m !== "credit" && (v ?? 0) > 0) as [Method, number][];
  used.sort(([a], [b]) => (order.indexOf(a) + 1 || 1e6) - (order.indexOf(b) + 1 || 1e6));
  return (pay["credit"] ?? 0) > 0 ? [...used, ["credit", pay["credit"] ?? 0]] : used;
}
/** The amount a pay record puts on one method (0 when it doesn't use it). */
export const payAmount = (pay: Record<string, number | undefined>, m: string) => pay[m] ?? 0;
/** Every method a pay record uses, Credit included. */
export const payParts = (pay: PayRecord) => (Object.entries(pay) as [Method, number][]).filter(([, v]) => v > 0);
/** Money actually received or paid (everything except Credit). */
export const paidAmount = (pay: PayRecord) => Math.round(payParts(pay).reduce((a, [m, v]) => (m === "credit" ? a : a + v), 0) * 100) / 100;
export const emptyPayRecord = (): PayRecord => ({ cash: 0, mpesa: 0, bank: 0, credit: 0 });
/** Every key must be a built-in method or one of this business's accounts (a new record needs an active one), and no amount may be negative. */
/** The business recording now: an employee's sale on the server belongs to their shop's business, otherwise the one open on this device. */
function workingBusiness(s: Pick<ErpState, "locations" | "businesses">): string {
  return intentRun ? businessOfShop(s, intentRun.shop) : activeBusiness(s);
}
/** The payment methods a check uses: a business view already holds only its own; the whole state is narrowed to the business recording now. */
function methodsFor(s: Pick<ErpState, "moneyAccounts"> & Partial<Pick<ErpState, "businesses" | "locations">>): Pick<ErpState, "moneyAccounts"> {
  if (!s.businesses || viewedBusiness(s)) return s;
  return { moneyAccounts: businessMoneyAccounts({ moneyAccounts: s.moneyAccounts, businesses: s.businesses }, workingBusiness({ locations: s.locations ?? [], businesses: s.businesses })) };
}
export function checkPayRecord(full: Pick<ErpState, "moneyAccounts">, pay: PayRecord, live = true) {
  const s = methodsFor(full);
  const usable = new Set<string>(["credit", ...moneyMethods(s, !live)]);
  for (const [m, v] of Object.entries(pay)) {
    // Every pay record carries cash, mpesa and bank (0 when unused), so a disabled built-in is refused only when it holds money.
    if (!usable.has(m) && !(isBuiltInMoney(m) && v === 0)) throw new ErpError(known(s, m) ? `${methodName(m, s)} is no longer in use` : "Unknown payment method");
    if (!(typeof v === "number" && Number.isFinite(v) && v >= 0)) throw new ErpError("Payment amounts can't be negative");
  }
}
/** A method chosen for one payment or refund must exist and be in use. */
export function checkMethod(full: Pick<ErpState, "moneyAccounts">, m: Method, allowCredit = true) {
  const s = methodsFor(full);
  if (m === "credit") { if (!allowCredit) throw new ErpError("Choose where the money goes"); return; }
  if (!moneyMethods(s).includes(m)) throw new ErpError(known(s, m) ? `${methodName(m, s)} is no longer in use` : "Unknown payment method");
}
/** `wholesale`: a wholesale customer, who gets each product's wholesale price whatever the quantity (Wholesale & retail prices). */
export type Customer = ContactDetails & AtShop & AtBusiness & { id: string; name: string; phone?: string | undefined; balance: number; createdAt: number; wholesale?: boolean | undefined; /** Loyalty points already used (shop-tools.ts). */ pointsUsed?: number | undefined };
/** `unit`: the product's unit when sold (kg, pcs…), so receipts can say "1.25 kg × 700/kg". Older sales have none. */
/** `wholesale`: the line was charged the product's wholesale price (Wholesale & retail prices), so receipts can mark it. */
export type SaleItem = { productId: string; name: string; qty: number; price: number; cost: number; returned: number; unit?: string | undefined; wholesale?: true | undefined;
  /** The serials / IMEIs sold on this line and the warranty end (serial-tracked products). */
  serials?: string[] | undefined; warrantyUntil?: number | undefined;
  /** A gas cylinder sold as a refill (with the empty received) or as a new cylinder (with the deposit per unit). */
  gas?: GasSale | undefined };
export type Sale = AtShop & AtBusiness & AtCounter & {
  id: string; ref: string; at: number; items: SaleItem[]; subtotal: number; discount: number; total: number;
  pay: PayRecord; customerId?: string | undefined; cashier: string; /** The employee who switched in by PIN at a shared till (checked by the server). */ cashierId?: string | undefined; channel: "POS" | "Sales"; sellerId?: string | undefined;
  /** Credit paid off after the sale; `pay` stays as recorded at sale time so accounting never double counts. */
  settled?: number | undefined;
  /** VAT included in `total` (0 when VAT is off). */
  vat?: number | undefined;
  /** Set when the sale came from the Universal Import Center; blocks re-import. */
  importKey?: string | undefined;
};
export type Payment = AtShop & AtBusiness & AtCounter & { id: string; ref: string; at: number; method: Method; amount: number; kind: "SALE" | "DEBT" | "REFUND" | "PURCHASE" | "SUPPLIER PAYMENT" | "SUPPLIER REFUND" | "EXPENSE" | "TRANSFER" | "DEPOSIT" | "WITHDRAWAL" | "OPENING" | "LAYBY"; source: string; customerId?: string | undefined; supplierId?: string | undefined; importKey?: string | undefined; user: string; docRef?: string | undefined; note?: string | undefined };
export type SaleReturn = AtShop & AtBusiness & AtCounter & { id: string; ref: string; at: number; saleId: string; saleRef: string; items: { productId: string; name: string; qty: number; amount: number; serials?: string[] | undefined }[]; amount: number; refund: Method; user: string };
export type CashEvent = AtShop & AtBusiness & AtCounter & { id: string; at: number; type: "OPENING" | "CASH IN" | "CASH OUT" | "CASH UP"; amount: number; note?: string | undefined; expected?: number | undefined; counted?: number | undefined; user: string };

const KEY = "shopbook.erp";
const EVT = "shopbook-erp";
export const empty = (): ErpState => ({ products: [], categories: [], brands: [], units: [], attributes: [], locations: [], movements: [], transfers: [], audit: [], seq: {}, customers: [], sales: [], payments: [], returns: [], cash: [], employees: [], commissions: [], payrolls: [], payrollPayments: [], suppliers: [], purchases: [], purchaseReturns: [], purchaseOrders: [], supplierInvoices: [], expenses: [], expenseCategories: [], otherContacts: [], contactCategories: [], payrollDrafts: [], moneyAccounts: [], businesses: [], laybys: [], quotations: [], prescriptions: [] });
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
let transaction: { state: ErpState; preview?: boolean } | undefined;
/** Set while an employee's sale is worked out, on the server against the real records or on their device against their copy. Everything inside is synchronous. */
let intentRun: { shop: string; user: string; copy: boolean } | undefined;

// ---------- Shops: each location has its own records, stock and prices ----------
export const MAIN_LOCATION = "loc-main";
const SHOP_KEY = "shopbook.activeShop";
export const atShop = (row: AtShop, shop: string) => (row.locationId ?? MAIN_LOCATION) === shop;
/** Locations and, when known, the businesses they may belong to. Older callers pass only the locations: that is the first business. */
type ShopSource = Pick<ErpState, "locations"> & { businesses?: Business[] | undefined };
const businessOfSource = (s: ShopSource) => activeBusiness({ businesses: s.businesses ?? [] });
/** The shop chosen on this device, or null for all shops together. Only an owner's device has a choice; an employee's copy is already one shop's.
 *  A shop only counts while it belongs to the business being worked in, so a shop chosen in one business never carries into another. */
export function selectedShop(s: ShopSource): string | null {
  try {
    const id = localStorage.getItem(SHOP_KEY), business = businessOfSource(s);
    if (!id) return null;
    if (id === MAIN_LOCATION) return business === MAIN_BUSINESS ? id : null;
    return s.locations.some((l) => l.id === id && l.active !== false && atBusiness(l, business)) ? id : null;
  } catch { return null; }
}
export function selectShop(id: string | null) {
  if (id) localStorage.setItem(SHOP_KEY, id); else localStorage.removeItem(SHOP_KEY);
  window.dispatchEvent(new Event(EVT));
}
/** Where a business records with all its shops showing: the first business's main shop, or another business's first shop (made with it). */
export function defaultShop(s: ShopSource): string {
  const business = businessOfSource(s);
  if (business === MAIN_BUSINESS) return MAIN_LOCATION;
  const own = s.locations.filter((l) => l.type === "shop" && l.active !== false && atBusiness(l, business)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return own[0]?.id ?? MAIN_LOCATION;
}
/** Where anything recorded now happens. With all shops showing, that is the business's default shop. */
export function activeShop(s: ShopSource): string {
  if (intentRun) return intentRun.shop;
  try {
    const staff = JSON.parse(localStorage.getItem("shopbook.account") || "null")?.staff as { activeLocationId?: string; locations?: { id: string; erpRef?: string | null }[] } | undefined;
    if (staff) return staff.locations?.find((l) => l.id === staff.activeLocationId)?.erpRef || MAIN_LOCATION;
  } catch { return MAIN_LOCATION; }
  return selectedShop(s) ?? defaultShop(s);
}
// ---------- Counters: several tills in one shop ----------
export const MAX_COUNTERS = 50;
/** A record's counter: untagged records are counter 1. */
export const counterOf = (row: AtCounter) => (row.counter && row.counter > 1 ? row.counter : 1);
/** How many counters a shop has (1 when none are set). */
export const shopCounters = (s: Pick<ErpState, "locations">, shop: string) => Math.max(1, Math.min(MAX_COUNTERS, Math.floor(s.locations.find((l) => l.id === shop)?.counters ?? 1)));
const counterKey = (shop: string) => `shopbook.counter@${shop}`;
/** The counters someone may sell at in a shop: an employee's own choice from Business Setup (their record on their copy),
 *  otherwise every counter the shop has. The owner may use any. */
export function allowedCounters(s: Pick<ErpState, "locations"> & { employees?: Employee[] | undefined }, shop: string): number[] {
  const all = Array.from({ length: shopCounters(s, shop) }, (_, i) => i + 1);
  try {
    const member = JSON.parse(localStorage.getItem("shopbook.account") || "null")?.staff?.memberId as string | undefined;
    if (!member) return all;
    const me = (s.employees ?? []).find((e) => e.memberId === member);
    const mine = me?.counters?.[shop]?.filter((n) => all.includes(n));
    return mine?.length ? mine : all;
  } catch { return all; }
}
/** The counter this device sells at in the shop being worked in. Kept per device and shop; always one this person may use. */
export function activeCounter(s: Pick<ErpState, "locations"> & { businesses?: Business[] | undefined; employees?: Employee[] | undefined }): number {
  if (intentRun) return 1;
  try {
    const shop = activeShop(s), allowed = allowedCounters(s, shop), n = Number(localStorage.getItem(counterKey(shop)) || 1);
    return allowed.includes(n) ? n : allowed[0] ?? 1;
  } catch { return 1; }
}
export function selectCounter(shop: string, n: number) {
  try { if (n > 1) localStorage.setItem(counterKey(shop), String(n)); else localStorage.removeItem(counterKey(shop)); } catch { /* a device without storage sells at counter 1 */ }
  window.dispatchEvent(new Event(EVT));
}
/** A counter sent with a sale: a whole number from 2 up, or nothing (counter 1). An odd value is never refused, so an offline sale is never lost. */
const cleanCounter = (n: unknown) => (typeof n === "number" && Number.isInteger(n) && n > 1 && n <= MAX_COUNTERS ? n : undefined);
const COUNTER_RECORDS = ["sales", "payments", "cash", "returns"] as const;
/** Money a save creates at the till is tagged with this device's counter, done here once like the shop. */
function stampCounter(before: ErpState, after: ErpState, counter: number) {
  if (counter <= 1) return;
  for (const key of COUNTER_RECORDS) {
    const old = new Set((before[key] as { id: string }[]).map((r) => r.id));
    for (const row of after[key] as (AtCounter & { id: string })[]) if (!old.has(row.id) && row.counter === undefined) row.counter = counter;
  }
}

export const shopPrice = (p: Pick<Product, "sell" | "prices">, shop: string) => (shop === MAIN_LOCATION ? p.sell : p.prices?.[shop] ?? p.sell);
/** A location's stock is the sum of its movements. The main shop holds whatever no other location does, so its older untagged stock stays its own. */
export function shopStock(s: Pick<ErpState, "movements">, p: Pick<Product, "id" | "qty">, shop: string) {
  if (intentRun?.copy) return p.qty; // An employee's copy already holds only their location's count.
  if (shop !== MAIN_LOCATION) return heldAt(s, p.id, shop);
  return roundQty(p.qty - s.movements.reduce((sum, m) => (m.productId === p.id && m.locationId ? sum + m.qty : sum), 0));
}
/** The products a location carries: the ones it created, and any that have had stock moved there. Other shops' products aren't its own, so a shop sees only these. */
export function carriedAt(s: Pick<ErpState, "products" | "movements">, shop: string) {
  const ids = new Set(s.products.filter((p) => atShop(p, shop)).map((p) => p.id));
  for (const m of s.movements) if (atShop(m, shop)) ids.add(m.productId);
  return ids;
}
const SHOP_RECORDS = ["products", "audit", "customers", "sales", "payments", "returns", "cash", "purchases", "purchaseReturns", "purchaseOrders", "supplierInvoices", "expenses", "payrollPayments"] as const;
/** Every record a save creates carries its shop. Done here once, so no action or importer can forget it. */
function stampShop(before: ErpState, after: ErpState, shop: string) {
  if (shop === MAIN_LOCATION) return;
  for (const key of SHOP_RECORDS) {
    const rows = after[key] as (AtShop & AtBusiness & { id: string })[];
    const old = new Set((before[key] as { id: string }[]).map((r) => r.id));
    for (const row of rows) if (!old.has(row.id) && !row.locationId) row.locationId = shop;
  }
}

export const MAIN_BUSINESS = "biz-main";
/** Untagged legacy records belong to the first business. */
export const atBusiness = (row: AtBusiness, business: string) => (row.businessId ?? MAIN_BUSINESS) === business;
const BUS_RECORDS = ["products", "categories", "brands", "units", "attributes", "locations", "movements", "transfers", "audit", "customers", "sales", "payments", "returns", "cash", "employees", "commissions", "payrolls", "payrollPayments", "suppliers", "purchases", "purchaseReturns", "purchaseOrders", "supplierInvoices", "expenses", "expenseCategories", "otherContacts", "contactCategories", "moneyAccounts", "payrollDrafts", "businesses"] as const;
/** Every record a save creates carries its business. Done here once, so no action or importer can forget it.
 *  A business row is not owned by another business, so creating one while working in a second business never tags it. */
function stampBusiness(before: ErpState, after: ErpState, business: string) {
  if (business === MAIN_BUSINESS) return;
  for (const key of BUS_RECORDS) {
    if (key === "businesses") continue;
    const rows = after[key] as (AtBusiness & { id: string })[];
    const old = new Set((before[key] as { id: string }[]).map((r) => r.id));
    for (const row of rows) if (!old.has(row.id) && !row.businessId) row.businessId = business;
  }
}
/** Remembers which business a filtered copy of the records shows (`scopeToBusiness`), so helpers such as `listLocations`
 *  never add the first business's main shop to another business's view. The whole state is never marked. */
const businessViews = new WeakMap<object, string>();
export function markBusinessView<T extends object>(s: T, business: string): T { businessViews.set(s, business); return s; }
export const viewedBusiness = (s: object): string | undefined => businessViews.get(s);
const BUSINESS_KEY = "shopbook.activeBusiness";
/** The business this device is recording into: the owner's choice while it exists and is open, otherwise the first business.
 *  The first business always exists (it is the account's own), so an owner can always get back to it. */
export function activeBusiness(s: Pick<ErpState, "businesses">): string {
  try {
    const id = localStorage.getItem(BUSINESS_KEY);
    if (id && id !== MAIN_BUSINESS && (s.businesses ?? []).some((b) => b.id === id && b.active !== false)) return id;
  } catch { /* ignore */ }
  return MAIN_BUSINESS;
}
/** Works in another business. The chosen shop belongs to the business being left, so it is cleared: the next business opens on all its shops. */
export function selectBusiness(id: string | null) {
  const next = id && id !== MAIN_BUSINESS ? id : null;
  let previous: string | null = null;
  try { previous = localStorage.getItem(BUSINESS_KEY); } catch { /* ignore */ }
  if (next) localStorage.setItem(BUSINESS_KEY, next); else localStorage.removeItem(BUSINESS_KEY);
  if (previous !== next) localStorage.removeItem(SHOP_KEY);
  window.dispatchEvent(new Event(EVT));
  window.dispatchEvent(new Event("shopbook-settings")); // each business has its own settings (settings-config.ts)
}
/** The first business. Older owners have no row for it: it is the account's own name, currency, country and industry. */
export function mainBusiness(s: Pick<ErpState, "businesses">): Business {
  const row = (s.businesses ?? []).find((b) => b.id === MAIN_BUSINESS);
  const a = accountStore.get();
  const types = a?.businessTypes?.filter(Boolean).length ? a.businessTypes : a?.businessType ? [a.businessType] : undefined;
  return {
    id: MAIN_BUSINESS,
    name: a?.shopName?.trim() || row?.name || "My Business",
    currency: a?.currency || row?.currency || "KES",
    country: a?.country ?? row?.country,
    phone: a?.phone ?? row?.phone,
    email: a?.email ?? row?.email,
    businessType: types?.[0] ?? row?.businessType,
    businessTypes: types ?? row?.businessTypes,
    industryFamilyId: a?.industryFamilyId ?? row?.industryFamilyId,
    createdAt: row?.createdAt ?? a?.trialStart ?? 0,
    active: true,
  };
}
/** Every business of this owner: the first business, then the others in the order they were made. Pass the whole state, not one business's view. */
export function listBusinesses(s: Pick<ErpState, "businesses">): Business[] {
  const others = (s.businesses ?? []).filter((b) => b.id !== MAIN_BUSINESS && b.active !== false).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return [mainBusiness(s), ...others];
}
/** The business a location belongs to; the built-in main shop and untagged locations are the first business's. */
export function businessOfShop(s: Pick<ErpState, "locations">, shop: string): string {
  return shop === MAIN_LOCATION ? MAIN_BUSINESS : s.locations.find((l) => l.id === shop)?.businessId ?? MAIN_BUSINESS;
}
/** The code that starts another business's reference numbers: the one saved on it, or one made from its id for a business saved before codes. */
export function businessCode(s: Pick<ErpState, "businesses">, business: string): string {
  const b = (s.businesses ?? []).find((x) => x.id === business);
  return b?.code || `B${business.slice(-4).toUpperCase()}`;
}
/** A new business's code: B2, B3… in the order businesses are made (the first business is B1 and keeps its plain numbers). */
export function nextBusinessCode(s: Pick<ErpState, "businesses">): string {
  const used = new Set((s.businesses ?? []).map((b) => b.code).filter(Boolean));
  for (let n = 2; ; n++) if (!used.has(`B${n}`)) return `B${n}`;
}

/** After the trial nothing new is recorded and nothing existing changes, whichever screen, importer or restore asks. Viewing and exporting
 *  never come through here. The server refuses the same uploads (drizzle/proposed/0014), so a changed device can't get round it. */
export function assertCanRecord() {
  const a = accountStore.get();
  if (!canRecord(a)) throw new ErpError(a?.staff ? STAFF_READ_ONLY_MESSAGE : READ_ONLY_MESSAGE);
}

/** Multi-stage imports/previews never expose intermediate records or operations to storage. */
export function runErpTransaction<T>(work: () => T, persist = true): T {
  if (transaction) return work();
  if (persist) assertCanRecord();
  const baseline = localStorage.getItem(KEY), before = load();
  transaction = { state: structuredClone(before), ...(persist ? {} : { preview: true }) };
  try {
    const result = work(), after = transaction.state;
    if (persist) {
      if (localStorage.getItem(KEY) !== baseline) throw new ErpError("Records changed in another window. Review and retry.");
      const existing = getOutbox(), operation = createOperation(before, after);
      const bootstrap = !existing.length && !localStorage.getItem("shopbook.syncInitialized") ? createOperation(empty(), before, true) : null;
      persistErp(after, [...existing, ...(bootstrap ? [bootstrap] : []), ...(operation ? [operation] : [])]);
      window.dispatchEvent(new Event(EVT));
    }
    return result;
  } finally { transaction = undefined; }
}

export function load(): ErpState {
  if (transaction) return structuredClone(transaction.state);
  if (typeof window === "undefined") return empty();
  try { const { __outbox: _outbox, ...data } = JSON.parse(localStorage.getItem(KEY) || "{}"); const state: ErpState = { ...empty(), ...data }; rememberAccounts(state.moneyAccounts); return state; } catch { return empty(); }
}

export class ErpError extends Error {}

/** Atomic transaction: works on a copy; saves only if every step succeeds. */
export function commit<T>(fn: (s: ErpState, ctx: Ctx) => T): T {
  // A preview (runErpTransaction without saving) and the server's own work out of an employee's sale are not recording on this device.
  if (!intentRun && !transaction?.preview) assertCanRecord();
  if (!intentRun && isEmployeeDevice()) throw new ErpError("Employee logins can record sales and customers for now. Ask your manager to record this.");
  const baseline = transaction ? null : localStorage.getItem(KEY);
  const before = load();
  const draft: ErpState = structuredClone(before);
  const ctx = makeCtx(draft);
  const out = fn(draft, ctx); // throws → nothing is saved
  stampShop(before, draft, ctx.shop);
  stampBusiness(before, draft, ctx.business);
  stampCounter(before, draft, activeCounter(draft));
  checkProducts(before, draft);
  if (transaction) { transaction.state = draft; return out; }
  if (localStorage.getItem(KEY) !== baseline) throw new ErpError("Records changed in another window. Review and retry.");
  const operation = createOperation(before, draft);
  const existing = getOutbox();
  const bootstrap = !existing.length && !localStorage.getItem("shopbook.syncInitialized") ? createOperation(empty(), before, true) : null;
  persistErp(draft, [...existing, ...(bootstrap ? [bootstrap] : []), ...(operation ? [operation] : [])]);
  window.dispatchEvent(new Event(EVT));
  return out;
}

/** Every save, whatever the screen or importer: products it creates or changes can't hold negative or
 *  non-numeric quantities or prices. Unchanged products are skipped so older data never blocks a save. */
function checkProducts(before: ErpState, after: ErpState) {
  const old = new Map(before.products.map((p) => [p.id, JSON.stringify(p)]));
  const bad = (n: unknown) => n !== undefined && !(typeof n === "number" && Number.isFinite(n) && n >= 0);
  for (const p of after.products) {
    if (old.get(p.id) === JSON.stringify(p)) continue;
    if (bad(p.qty) || p.variants?.some((v) => bad(v.qty))) throw new ErpError(`Quantity can't be negative (${p.name})`);
    if (bad(p.buy) || bad(p.sell) || p.variants?.some((v) => bad(v.sell)) || Object.values(p.prices ?? {}).some(bad)) throw new ErpError(`Prices can't be negative (${p.name})`);
    if (bad(p.minStock) || bad(p.reorderLevel)) throw new ErpError(`Minimum stock can't be negative (${p.name})`);
    if (p.pieces !== undefined && !(Number.isInteger(p.pieces) && p.pieces >= 1)) throw new ErpError(`Pieces must be a whole number of 1 or more (${p.name})`);
  }
}

/** The numbering a business brought from its old system for this counter key, if any (see continueNumbering). */
export function refFormat(seq: Record<string, number>, key: string): { prefix: string; width: number } | null {
  let best: { prefix: string; width: number; at: number } | null = null;
  for (const [k, at] of Object.entries(seq)) {
    if (!k.startsWith(`fmt:${key}|`)) continue;
    const [, prefix = "", width = ""] = k.slice(4).split("|");
    const w = Number(width);
    if (Number.isInteger(w) && w >= 1 && w <= 12 && (!best || at > best.at)) best = { prefix, width: w, at };
  }
  return best && { prefix: best.prefix, width: best.width };
}
type Ctx = ReturnType<typeof makeCtx>;
function makeCtx(s: ErpState) {
  // An employee's sale worked out on the server happens at their shop, so it belongs to that shop's business (never the first by default).
  const user = currentUser(), shop = activeShop(s), business = intentRun ? businessOfShop(s, shop) : activeBusiness(s);
  return {
    user, shop, business,
    /** A sale, purchase or debt is dealt with at its own shop, so its money and stock go back to the right place. */
    here(row: AtShop) {
      if (atShop(row, shop)) return;
      const id = row.locationId ?? MAIN_LOCATION, name = s.locations.find((l) => l.id === id)?.name ?? "the main shop";
      throw new ErpError(`This belongs to ${name}. Switch to that shop first`);
    },
    /** A record belongs to one business. Switching businesses never shows another's private records. */
    hereBiz(row: AtBusiness) {
      if (atBusiness(row, business)) return;
      const id = row.businessId ?? MAIN_BUSINESS, name = s.businesses.find((b) => b.id === id)?.name ?? "the first business";
      throw new ErpError(`This belongs to ${name}. Switch to that business first`);
    },
    /** The next reference number. The first business keeps its counters and numbers (SALE-000123). Every other business counts on its own
     *  (`SALE@<business>`) and starts its numbers with its code (B2-SALE-000001), so numbering is independent per business and a number
     *  never matches another business's record. Counted inside the one save, so a device never gives two records the same number. */
    nextRef(prefix: string) {
      const key = business === MAIN_BUSINESS ? prefix : `${prefix}@${business}`;
      s.seq[key] = (s.seq[key] ?? 0) + 1;
      // A business that moved in keeps its own numbering: after C003840 comes C003841 (continueNumbering, imports).
      const fmt = refFormat(s.seq, key);
      if (fmt) return `${fmt.prefix}${String(s.seq[key]).padStart(fmt.width, "0")}`;
      if (business === MAIN_BUSINESS) return `${prefix}-${String(s.seq[key]).padStart(6, "0")}`;
      return `${businessCode(s, business)}-${prefix}-${String(s.seq[key]).padStart(6, "0")}`;
    },
    /** Continue this kind of document from the last number a business used in its old system (owner, 2026-11-25): `ref` like
     *  C003840 makes the next one C003841. Numbers only move forward. The format is kept in `seq` (which every device syncs) as the
     *  key `fmt:<key>|<prefix>|<width>`; the newest such key wins. Returns false when the reference has no number at its end. */
    continueNumbering(prefix: string, ref: string) {
      const m = /^(.*?)(\d+)$/.exec(ref.trim());
      if (!m || m[2]!.length > 12) return false;
      const key = business === MAIN_BUSINESS ? prefix : `${prefix}@${business}`;
      const head = m[1]!.slice(0, 20), n = Number(m[2]);
      if (/[|]/.test(head)) return false;
      s.seq[key] = Math.max(s.seq[key] ?? 0, n);
      s.seq[`fmt:${key}|${head}|${m[2]!.length}`] = Date.now();
      return true;
    },
    audit(action: string, detail: string) { s.audit.unshift({ id: uid(), at: Date.now(), action, detail, user }); },
    /** Happens at the active shop unless a location is named; naming MAIN_LOCATION means the main shop whichever shop is active. */
    move(productId: string, type: MoveType, delta: number, reason?: string, source?: string, at?: string, lot?: Lot) {
      const named = at ?? shop, locationId = named === MAIN_LOCATION ? undefined : named;
      const p = s.products.find((x) => x.id === productId);
      if (!p) throw new ErpError("Product not found");
      if (!Number.isFinite(delta) || delta === 0) throw new ErpError("Enter a valid quantity");
      const next = Math.round((p.qty + delta) * 1000) / 1000;
      if (next < 0) throw new ErpError(`Not enough stock for ${p.name} (available ${p.qty})`);
      if (delta < 0) checkHeldStock(s, p, -delta, locationId);
      const l = cleanLot(lot);
      s.movements.unshift({ id: uid(), at: Date.now(), type, productId, qty: delta, prev: p.qty, next, reason, source, user, ...(locationId ? { locationId } : {}), ...l });
      p.qty = next;
    },
  };
}

/** A lot as typed: a batch of up to 40 characters and a real calendar date. Nothing typed means no lot; a wrong date is refused. */
export function cleanLot(lot: Lot | undefined): Lot {
  const batch = lot?.batch?.trim().slice(0, 40) || undefined, expiry = lot?.expiry?.trim() || undefined;
  if (expiry && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || Number.isNaN(Date.parse(`${expiry}T00:00:00Z`)) || new Date(`${expiry}T00:00:00Z`).toISOString().slice(0, 10) !== expiry)) throw new ErpError("Enter a valid expiry date");
  return { ...(batch ? { batch } : {}), ...(expiry ? { expiry } : {}) };
}

export const isStorageLocation = (l: Location) => l.type !== "shop";
/** A store's or warehouse's stock of a product: the sum of the movements recorded there, so it can only change through movements. */
export const heldAt = (s: Pick<ErpState, "movements">, productId: string, locationId: string) => roundQty(s.movements.reduce((sum, m) => (m.productId === productId && m.locationId === locationId ? sum + m.qty : sum), 0));
const heldElsewhere = (s: ErpState, productId: string) => s.movements.reduce((sum, m) => (m.productId === productId && m.locationId ? sum + m.qty : sum), 0);

/** Stock at a location leaves only from there, and another shop can't sell it until a transfer has brought it across. */
function checkHeldStock(s: ErpState, p: Product, taken: number, locationId?: string) {
  if (intentRun?.copy) return;
  if (!s.locations.some((l) => l.id !== MAIN_LOCATION)) return;
  if (locationId) {
    const at = s.locations.find((l) => l.id === locationId), held = heldAt(s, p.id, locationId);
    if (taken > held + 1e-9) throw new ErpError(`Not enough stock for ${p.name} at ${at?.name ?? "this location"} (available ${held})`);
    return;
  }
  const held = heldElsewhere(s, p.id);
  if (held > 0 && p.qty - taken < held - 1e-9) throw new ErpError(`Not enough stock for ${p.name} here (available ${roundQty(Math.max(p.qty - held, 0))}). Transfer the rest from the warehouse first`);
}

const storageLocation = (s: ErpState, id?: string) => {
  if (!id) return undefined;
  const l = s.locations.find((x) => x.id === id);
  if (!l || !isStorageLocation(l)) throw new ErpError("Choose a store or warehouse");
  return l.id;
};

function currentUser() {
  if (intentRun) return intentRun.user;
  // A cashier who switched in with their PIN at a shared till (ready-setup.ts) is recorded by name.
  const t = tillCashier(); if (t) return t.name;
  try { const a = JSON.parse(localStorage.getItem("shopbook.account") || "null"); return a?.shopName ? `Admin` : "Admin"; } catch { return "Admin"; }
}

/** Deleting products is for admins. The signed-in account is the shop's owner, which is an admin, unless it says otherwise. */
export function isAdmin() {
  try { return JSON.parse(localStorage.getItem("shopbook.account") || "null")?.role !== "staff"; } catch { return false; }
}
/** An employee's device holds a filtered, read-only copy from the server, which must never be saved back. */
function isEmployeeDevice() {
  try { return Boolean(JSON.parse(localStorage.getItem("shopbook.account") || "null")?.staff); } catch { return false; }
}
function requireAdmin() { if (!isAdmin()) throw new ErpError("Only an admin can delete products"); }

export function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb); window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener("storage", cb); };
}

// ---------- Shared product search (Inventory, Sales, POS, Purchases) ----------
export function searchProducts(s: ErpState, q: string) {
  const t = q.trim().toLowerCase();
  const live = s.products.filter((p) => !p.archived);
  if (!t) return live;
  // A serial / IMEI (5+ characters, typed or scanned in full) finds its product too.
  const serial = t.length >= 5 ? serialKey(t) : "";
  return live.filter((p) => [p.name, p.sku, p.barcode].some((v) => v?.toLowerCase().includes(t)) || (!!serial && !!p.serials?.some((u) => serialKey(u.code) === serial)));
}
export const findByCode = (s: ErpState, code: string) =>
  s.products.find((p) => !p.archived && (p.barcode === code || p.sku?.toLowerCase() === code.toLowerCase()))
  ?? s.products.find((p) => !p.archived && !!p.serials?.some((u) => serialKey(u.code) === serialKey(code)));

/** Reorder level used when a product has none of its own. Every screen, report and the Dashboard share it. */
export const DEFAULT_MIN_STOCK = 5;
export function stockStatus(p: Product): "OK" | "LOW" | "OUT" {
  if (p.archived) return "OK"; // an archived product no longer asks to be restocked
  if (p.qty <= 0) return "OUT";
  if (p.qty <= (p.minStock ?? DEFAULT_MIN_STOCK)) return "LOW";
  return "OK";
}

// ---------- Inventory actions ----------
export type NewProduct = Omit<Product, "id" | "createdAt">;
const code = (v?: string) => v?.trim() || undefined;
/** Within a shop, a barcode or SKU (SKU ignores case) identifies one product, so scanning and search never pick the wrong item. */
function checkCodes(s: ErpState, shop: string, p: { barcode?: string | undefined; sku?: string | undefined }, selfId?: string) {
  const mine = carriedAt(s, shop), others = s.products.filter((x) => x.id !== selfId && mine.has(x.id));
  if (p.barcode && others.some((x) => code(x.barcode) === p.barcode)) throw new ErpError("Barcode already used by another product");
  const sku = p.sku?.toLowerCase();
  if (sku && others.some((x) => code(x.sku)?.toLowerCase() === sku)) throw new ErpError("SKU already used");
}
function checkVariants(variants: Product["variants"]) {
  const names = (variants ?? []).map((v) => v.name.trim().toLowerCase());
  if (names.some((n) => !n)) throw new ErpError("Every variant needs a name");
  if (new Set(names).size !== names.length) throw new ErpError("Variant names must be different");
}
const variantTotal = (variants: Product["variants"]) => roundQty((variants ?? []).reduce((a, v) => a + v.qty, 0));
/** Products counted in whole units (pcs, boxes…) can't be received, removed, counted or moved in fractions. */
function checkWhole(s: ErpState, p: Product, qty: number) {
  if (isWholeUnit(p.unit, s.units) && !Number.isInteger(roundQty(qty))) throw new ErpError(`${p.name} is counted in whole ${p.unit || "pcs"} only`);
}
const findProduct = (s: ErpState, id: string) => { const p = s.products.find((x) => x.id === id); if (!p) throw new ErpError("Product not found"); return p; };

export const addProduct = (input: NewProduct) => commit((s, c) => {
  const name = input.name.trim();
  if (!name) throw new ErpError("Product name is required");
  if (!(input.buy >= 0) || !(input.sell >= 0) || !(input.qty >= 0)) throw new ErpError("Prices and quantity can't be negative");
  const barcode = code(input.barcode);
  const sku = code(input.sku);
  checkCodes(s, c.shop, { barcode, sku });
  checkVariants(input.variants);
  if (input.variants?.length && Math.abs(variantTotal(input.variants) - input.qty) > 0.0005) throw new ErpError("Opening quantity must equal the total of its variants");
  // Optional product identifiers stay blank unless the user supplies them.
  const p: Product = { ...input, name, barcode, sku, qty: 0, id: uid(), createdAt: Date.now() };
  s.products.unshift(p);
  if (input.qty > 0) c.move(p.id, "OPENING", input.qty, "Opening stock");
  c.audit("PRODUCT CREATED", `${p.name}${sku ? ` (${sku})` : ""}`);
  return p;
});

/** Edits product details. Quantity only changes through stock movements, so it can't be patched here. */
export const updateProduct = (id: string, patch: Partial<Omit<Product, "qty" | "id" | "createdAt">>) => commit((s, c) => {
  const p = findProduct(s, id);
  const next = { ...p, ...patch, id: p.id, qty: p.qty, createdAt: p.createdAt };
  // Working in another shop, the selling price on the form is that shop's own, and the others keep theirs.
  if (c.shop !== MAIN_LOCATION && patch.sell !== undefined) {
    next.sell = p.sell;
    if (patch.sell !== shopPrice(p, c.shop)) { c.audit("SHOP PRICE", `${p.name} • ${shopPrice(p, c.shop)} → ${patch.sell}`); next.prices = { ...p.prices, [c.shop]: patch.sell }; }
  }
  next.name = next.name.trim(); next.barcode = code(next.barcode); next.sku = code(next.sku);
  if (!next.name) throw new ErpError("Product name is required");
  checkCodes(s, p.locationId ?? c.shop, next, id);
  checkVariants(next.variants);
  if (patch.variants && variantTotal(patch.variants) !== variantTotal(p.variants)) throw new ErpError("Variant quantities change through stock movements");
  const changes = (["buy", "sell"] as const).filter((k) => next[k] !== p[k]).map((k) => `${k === "buy" ? "Buying" : "Selling"} price ${p[k]} → ${next[k]}`);
  Object.assign(p, next);
  c.audit("PRODUCT EDITED", [p.name, ...changes].join(" • "));
});

/** One shop's own selling price; null puts it back on the main price. */
export const setShopPrice = (productId: string, shop: string, price: number | null) => commit((s, c) => {
  const p = findProduct(s, productId);
  if (shop === MAIN_LOCATION || !s.locations.some((l) => l.id === shop && l.type === "shop")) throw new ErpError("Choose another shop");
  if (price !== null && !(price >= 0 && Number.isFinite(price))) throw new ErpError("Prices can't be negative");
  if (price === (p.prices?.[shop] ?? null)) return;
  const rest = Object.fromEntries(Object.entries(p.prices ?? {}).filter(([id]) => id !== shop));
  const next = price === null ? rest : { ...rest, [shop]: price };
  if (Object.keys(next).length) p.prices = next; else delete p.prices;
  c.audit("SHOP PRICE", `${p.name} • ${s.locations.find((l) => l.id === shop)?.name} • ${price ?? `back to ${p.sell}`}`);
});

/** How many past records use this product: sales, purchases, transfers and stock movements other than its opening stock.
 *  A product with any of these is archived, never deleted, so history and accounting keep their meaning. */
export function productHistory(s: ErpState, id: string) {
  return s.sales.filter((x) => x.items.some((i) => i.productId === id)).length
    + s.purchases.filter((x) => x.items.some((i) => i.productId === id)).length
    + s.transfers.filter((t) => t.productId === id).length
    + s.movements.filter((m) => m.productId === id && m.type !== "OPENING").length;
}

/** Products holding stock can't be deleted: their value would vanish from Inventory and Accounting with no record. */
export const deleteProduct = (id: string, reason?: string) => commit((s, c) => {
  requireAdmin();
  const p = s.products.find((x) => x.id === id); if (!p) return;
  if (s.transfers.some((t) => t.productId === id && (t.status === "PENDING" || t.status === "SENT"))) throw new ErpError("Product has an open transfer");
  if (p.qty > 0) throw new ErpError(`${p.name} still has ${p.qty} in stock. Record a Stock Out or Adjustment to 0 first`);
  if (productHistory(s, id)) throw new ErpError(`${p.name} has transaction history. Archive it instead`);
  s.products = s.products.filter((x) => x.id !== id); c.audit("PRODUCT DELETED", `${p.name}${p.sku ? ` (${p.sku})` : ""}${reason ? ` · Reason: ${reason}` : ""}`);
});

/** Hides a product that has history. It must hold no stock, so nothing of value disappears from view. */
export const archiveProduct = (id: string, reason?: string) => commit((s, c) => {
  requireAdmin();
  const p = findProduct(s, id);
  if (s.transfers.some((t) => t.productId === id && (t.status === "PENDING" || t.status === "SENT"))) throw new ErpError("Product has an open transfer");
  if (p.qty > 0) throw new ErpError(`${p.name} still has ${p.qty} in stock. Record a Stock Out or Adjustment to 0 first`);
  p.archived = true;
  c.audit("PRODUCT ARCHIVED", `${p.name}${p.sku ? ` (${p.sku})` : ""}${reason ? ` · Reason: ${reason}` : ""}`);
});
/** An admin's Delete: any stock left is written off as a Stock Out, in one step, so its value leaves on the record. A product with any history (that write-off included) is archived; only a clean one is erased. */
export const removeProduct = (id: string) => commit((s, c) => {
  requireAdmin();
  const p = findProduct(s, id);
  if (s.transfers.some((t) => t.productId === id && (t.status === "PENDING" || t.status === "SENT"))) throw new ErpError("Product has an open transfer");
  const label = `${p.name}${p.sku ? ` (${p.sku})` : ""}`;
  if (p.qty > 0) {
    const qty = p.qty;
    for (const l of s.locations.filter((x) => x.id !== MAIN_LOCATION)) { const held = heldAt(s, id, l.id); if (held > 0) c.move(id, "STOCK OUT", -held, "Product deleted", c.nextRef("SO"), l.id); }
    if (p.qty > 0) c.move(id, "STOCK OUT", -p.qty, "Product deleted", c.nextRef("SO"), MAIN_LOCATION);
    c.audit("STOCK OUT", `${p.name} • -${qty} • Product deleted`);
  }
  if (productHistory(s, id)) { p.archived = true; c.audit("PRODUCT ARCHIVED", label); return "archived" as const; }
  s.products = s.products.filter((x) => x.id !== id);
  c.audit("PRODUCT DELETED", label);
  return "deleted" as const;
});
export const restoreProduct = (id: string) => commit((s, c) => {
  const p = findProduct(s, id);
  delete p.archived;
  c.audit("PRODUCT RESTORED", p.name);
});

/** `cost` is the latest unit cost; when given it becomes the buying price, like Purchases' "update cost". */
export const stockIn = (productId: string, qty: number, reason: string, cost?: number, locationId?: string, lot?: Lot) => commit((s, c) => {
  const p = findProduct(s, productId);
  if (!(qty > 0)) throw new ErpError("Quantity must be more than 0");
  checkWhole(s, p, qty);
  if (cost !== undefined && !(cost >= 0 && Number.isFinite(cost))) throw new ErpError("Enter a valid cost price");
  const ref = c.nextRef("SI");
  c.move(productId, reason === "Purchase" ? "PURCHASE" : reason === "Return" ? "RETURN" : "STOCK IN", roundQty(qty), reason, ref, storageLocation(s, locationId), lot);
  if (cost !== undefined && cost !== p.buy) { c.audit("COST UPDATED", `${p.name} • ${p.buy} → ${cost}`); p.buy = cost; }
  c.audit("STOCK IN", `${p.name} • +${roundQty(qty)} • ${reason}`);
  return ref;
});

export const stockOut = (productId: string, qty: number, reason: string, locationId?: string) => commit((s, c) => {
  const p = findProduct(s, productId);
  if (!(qty > 0)) throw new ErpError("Quantity must be more than 0");
  checkWhole(s, p, qty);
  c.move(productId, "STOCK OUT", -roundQty(qty), reason, c.nextRef("SO"), storageLocation(s, locationId));
  c.audit("STOCK OUT", `${p.name} • -${roundQty(qty)} • ${reason}`);
});

export const adjustStock = (productId: string, counted: number, reason: string) => commit((s, c) => {
  const p = findProduct(s, productId);
  if (!reason.trim()) throw new ErpError("A reason is required");
  if (!(counted >= 0) || !Number.isFinite(counted)) throw new ErpError("Counted stock can't be negative");
  checkWhole(s, p, counted);
  const prev = shopStock(s, p, c.shop);
  const delta = roundQty(counted - prev); if (delta === 0) throw new ErpError("Counted stock matches the system");
  c.move(productId, "ADJUSTMENT", delta, reason, c.nextRef("ADJ"));
  c.audit("STOCK ADJUSTMENT", `${p.name} • Previous ${prev} • Adjustment ${delta > 0 ? "+" : ""}${delta} • New ${roundQty(prev + delta)} • ${reason}`);
});

// Transfers: stock leaves on SEND, returns to the combined on-hand total on RECEIVE, and is restored on CANCEL.
// An end that is a store or warehouse is tagged, so its own stock moves only at dispatch and at receipt.
export const createTransfer = (productId: string, qty: number, to: string, from: string, note?: string) => commit((s, c) => {
  const p = findProduct(s, productId);
  if (!(qty > 0)) throw new ErpError("Quantity must be more than 0");
  checkWhole(s, p, qty);
  if (!to.trim()) throw new ErpError("Choose a destination shop");
  if (to.trim().toLowerCase() === from.trim().toLowerCase()) throw new ErpError("Destination must be a different location");
  if (qty > p.qty + 1e-9) throw new ErpError(`Not enough stock for ${p.name} (available ${p.qty})`);
  const storageNamed = (name: string) => s.locations.find((l) => l.id !== MAIN_LOCATION && l.name.trim().toLowerCase() === name.trim().toLowerCase());
  const source = storageNamed(from), target = storageNamed(to);
  if (source && qty > heldAt(s, productId, source.id) + 1e-9) throw new ErpError(`Not enough stock for ${p.name} at ${source.name} (available ${heldAt(s, productId, source.id)})`);
  const t: Transfer = { id: uid(), ref: c.nextRef("TR"), productId, qty: roundQty(qty), from, to: to.trim(), status: "PENDING", at: Date.now(), user: c.user, note: note?.trim() || undefined, ...(source ? { fromId: source.id } : {}), ...(target ? { toId: target.id } : {}) };
  s.transfers.unshift(t); c.audit("TRANSFER CREATED", `${t.ref} • ${p.name} • ${t.qty} → ${t.to}`); return t;
});
export const sendTransfer = (id: string) => commit((s, c) => {
  const t = s.transfers.find((x) => x.id === id); if (!t || t.status !== "PENDING") throw new ErpError("Transfer can't be sent");
  c.move(t.productId, "TRANSFER OUT", -t.qty, `To ${t.to}`, t.ref, t.fromId ?? MAIN_LOCATION); t.status = "SENT"; c.audit("TRANSFER SENT", t.ref);
});
export const receiveTransfer = (id: string) => commit((s, c) => {
  const t = s.transfers.find((x) => x.id === id);
  if (!t || t.status !== "SENT") throw new ErpError("Already received or not sent"); // prevents double receiving
  c.move(t.productId, "TRANSFER IN", t.qty, `From ${t.from}`, t.ref, t.toId ?? MAIN_LOCATION);
  t.status = "RECEIVED"; c.audit("TRANSFER RECEIVED", `${t.ref} at ${t.to}`);
});
export const cancelTransfer = (id: string) => commit((s, c) => {
  const t = s.transfers.find((x) => x.id === id);
  if (!t || t.status === "RECEIVED" || t.status === "CANCELLED") throw new ErpError("Transfer can't be cancelled");
  if (t.status === "SENT") c.move(t.productId, "TRANSFER CANCEL", t.qty, "Transfer cancelled", t.ref, t.fromId ?? MAIN_LOCATION);
  t.status = "CANCELLED"; c.audit("TRANSFER CANCELLED", t.ref);
});

const needBusinessOwner = () => { if (!isAdmin() || accountStore.get()?.staff) throw new ErpError("Only the owner can manage businesses"); };
/** Adds another business to this owner. Locations, products and money stay separate; only the business row is shared.
 *  Use `createBusiness` (businesses.ts), which also makes its first location in the same save. */
export const addBusiness = (input: BusinessDetails) => commit((s, c) => {
  needBusinessOwner();
  const problem = businessProblem(input, listBusinesses(s).map((b) => b.name));
  if (problem) throw new ErpError(problem);
  const d = cleanDetails(input);
  const b: Business = { id: uid(), name: d.name, currency: d.currency, country: d.country, phone: d.phone, ...(d.email ? { email: d.email } : {}), businessType: d.businessType, businessTypes: [...(d.businessTypes ?? [d.businessType])], industryFamilyId: d.industryFamilyId as IndustryFamilyId, createdAt: Date.now(), active: true, code: nextBusinessCode(s) };
  const methods = defaultPaymentSettings(d.country);
  if (methods) b.paymentSettings = methods;
  s.businesses.push(b);
  c.audit("BUSINESS CREATED", `${b.name} • ${b.businessType}`);
  return b;
});
/** Changes another business's own details. The first business's details are the owner's account (Settings › Business Profile). */
export const updateBusiness = (id: string, input: BusinessDetails) => commit((s, c) => {
  needBusinessOwner();
  if (id === MAIN_BUSINESS) throw new ErpError("Change the first business in Settings › Business Profile");
  const row = s.businesses.find((b) => b.id === id && b.active !== false);
  if (!row) throw new ErpError("Business not found");
  const problem = businessProblem(input, listBusinesses(s).filter((b) => b.id !== id).map((b) => b.name));
  if (problem) throw new ErpError(problem);
  const d = cleanDetails(input);
  Object.assign(row, { name: d.name, currency: d.currency, country: d.country, phone: d.phone, email: d.email, businessType: d.businessType, businessTypes: [...(d.businessTypes ?? [d.businessType])], industryFamilyId: d.industryFamilyId });
  if (!d.email) delete row.email;
  c.audit("BUSINESS UPDATED", `${row.name} • ${row.businessType}`);
  return row;
});

export const addNamed = (kind: "categories" | "brands", name: string) => commit((s, c) => {
  const n = name.trim(); if (!n) throw new ErpError("Enter a name");
  if (s[kind].some((x) => x.name.toLowerCase() === n.toLowerCase())) throw new ErpError("Already exists");
  const item = { id: uid(), name: n }; s[kind].push(item); c.audit(kind === "brands" ? "BRAND CREATED" : "CATEGORY CREATED", n); return item;
});
export const renameNamed = (kind: "categories" | "brands", id: string, name: string) => commit((s, c) => {
  const x = s[kind].find((v) => v.id === id); if (!x) throw new ErpError("Not found");
  const n = name.trim(); if (!n) throw new ErpError("Enter a name");
  if (s[kind].some((v) => v.id !== id && v.name.toLowerCase() === n.toLowerCase())) throw new ErpError("Already exists");
  c.audit(kind === "brands" ? "BRAND RENAMED" : "CATEGORY RENAMED", `${x.name} → ${n}`); x.name = n;
});
export const removeNamed = (kind: "categories" | "brands", id: string) => commit((s, c) => {
  const x = s[kind].find((v) => v.id === id); if (!x) return;
  const key = kind === "brands" ? "brandId" : "categoryId", used = s.products.filter((p) => p[key] === id).length;
  if (used) throw new ErpError(`${x.name} is used by ${used} product${used === 1 ? "" : "s"}. Deactivate it instead`);
  s[kind] = s[kind].filter((v) => v.id !== id);
  c.audit(kind === "brands" ? "BRAND DELETED" : "CATEGORY DELETED", x.name);
});

// ---------- Selling engine (shared by Sales → New Sale and POS → Sell) ----------
/** `price` is a one-sale override (manual/wholesale); the product's default price is never changed. Quantities may be fractional (3 decimals). */
/** `serials`: the serials / IMEIs chosen for a serial-tracked product, one per unit. */
export type CartLine = { productId: string; qty: number; price?: number | undefined; priceReason?: string | undefined; serials?: string[] | undefined;
  /** A full gas cylinder: refill (with the empty brought in) or new (with its deposit). */
  gas?: { mode: "refill"; emptyId: string } | { mode: "new" } | undefined };
export const roundQty = (q: number) => Math.round(q * 1000) / 1000;
/** A serial / IMEI as compared everywhere: trimmed, spaces removed, capitals. */
export const serialKey = (code: string) => code.replace(/\s+/g, "").toUpperCase();
/** The date a warranty of `months` starting at `at` ends. */
export function warrantyEnd(at: number, months: number) { const d = new Date(at); d.setMonth(d.getMonth() + months); return d.getTime(); }
/** A full gas cylinder sold as a refill must name an empty cylinder of the same size (any brand) that comes in; a new
 *  cylinder carries the full one's deposit. Returns what the sale line records, or nothing for any other product. */
function saleGas(s: ErpState, p: Product, l: CartLine, qty: number): GasSale | undefined {
  if (!l.gas) return undefined;
  if (p.gas?.kind !== "full") throw new ErpError(`${p.name} is not a full gas cylinder`);
  if (!Number.isInteger(qty)) throw new ErpError(`${p.name} is sold in whole cylinders only`);
  if (l.gas.mode === "new") return { mode: "new", deposit: Math.max(0, p.gas.deposit ?? 0) };
  const empty = s.products.find((x) => x.id === (l.gas as { emptyId: string }).emptyId);
  if (!empty || empty.gas?.kind !== "empty") throw new ErpError("Choose the empty cylinder the customer brought");
  if (empty.gas.size !== p.gas.size) throw new ErpError(`The empty cylinder must be ${p.gas.size} kg like ${p.name}`);
  return { mode: "refill", emptyId: empty.id };
}
/** A serial-tracked line must name exactly one unsold serial of the product per unit, each once. Returns the cleaned codes. */
function saleSerials(p: Product, l: CartLine, qty: number): string[] | undefined {
  if (!p.serialTracked) return undefined;
  const codes = (l.serials ?? []).map(serialKey).filter(Boolean);
  if (!Number.isInteger(qty) || codes.length !== qty) throw new ErpError(`Choose ${qty} serial / IMEI number${qty === 1 ? "" : "s"} for ${p.name}`);
  if (new Set(codes).size !== codes.length) throw new ErpError(`A serial is chosen twice for ${p.name}`);
  for (const code of codes) {
    const unit = p.serials?.find((u) => serialKey(u.code) === code);
    if (!unit) throw new ErpError(`${code} is not a serial of ${p.name}`);
    if (unit.sold) throw new ErpError(`${code} was already sold (${unit.sold.ref})`);
  }
  return codes;
}
/** Units sold only in whole numbers (packets, pieces, boxes…). Weight/volume/length units allow fractions. */
const WHOLE_UNITS = new Set(["pcs", "pc", "piece", "pieces", "packet", "packets", "pkt", "box", "boxes", "bottle", "bottles", "carton", "cartons", "dozen", "pack", "packs", "bag", "bags", "tin", "tins", "unit", "units", "item", "items", "roll", "rolls", "pair", "pairs", "sachet", "sachets", "bar", "bars", "can", "cans", "crate", "crates"]);
export const isWholeUnit = (unit?: string, units?: Unit[]) => {
  const t = (unit || "pcs").trim().toLowerCase();
  // A shop's own unit says what it is; a Sack is whole because it's a Quantity unit.
  const own = units?.find((u) => u.name.toLowerCase() === t || u.abbr.toLowerCase() === t);
  return own ? own.type === "quantity" : WHOLE_UNITS.has(t);
};
/** Units weighed on a scale (kilos, grams): with Selling by weight on, the till opens its weight keypad for these.
 *  A shop's own unit says by its type (Settings › Units); otherwise the common names count. */
const WEIGHT_UNITS = new Set(["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms", "g", "gm", "gms", "gram", "grams"]);
export const isWeightUnit = (unit?: string, units?: Unit[]) => {
  const t = (unit || "").trim().toLowerCase();
  if (!t) return false;
  const own = units?.find((u) => u.name.toLowerCase() === t || u.abbr.toLowerCase() === t);
  return own ? own.type === "weight" : WEIGHT_UNITS.has(t);
};
export const linePrice = (s: ErpState, l: CartLine) => l.price ?? s.products.find((p) => p.id === l.productId)?.sell ?? 0;
export const lineAmount = (s: ErpState, l: CartLine) => Math.round(linePrice(s, l) * l.qty * 100) / 100;
export const lineTotal = (s: ErpState, cart: CartLine[]) => Math.round(cart.reduce((a, l) => a + lineAmount(s, l), 0) * 100) / 100;
/** Option B: quantity for a money amount at the unit price. Exact only if amount/price fits 3 decimals. */
export function qtyForAmount(amount: number, price: number) { if (!(amount > 0) || !(price > 0)) return null; const raw = amount / price, qty = roundQty(raw); return { qty, exact: Math.abs(qty * price - amount) < 0.005 }; }
export const methodOf = (pay: PayRecord) => {
  const used = payParts(pay).map(([m]) => m).sort((a, b) => (a === "credit" ? 1 : 0) - (b === "credit" ? 1 : 0));
  return used.length ? used.map((m) => methodName(m)).join(" + ") : "—";
};

// ---------- Payment status (P.PAY = part paid, rest still owed) ----------
export type PayStatus = "Paid" | "P.PAY" | "Credit" | "Cancelled";
const r2x = (n: number) => Math.round(n * 100) / 100;
export function saleBalance(s: ErpState, x: Sale) {
  const credRet = s.returns.filter((r) => r.saleId === x.id && r.refund === "credit").reduce((a, r) => a + r.amount, 0);
  return Math.max(0, r2x(x.pay.credit - (x.settled ?? 0) - credRet));
}
export function payStatus(total: number, balance: number, fullyReturned: boolean): PayStatus {
  if (fullyReturned) return "Cancelled";
  if (balance <= 0.001) return "Paid";
  return balance >= total - 0.001 ? "Credit" : "P.PAY";
}
export const saleStatus = (s: ErpState, x: Sale) => payStatus(x.total, saleBalance(s, x), x.items.every((i) => i.returned >= i.qty));
/** Pays down a customer's open sales oldest-first so each sale shows its own balance. */
function allocateToSales(s: ErpState, customerId: string, amount: number, onlySaleId?: string) {
  let left = amount;
  const open = s.sales.filter((x) => x.customerId === customerId && (!onlySaleId || x.id === onlySaleId)).sort((a, b) => a.at - b.at);
  for (const x of open) { if (left <= 0.001) break; const b = saleBalance(s, x); if (b <= 0) continue; const take = Math.min(b, left); x.settled = r2x((x.settled ?? 0) + take); left -= take; }
}

export type SaleInput = { cart: CartLine[]; discount: number; pay: PayRecord; customerId?: string | undefined; channel: "POS" | "Sales"; sellerId?: string | undefined; vatRate?: number | undefined;
  /** The till it was sold at (counter 1 when left out). Sent with an employee's sale, so it is kept when the server records it. */
  counter?: number | undefined };
/** What an employee's device sends. The operation id becomes the record's id, so sending it twice can't record it twice. */
export type StaffIntent = { type: "sale"; at: number; input: SaleInput } | { type: "customer"; at: number; name: string; phone?: string | undefined };
/** The receipt number comes from the operation, so a receipt printed offline matches the record the server makes later. */
export const staffSaleRef = (operation: string) => `S-${operation.replace(/-/g, "").slice(0, 8).toUpperCase()}`;

const recordSale = (input: SaleInput, fixed?: { id: string; ref: string; at: number }) => commit((s, c) => {
  const again = fixed && s.sales.find((x) => x.id === fixed.id);
  if (again) return again;
  const now = fixed?.at ?? Date.now();
  if (!input.cart.length) throw new ErpError("Cart is empty");
  const items: SaleItem[] = input.cart.map((l) => {
    const p = s.products.find((x) => x.id === l.productId);
    if (!p) throw new ErpError("Product not found");
    const qty = roundQty(l.qty);
    if (!(qty > 0) || !Number.isFinite(qty)) throw new ErpError(`Invalid quantity for ${p.name}`);
    const available = shopStock(s, p, c.shop), listed = shopPrice(p, c.shop);
    if (qty > available + 1e-9) throw new ErpError(`Insufficient stock: ${p.name} (available ${available})`);
    if (isWholeUnit(p.unit, s.units) && !Number.isInteger(qty)) throw new ErpError(`${p.name} is sold in whole ${p.unit || "pcs"} only`);
    if (l.price !== undefined && !(l.price >= 0 && Number.isFinite(l.price))) throw new ErpError(`Invalid price for ${p.name}`);
    if ((l.price ?? listed) < p.buy) c.audit("SOLD BELOW BUYING PRICE", `${p.name}: ${l.price ?? listed} (buying price ${p.buy})`);
    if (l.price !== undefined && l.price !== listed) c.audit("PRICE OVERRIDE", `${p.name}: ${listed} → ${l.price}${l.priceReason ? ` • ${l.priceReason}` : ""}`);
    const serials = saleSerials(p, l, qty);
    const gas = saleGas(s, p, l, qty);
    if (gas?.mode === "new" && (l.price ?? listed) < gas.deposit) throw new ErpError(`${p.name}: the price can't be below the cylinder deposit`);
    return { productId: p.id, name: p.name, qty, price: l.price ?? listed, cost: p.buy, returned: 0, ...(p.unit ? { unit: p.unit } : {}), ...(l.priceReason?.startsWith("Wholesale price") ? { wholesale: true as const } : {}),
      ...(serials ? { serials, ...(p.warrantyMonths ? { warrantyUntil: warrantyEnd(now, p.warrantyMonths) } : {}) } : {}), ...(gas ? { gas } : {}) };
  });
  if (new Set(items.map((i) => i.productId)).size !== items.length) throw new ErpError("A product appears twice in the cart");
  const subtotal = Math.round(items.reduce((a, i) => a + i.qty * i.price, 0) * 100) / 100;
  const discount = Math.round(input.discount * 100) / 100;
  if (discount < 0 || discount > subtotal) throw new ErpError("Discount can't exceed the subtotal");
  const rate = Math.min(100, Math.max(0, input.vatRate ?? 0));
  const vat = Math.round((subtotal - discount) * rate) / 100;
  const total = Math.round((subtotal - discount + vat) * 100) / 100;
  if (METHODS.some((m) => !(input.pay[m] >= 0))) throw new ErpError("Payment amounts can't be negative");
  if (!intentRun?.copy) checkPayRecord(s, input.pay);
  const allocated = payParts(input.pay).reduce((a, [, v]) => a + v, 0);
  if (allocated > total + 0.001) throw new ErpError("Payments exceed the total");
  if (allocated < total - 0.001) throw new ErpError("Allocate the full total (use Credit for the unpaid part)");
  const cust = input.customerId ? s.customers.find((x) => x.id === input.customerId) : undefined;
  if (input.pay.credit > 0 && !cust) throw new ErpError("Credit needs a registered customer");
  if (cust) c.here(cust);
  const ref = fixed?.ref ?? c.nextRef("S");
  items.forEach((i) => c.move(i.productId, "SALE", -i.qty, "Sale", ref));
  // A refill takes the customer's empty cylinder in: it joins the empties, worth nothing in stock value.
  items.forEach((i) => { if (i.gas?.mode === "refill") c.move(i.gas.emptyId, "STOCK IN", i.qty, "Empty cylinder received", ref); });
  const counter = cleanCounter(input.counter);
  payParts(input.pay).forEach(([m, v]) => { if (m !== "credit") s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: now, method: m, amount: v, kind: "SALE", source: ref, customerId: cust?.id, user: c.user, ...(counter ? { counter } : {}) }); });
  if (cust && input.pay.credit > 0) cust.balance += input.pay.credit;
  const sale: Sale = { id: fixed?.id ?? uid(), ref, at: now, items, subtotal, discount, total, vat: vat || undefined, pay: { ...input.pay }, customerId: cust?.id, cashier: c.user, ...(!intentRun && tillCashier() ? { cashierId: tillCashier()!.id } : {}), channel: input.channel, sellerId: undefined, ...(counter ? { counter } : {}) };
  // An employee's copy has no pay rules. The server works out commission when it records the sale.
  const seller = input.sellerId && !intentRun?.copy ? s.employees.find((e) => e.id === input.sellerId && e.active) : undefined;
  if (input.sellerId && !seller && !intentRun?.copy) throw new ErpError("Seller not found");
  if (intentRun?.copy && input.sellerId) sale.sellerId = input.sellerId;
  if (seller) { sale.sellerId = seller.id; const amt = commissionFor(seller, sale); if (amt > 0) s.commissions.unshift({ id: uid(), at: Date.now(), employeeId: seller.id, source: ref, amount: amt, kind: "EARNED", pending: seller.rule.paidOnly && input.pay.credit > 0, productAmounts: commissionProducts(seller, sale) }); }
  // Serial-tracked units leave stock: each named serial is marked sold to this sale.
  for (const it of items) for (const code of it.serials ?? []) {
    const unit = s.products.find((p) => p.id === it.productId)?.serials?.find((u) => serialKey(u.code) === code);
    if (unit) unit.sold = { saleId: sale.id, ref, at: now };
  }
  s.sales.unshift(sale);
  c.audit("SALE", `${ref} • ${total}${cust ? ` • ${cust.name}` : ""}`);
  return sale;
});

const recordCustomer = (name: string, phone?: string, id?: string) => commit((s, c) => {
  const again = id && s.customers.find((x) => x.id === id);
  if (again) return again;
  const n = name.trim(); if (!n) throw new ErpError("Enter a customer name");
  if (n.length > 100) throw new ErpError("Name is too long");
  const cu: Customer = { id: id ?? uid(), name: n, phone: phone?.trim() || undefined, balance: 0, createdAt: Date.now() };
  s.customers.unshift(cu); c.audit("CUSTOMER CREATED", n); return cu;
});

export const receiveDebt = (customerId: string, amount: number, method: Method) => commit((s, c) => {
  const cu = s.customers.find((x) => x.id === customerId); if (!cu) throw new ErpError("Customer not found");
  c.here(cu);
  checkMethod(s, method, false);
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (amount > cu.balance + 0.001) throw new ErpError("Amount is more than the outstanding balance");
  cu.balance -= amount;
  allocateToSales(s, customerId, amount);
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount, kind: "DEBT", source: cu.name, customerId, user: c.user });
  c.audit("DEBT PAYMENT", `${cu.name} • ${amount}`);
});

/** Adds a payment against one P.PAY/Credit sale. */
export const paySale = (saleId: string, amount: number, method: Method) => commit((s, c) => {
  const x = s.sales.find((v) => v.id === saleId); if (!x) throw new ErpError("Sale not found");
  c.here(x);
  const cu = x.customerId ? s.customers.find((v) => v.id === x.customerId) : undefined; if (!cu) throw new ErpError("Customer not found");
  checkMethod(s, method, false);
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (amount > saleBalance(s, x) + 0.001) throw new ErpError("Amount is more than the outstanding balance");
  cu.balance -= amount;
  allocateToSales(s, cu.id, amount, x.id);
  s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method, amount, kind: "DEBT", source: x.ref, customerId: cu.id, user: c.user });
  c.audit("SALE PAYMENT", `${x.ref} • ${amount}`);
});

/** Partial returns supported; the original sale stays intact apart from the returned counter. */
export const returnSale = (saleId: string, lines: { productId: string; qty: number }[], refund: Method) => commit((s, c) => {
  const sale = s.sales.find((x) => x.id === saleId); if (!sale) throw new ErpError("Sale not found");
  c.here(sale);
  const picked = lines.filter((l) => l.qty > 0); if (!picked.length) throw new ErpError("Choose items to return");
  checkMethod(s, refund);
  const ratio = sale.subtotal ? sale.total / sale.subtotal : 1;
  const ref = c.nextRef("RET");
  const items = picked.map((l) => {
    const it = sale.items.find((i) => i.productId === l.productId); if (!it) throw new ErpError("Item not in sale");
    const product = s.products.find((p) => p.id === it.productId);
    if (product) checkWhole(s, product, l.qty);
    if (roundQty(l.qty) > roundQty(it.qty - it.returned)) throw new ErpError(`Only ${roundQty(it.qty - it.returned)} of ${it.name} can be returned`);
    it.returned = roundQty(it.returned + l.qty);
    if (s.products.some((p) => p.id === it.productId)) c.move(it.productId, "RETURN", l.qty, `Return of ${sale.ref}`, ref);
    // A returned refill gives the customer's empty cylinder back.
    if (it.gas?.mode === "refill" && s.products.some((p) => p.id === (it.gas as { emptyId: string }).emptyId)) c.move(it.gas.emptyId, "STOCK OUT", -l.qty, `Empty given back • ${sale.ref}`, ref);
    // Serial-tracked units come back into stock: the line's serials still sold to this sale, last first.
    const back = (it.serials ?? []).filter((code) => product?.serials?.find((u) => serialKey(u.code) === code)?.sold?.saleId === sale.id).slice(-Math.round(l.qty));
    for (const code of back) { const unit = product?.serials?.find((u) => serialKey(u.code) === code); if (unit) unit.sold = undefined; }
    return { productId: it.productId, name: it.name, qty: l.qty, amount: Math.round(l.qty * it.price * ratio * 100) / 100, ...(back.length ? { serials: back } : {}) };
  });
  const amount = items.reduce((a, i) => a + i.amount, 0);
  const cust = sale.customerId ? s.customers.find((x) => x.id === sale.customerId) : undefined;
  if (refund === "credit") {
    if (!cust) throw new ErpError("Customer credit needs a registered customer");
    cust.balance = Math.round((cust.balance - amount) * 100) / 100; // reduces debt or creates credit in the customer's favour
  } else {
    s.payments.unshift({ id: uid(), ref: c.nextRef("PAY"), at: Date.now(), method: refund, amount: -amount, kind: "REFUND", source: ref, customerId: cust?.id, user: c.user });
  }
  s.returns.unshift({ id: uid(), ref, at: Date.now(), saleId, saleRef: sale.ref, items, amount, refund, user: c.user });
  const earned = s.commissions.filter((x) => x.source === sale.ref).reduce((a, x) => a + x.amount, 0);
  if (sale.sellerId && earned > 0 && sale.total > 0) {
    const original = s.commissions.find((x) => x.source === sale.ref && x.kind === "EARNED");
    const productAmounts = original?.productAmounts ? Object.fromEntries(items.map((i) => [i.productId, -Math.round((original.productAmounts?.[i.productId] ?? 0) * i.qty / (sale.items.find((x) => x.productId === i.productId)?.qty ?? 1) * 100) / 100])) : undefined;
    const adj = productAmounts ? -Math.min(earned, -Object.values(productAmounts).reduce((a, x) => a + x, 0)) : -Math.min(earned, Math.round(earned * (amount / sale.total) * 100) / 100);
    if (adj < 0) s.commissions.unshift({ id: uid(), at: Date.now(), employeeId: sale.sellerId, source: sale.ref, amount: adj, kind: "RETURN ADJUSTMENT", pending: false, ...(productAmounts ? { productAmounts } : {}) });
  }
  c.audit("SALES RETURN", `${ref} for ${sale.ref} • ${amount}`);
});

// ---------- Recording from an employee's device ----------
/** Works out one employee action on a copy of `state`, inside this one synchronous call, and returns the result. Nothing is saved here. */
export function runIntent(state: ErpState, operation: string, intent: StaffIntent, at: { shop: string; user: string; copy: boolean }) {
  if (transaction || intentRun) throw new ErpError("Another save is in progress");
  transaction = { state: structuredClone(state) };
  intentRun = at;
  try {
    const result = intent.type === "sale" ? recordSale(intent.input, { id: operation, ref: staffSaleRef(operation), at: intent.at }) : recordCustomer(intent.name, intent.phone, operation);
    return { result, after: transaction.state };
  } finally { transaction = undefined; intentRun = undefined; }
}
/** The whole of an employee's save: their copy shows it now, and the same storage write queues it, so one can't happen without the other. Offline is the same. */
function queueIntent(intent: StaffIntent) {
  const a = JSON.parse(localStorage.getItem("shopbook.account") || "null") as { staff?: { fullName?: string; permissions?: string[] } } | null;
  if (!a?.staff?.permissions?.includes("sales.process")) throw new ErpError("Your login can't record sales. Ask your manager");
  assertCanRecord();
  let device = localStorage.getItem("shopbook.deviceId");
  if (!device) { device = randomUUID(); localStorage.setItem("shopbook.deviceId", device); }
  const id = randomUUID(), base = load();
  const { result, after } = runIntent(base, id, intent, { shop: activeShop(base), user: a.staff.fullName || "Staff", copy: true });
  const op: Operation = { id, business: businessId(), owner: null, device, kind: intent.type === "sale" ? "STAFF SALE" : "STAFF CUSTOMER", createdAt: intent.at, changes: [], seq: {}, phase: "pending", attempts: 0, nextRetry: 0, history: [{ at: Date.now(), event: "Saved on this device" }], intent };
  persistErp(after, [...getOutbox(), op]);
  window.dispatchEvent(new Event(EVT));
  window.dispatchEvent(new Event("shopbook-staff-queue"));
  return result;
}
/** The device's counter goes with the sale, so an employee's sale keeps its till when the server records it. */
const withCounter = (input: SaleInput): SaleInput => { const n = input.counter ?? activeCounter(load()); return n > 1 ? { ...input, counter: n } : input; };
export const confirmSale = (input: SaleInput) => (isEmployeeDevice() ? (queueIntent({ type: "sale", at: Date.now(), input: withCounter(input) }) as Sale) : recordSale(withCounter(input)));
export const addCustomer = (name: string, phone?: string) => (isEmployeeDevice() ? (queueIntent({ type: "customer", at: Date.now(), name, ...(phone ? { phone } : {}) }) as Customer) : recordCustomer(name, phone));

// ---------- POS cash drawer ----------
/** One drawer: the active shop's, at this device's counter (or the counter asked for). A one-counter shop has one drawer, as before. */
export function cashSession(s: ErpState, counter = activeCounter(s)) {
  const shop = activeShop(s), cash = s.cash.filter((e) => atShop(e, shop) && counterOf(e) === counter);
  const lastUp = cash.find((e) => e.type === "CASH UP")?.at ?? 0;
  const ev = cash.filter((e) => e.at > lastUp);
  const opening = ev.filter((e) => e.type === "OPENING").reduce((a, e) => a + e.amount, 0);
  const cin = ev.filter((e) => e.type === "CASH IN").reduce((a, e) => a + e.amount, 0);
  const cout = ev.filter((e) => e.type === "CASH OUT").reduce((a, e) => a + e.amount, 0);
  const cashPay = s.payments.filter((p) => p.at > lastUp && p.method === "cash" && atShop(p, shop) && counterOf(p) === counter);
  const sales = cashPay.filter((p) => p.kind !== "REFUND" && p.amount > 0).reduce((a, p) => a + p.amount, 0);
  const refunds = -cashPay.filter((p) => p.kind === "REFUND").reduce((a, p) => a + p.amount, 0);
  const paidOut = -cashPay.filter((p) => p.kind !== "REFUND" && p.amount < 0).reduce((a, p) => a + p.amount, 0);
  return { opening, cin, cout: cout + paidOut, sales, refunds, expected: opening + sales - refunds + cin - cout - paidOut, since: lastUp };
}
export const cashEvent = (type: "OPENING" | "CASH IN" | "CASH OUT", amount: number, note?: string) => commit((s, c) => {
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (type === "CASH OUT" && amount > cashSession(s).expected) throw new ErpError("Not enough cash in the drawer");
  s.cash.unshift({ id: uid(), at: Date.now(), type, amount, note: note?.trim() || undefined, user: c.user });
  c.audit(type, String(amount));
});
export const cashUp = (counted: number, note?: string) => commit((s, c) => {
  if (!(counted >= 0) || !Number.isFinite(counted)) throw new ErpError("Enter the counted cash");
  const expected = cashSession(s).expected;
  s.cash.unshift({ id: uid(), at: Date.now(), type: "CASH UP", amount: counted - expected, expected, counted, note: note?.trim() || undefined, user: c.user });
  c.audit("CASH UP", `Expected ${expected} • Counted ${counted}${note?.trim() ? ` • ${note.trim()}` : ""}`);
});

/** Commission earned on a sale per the employee's rule (immediate by default). */
export function commissionProducts(e: Employee, sale: Pick<Sale, "items" | "total" | "subtotal">) {
  const total = commissionFor(e, sale), weights = sale.items.reduce((a, i) => a + i.qty * i.price, 0);
  const ratio = sale.subtotal ? sale.total / sale.subtotal : 1;
  let left = total;
  return Object.fromEntries(sale.items.map((i, index) => {
    const rule = e.rule.products?.find((x) => x.productId === i.productId) ?? e.rule;
    const revenue = i.qty * i.price * ratio;
    const raw = e.rule.products?.length ? rule.kind === "fixed" ? rule.value * i.qty : rule.kind === "profit" ? Math.max(0, revenue - i.qty * i.cost) * rule.value / 100 : revenue * rule.value / 100 : weights ? total * i.qty * i.price / weights : 0;
    const v = index === sale.items.length - 1 ? left : Math.round(raw * 100) / 100; left = Math.round((left - v) * 100) / 100;
    return [i.productId, v];
  }));
}
export function commissionFor(e: Employee, sale: Pick<Sale, "items" | "total" | "subtotal">) {
  if (e.comp === "salary" || e.rule.kind === "none" || !(e.rule.value > 0)) return 0;
  const ratio = sale.subtotal ? sale.total / sale.subtotal : 1;
  if (e.rule.products?.length) {
    const v = sale.items.reduce((sum, i) => {
      const override = e.rule.products?.find((r) => r.productId === i.productId);
      const rule = override ?? e.rule;
      const revenue = i.qty * i.price * ratio;
      return sum + (rule.kind === "fixed" ? rule.value * i.qty : rule.kind === "profit" ? Math.max(0, revenue - i.qty * i.cost) * rule.value / 100 : revenue * rule.value / 100);
    }, 0);
    return Math.round(v * 100) / 100;
  }
  const profit = sale.items.reduce((a, i) => a + i.qty * (i.price * ratio - i.cost), 0);
  const v = e.rule.kind === "percent" ? sale.total * e.rule.value / 100 : e.rule.kind === "profit" ? Math.max(0, profit) * e.rule.value / 100 : e.rule.value;
  return Math.round(v * 100) / 100;
}
export function returnStatus(sale: Sale): "NOT RETURNED" | "PARTIALLY RETURNED" | "FULLY RETURNED" {
  const r = sale.items.reduce((a, i) => a + i.returned, 0), q = sale.items.reduce((a, i) => a + i.qty, 0);
  return r === 0 ? "NOT RETURNED" : r >= q ? "FULLY RETURNED" : "PARTIALLY RETURNED";
}

// ---------- Payroll ----------
export type NewEmployee = Omit<Employee, "id" | "createdAt" | "active">;
function checkEmployee(e: NewEmployee) {
  if (!e.name.trim()) throw new ErpError("Enter an employee name");
  if (!(e.salary >= 0) || (e.comp !== "commission" && !(e.salary > 0))) throw new ErpError("Enter a valid salary");
  if (e.comp !== "salary" && (e.rule.kind === "none" || !(e.rule.value > 0))) throw new ErpError("Set a commission rule");
  if (e.rule.kind !== "fixed" && e.rule.value > 100) throw new ErpError("Percentage can't exceed 100");
}
export const addEmployee = (e: NewEmployee) => commit((s, c) => {
  checkEmployee(e);
  const emp: Employee = { ...e, name: e.name.trim(), salary: e.comp === "commission" ? 0 : e.salary, rule: e.comp === "salary" ? { kind: "none", value: 0, paidOnly: false } : e.rule, id: uid(), active: true, createdAt: Date.now() };
  s.employees.unshift(emp); c.audit("EMPLOYEE ADDED", emp.name); return emp;
});
export const setEmployeeActive = (id: string, active: boolean) => commit((s, c) => {
  const e = s.employees.find((x) => x.id === id); if (!e) throw new ErpError("Employee not found");
  e.active = active; c.audit(active ? "EMPLOYEE ACTIVATED" : "EMPLOYEE DEACTIVATED", e.name);
});
/** Paid-only commission becomes eligible once the customer has no outstanding credit from that sale's customer. */
export function eligibleCommission(s: ErpState, employeeId: string) {
  return s.commissions.filter((x) => x.employeeId === employeeId && !x.payrollId && (!x.pending || isPaid(s, x.source)));
}
function isPaid(s: ErpState, saleRef: string) {
  const sale = s.sales.find((x) => x.ref === saleRef); if (!sale?.customerId) return true;
  return saleBalance(s, sale) <= 0.001;
}
export function payrollPreview(s: ErpState, employeeId: string, deductions: number) {
  const e = s.employees.find((x) => x.id === employeeId); if (!e) throw new ErpError("Employee not found");
  const commission = Math.round(eligibleCommission(s, employeeId).reduce((a, x) => a + x.amount, 0) * 100) / 100;
  const gross = e.salary + commission;
  return { salary: e.salary, commission, deductions, net: Math.round((gross - deductions) * 100) / 100 };
}
export const confirmPayroll = (employeeId: string, from: number, to: number, deductions: number) => commit((s, c) => {
  if (!(to >= from)) throw new ErpError("Choose a valid period");
  if (!(deductions >= 0)) throw new ErpError("Deductions can't be negative");
  if (s.payrolls.some((p) => p.employeeId === employeeId && p.from <= to && p.to >= from)) throw new ErpError("Payroll already confirmed for this period");
  const pv = payrollPreview(s, employeeId, deductions);
  if (pv.net < 0) throw new ErpError("Deductions exceed gross pay");
  const run: PayrollRun = { id: uid(), ref: c.nextRef("PR"), at: Date.now(), employeeId, from, to, ...pv, paid: 0, user: c.user };
  eligibleCommission(s, employeeId).forEach((x) => { const row = s.commissions.find((y) => y.id === x.id); if (row) row.payrollId = run.id; });
  s.payrolls.unshift(run); c.audit("PAYROLL CONFIRMED", `${run.ref} • ${run.net}`); return run;
});
export const payPayroll = (payrollId: string, method: Method, amount: number) => commit((s, c) => {
  const r = s.payrolls.find((x) => x.id === payrollId); if (!r) throw new ErpError("Payroll not found");
  checkMethod(s, method, false);
  if (!(amount > 0)) throw new ErpError("Enter an amount");
  if (amount > r.net - r.paid + 0.001) throw new ErpError("Amount is more than the outstanding pay");
  if (method === "cash" && amount > cashSession(s).expected) throw new ErpError("Not enough cash in the drawer");
  r.paid = Math.round((r.paid + amount) * 100) / 100;
  const ref = c.nextRef("PP");
  s.payrollPayments.unshift({ id: uid(), ref, at: Date.now(), payrollId, employeeId: r.employeeId, method, amount, user: c.user });
  if (method === "cash") s.cash.unshift({ id: uid(), at: Date.now(), type: "CASH OUT", amount, note: `Payroll ${r.ref}`, user: c.user });
  c.audit("PAYROLL PAYMENT", `${ref} • ${r.ref} • ${amount}`);
});
