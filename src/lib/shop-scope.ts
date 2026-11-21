// One shop's view of the business: its own records, stock and prices. Read-only, and used on the server for an employee's
// copy (staff-access.ts) and on an owner's device when one shop is selected. It never changes what is saved.
import { atBusiness, atShop, businessMoneyAccounts, carriedAt, MAIN_BUSINESS, MAIN_LOCATION, markBusinessView, roundQty, shopPrice, viewedBusiness, type AtBusiness, type AtShop, type ErpState, type Movement } from "@/lib/erp";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Each movement's before and after, as this location saw them. The saved figures are product totals, which would show other shops' stock. */
function localBalances(rows: Movement[], current: (m: Movement) => number) {
  const left = new Map<string, number>();
  return rows.map((m) => { // Newest first, so walk back from what the location holds now.
    const key = `${m.productId}|${m.locationId ?? ""}`, next = left.get(key) ?? current(m), prev = roundQty(next - m.qty);
    left.set(key, prev);
    return { ...m, prev, next };
  });
}

/** One business's view of the owner's records. Read-only; it never changes what is saved. Records from before multi-business
 *  was separated are untagged and belong to the first business, so they stay visible there. */
export function scopeToBusiness(full: ErpState, business: string): ErpState {
  const here = <T extends AtBusiness>(rows: T[]) => rows.filter((r) => atBusiness(r, business));
  const people = new Set(here(full.employees).map((e) => e.id));
  const s: ErpState = {
    ...full,
    products: here(full.products), categories: here(full.categories), brands: here(full.brands), units: full.units, attributes: full.attributes,
    locations: here(full.locations), movements: here(full.movements), transfers: here(full.transfers), audit: here(full.audit),
    customers: here(full.customers), sales: here(full.sales), payments: here(full.payments), returns: here(full.returns), cash: here(full.cash),
    employees: here(full.employees), commissions: here(full.commissions), payrolls: here(full.payrolls), payrollPayments: here(full.payrollPayments),
    suppliers: here(full.suppliers), purchases: here(full.purchases), purchaseReturns: here(full.purchaseReturns), purchaseOrders: here(full.purchaseOrders),
    supplierInvoices: here(full.supplierInvoices), expenses: here(full.expenses), expenseCategories: here(full.expenseCategories),
    otherContacts: here(full.otherContacts), contactCategories: here(full.contactCategories),
    // This business's own payment method settings: the first business's rows, or another business's settings and added methods.
    moneyAccounts: businessMoneyAccounts(full, business),
    // A draft belongs to its employee's business (drafts saved before they carried a business are found the same way).
    payrollDrafts: full.payrollDrafts.filter((d) => people.has(d.employeeId) && (!d.businessId || d.businessId === business)),
    businesses: full.businesses.filter((item) => item.id === business),
  };
  // Units and attributes are shared across businesses, so keep them all.
  s.units = full.units;
  s.attributes = full.attributes;
  return markBusinessView(s, business);
}

/** `alsoAt`: stores and warehouses whose stock movements come through too (a shop's connected warehouses). */
export function scopeToShop(full: ErpState, shop: string, alsoAt: readonly string[] = []): ErpState {
  const here = <T extends AtShop>(rows: T[]) => rows.filter((r) => atShop(r, shop));

  const atHere = new Map<string, number>(), tagged = new Map<string, number>();
  for (const m of full.movements) {
    if (m.locationId) { tagged.set(m.productId, (tagged.get(m.productId) ?? 0) + m.qty); }
    if (m.locationId === shop) atHere.set(m.productId, (atHere.get(m.productId) ?? 0) + m.qty);
  }
  const qtyOf = (p: { id: string; qty: number }) => roundQty(shop === MAIN_LOCATION ? p.qty - (tagged.get(p.id) ?? 0) : atHere.get(p.id) ?? 0);
  const totals = new Map(full.products.map((p) => [p.id, qtyOf(p)]));
  const held = (m: Movement) => {
    if (!m.locationId) return totals.get(m.productId) ?? 0;
    if (m.locationId === shop) return roundQty(atHere.get(m.productId) ?? 0);
    return roundQty(full.movements.reduce((sum, x) => (x.productId === m.productId && x.locationId === m.locationId ? sum + x.qty : sum), 0));
  };

  const purchases = here(full.purchases);
  // What each supplier is owed for this shop. The main shop also carries anything from before these records, such as an opening balance.
  const owedOn = (rows: typeof purchases, supplierId: string) => rows.filter((p) => p.supplierId === supplierId).reduce((sum, p) => {
    const returned = full.purchaseReturns.filter((r) => r.purchaseId === p.id && r.refund === "credit").reduce((a, r) => a + r.amount, 0);
    return sum + Math.max(0, p.pay.credit - (p.settled ?? 0) - returned);
  }, 0);
  const others = full.purchases.filter((p) => p.locationId);

  const employees = full.employees.filter((e) => (e.locationIds?.length ? e.locationIds.includes(shop) : shop === MAIN_LOCATION));
  const people = new Set(employees.map((e) => e.id));
  const also = new Set(alsoAt);
  // A shop's own products, plus whatever a connected warehouse is holding so its stock can be named.
  const carried = carriedAt(full, shop);
  for (const m of full.movements) if (m.locationId && also.has(m.locationId)) carried.add(m.productId);

  const view: ErpState = {
    ...full,
    products: full.products.filter((p) => carried.has(p.id)).map(({ prices: _prices, ...p }) => ({ ...p, qty: totals.get(p.id) ?? 0, sell: shopPrice({ sell: p.sell, prices: _prices }, shop) })),
    movements: localBalances(full.movements.filter((m) => atShop(m, shop) || (m.locationId && also.has(m.locationId))), held),
    transfers: full.transfers.filter((t) => (t.fromId ?? MAIN_LOCATION) === shop || (t.toId ?? MAIN_LOCATION) === shop),
    audit: here(full.audit),
    customers: here(full.customers),
    sales: here(full.sales),
    returns: here(full.returns),
    payments: here(full.payments),
    cash: here(full.cash),
    purchases,
    purchaseReturns: here(full.purchaseReturns),
    purchaseOrders: here(full.purchaseOrders),
    supplierInvoices: here(full.supplierInvoices),
    expenses: here(full.expenses),
    suppliers: full.suppliers.map((x) => ({ ...x, balance: r2(Math.max(0, shop === MAIN_LOCATION ? x.balance - owedOn(others, x.id) : owedOn(purchases, x.id))) })),
    employees,
    commissions: full.commissions.filter((x) => people.has(x.employeeId)),
    payrolls: full.payrolls.filter((x) => people.has(x.employeeId)),
    payrollDrafts: full.payrollDrafts.filter((x) => people.has(x.employeeId)),
    payrollPayments: here(full.payrollPayments),
  };
  // One shop of another business is still that business: keep the mark so its locations stay its own.
  const business = viewedBusiness(full);
  return business ? markBusinessView(view, business) : view;
}
