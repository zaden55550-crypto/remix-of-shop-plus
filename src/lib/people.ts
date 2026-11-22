import { atBusiness, commit, isAdmin, MAIN_BUSINESS, uid, ErpError, type ContactDetails, type Employee, type NewEmployee, type PayrollDraft, type Method, type MoneyMethod, type PayRecord, checkPayRecord, methodName, paidAmount, payParts } from "@/lib/erp";
import { balanceOf, floatBalances } from "@/lib/finance";

export type ContactInput = ContactDetails & { name: string; phone?: string | undefined; category?: string | undefined; info?: string | undefined; contact?: string | undefined; wholesale?: boolean | undefined };
export function saveContact(kind: "customers" | "suppliers" | "otherContacts", input: ContactInput, id?: string) {
  return commit((s, c) => {
    if (!input.name.trim()) throw new ErpError("Enter a name");
    if (input.email && !/^\S+@\S+\.\S+$/.test(input.email)) throw new ErpError("Enter a valid email");
    const rows = s[kind];
    if (rows.some((x) => x.id !== id && ((input.phone && x.phone === input.phone.trim()) || x.name.toLowerCase() === input.name.trim().toLowerCase()))) throw new ErpError("Contact already exists");
    const data = { ...input, name: input.name.trim(), phone: input.phone?.trim(), active: input.active ?? true };
    if (id) {
      const x = rows.find((x) => x.id === id); if (!x) throw new ErpError("Contact not found");
      const before = JSON.stringify(x); Object.assign(x, data);
      c.audit("CONTACT EDITED", `${kind} • ${before} → ${JSON.stringify(x)}`); return x;
    }
    const x = { ...data, id: uid(), balance: 0, createdAt: Date.now() };
    rows.push(x); c.audit("CONTACT CREATED", `${kind} • ${x.name}`); return x;
  });
}
export const addContactCategory = (name: string) => commit((s, c) => {
  if (!name.trim()) throw new ErpError("Enter a name");
  if (s.contactCategories.some((x) => x.name.toLowerCase() === name.trim().toLowerCase())) throw new ErpError("Category already exists");
  const cat = { id: uid(), name: name.trim() }; s.contactCategories.push(cat); c.audit("CONTACT CATEGORY", cat.name); return cat;
});
export function editEmployee(id: string, input: NewEmployee) {
  return commit((s, c) => {
    const x = s.employees.find((e) => e.id === id); if (!x) throw new ErpError("Employee not found");
    if (!input.name.trim() || !Number.isFinite(input.salary) || input.salary < 0 || (input.comp !== "commission" && input.salary <= 0)) throw new ErpError("Enter a valid name and salary");
    if (!Number.isFinite(input.rule.value) || input.rule.value < 0 || (input.rule.kind !== "fixed" && input.rule.value > 100)) throw new ErpError("Enter a valid commission rule");
    const before = JSON.stringify(x); Object.assign(x, input, { name: input.name.trim() }); c.audit("EMPLOYEE EDITED", `${before} → ${JSON.stringify(x)}`); return x;
  });
}
export const savePayrollDraft = (input: Omit<PayrollDraft, "id" | "at">, id?: string) => commit((s, c) => {
  // A draft is for an employee of the business being worked in, and always carries that business, so a later edit never moves it.
  const employee = s.employees.find((e) => e.id === input.employeeId && atBusiness(e, c.business));
  if (!employee || !(input.to >= input.from) || !(input.deductions >= 0)) throw new ErpError("Choose a valid employee and period");
  if (id && s.payrollDrafts.some((d) => d.id === id && d.businessId && d.businessId !== c.business)) throw new ErpError("This draft belongs to another business. Switch to that business first");
  const x = { ...input, id: id ?? uid(), at: Date.now(), ...(employee.businessId && employee.businessId !== MAIN_BUSINESS ? { businessId: employee.businessId } : {}) };
  const i = s.payrollDrafts.findIndex((d) => d.id === id); if (i >= 0) s.payrollDrafts[i] = x; else s.payrollDrafts.unshift(x);
  c.audit("PAYROLL DRAFT", x.id); return x;
});
/** Multiple actual methods are validated and written in one transaction, never halfway. */
export function settlePeople(kind: "customer" | "supplier" | "payroll", id: string, parts: PayRecord) {
  return commit((s, c) => {
    if (!Object.values(parts).every((v) => Number.isFinite(v) && v >= 0)) throw new ErpError("Enter a valid payment");
    checkPayRecord(s, parts);
    const paidBy = payParts(parts).filter(([m]) => m !== "credit") as [MoneyMethod, number][];
    const total = paidAmount(parts);
    if (!(total > 0)) throw new ErpError("Enter a valid payment");
    const person = kind === "customer" ? s.customers.find((x) => x.id === id) : kind === "supplier" ? s.suppliers.find((x) => x.id === id) : s.payrolls.find((x) => x.id === id);
    if (!person) throw new ErpError("Record not found");
    const due = "balance" in person ? person.balance : person.net - person.paid;
    if (total > due + 0.001) throw new ErpError("Amount is more than the outstanding balance");
    const b = floatBalances(s);
    const short = kind !== "customer" ? paidBy.find(([m, v]) => v > balanceOf(b, m) + 0.001) : undefined;
    if (short) throw new ErpError(`Not enough money in ${methodName(short[0], s)}`);
    if ("balance" in person) person.balance = Math.round((person.balance - total) * 100) / 100; else person.paid = Math.round((person.paid + total) * 100) / 100;
    if (kind !== "payroll") {
      let left = total;
      const docs = kind === "customer" ? s.sales.filter((x) => x.customerId === id) : s.purchases.filter((x) => x.supplierId === id);
      for (const doc of docs.sort((a, b) => a.at - b.at)) {
        const returns = kind === "customer" ? s.returns.filter((r) => r.saleId === doc.id && r.refund === "credit") : s.purchaseReturns.filter((r) => r.purchaseId === doc.id && r.refund === "credit");
        const balance = Math.max(0, doc.pay.credit - (doc.settled ?? 0) - returns.reduce((a, x) => a + x.amount, 0));
        const take = Math.min(left, balance); doc.settled = Math.round(((doc.settled ?? 0) + take) * 100) / 100; left -= take;
      }
    }
    for (const [method, amount] of paidBy) {
      const ref = c.nextRef(kind === "payroll" ? "PP" : "PAY");
      if (kind === "payroll" && "employeeId" in person) {
        s.payrollPayments.unshift({ id: uid(), ref, at: Date.now(), payrollId: id, employeeId: person.employeeId, method, amount, user: c.user });
        if (method === "cash") s.cash.unshift({ id: uid(), at: Date.now(), type: "CASH OUT", amount, note: `Payroll ${person.ref}`, user: c.user });
      } else if ("name" in person) s.payments.unshift({ id: uid(), ref, at: Date.now(), method, amount: kind === "customer" ? amount : -amount, kind: kind === "customer" ? "DEBT" : "SUPPLIER PAYMENT", source: person.name, customerId: kind === "customer" ? id : undefined, user: c.user });
    }
    c.audit("PAYMENT", `${kind} • ${id} • ${JSON.stringify(parts)}`); return true;
  });
}

// ---------- Settings › People & Access: the employee record. Payroll reads the same record, and no login is needed. ----------
export const EMPLOYMENT_TYPES = ["Full-time", "Part-time", "Contract", "Casual"] as const;
export type EmployeeProfile = { name: string; phone: string; email: string; code: string; businessRefs: string[]; locationIds: string[]; accessRole: string; startDate: string; employmentType: string;
  /** Counters this person may sell at, per shop (location id → numbers). Left out keeps what is saved. */
  counters?: Record<string, number[]> | undefined };
export const employeeStatus = (e: Employee) => (e.status === "terminated" || (!e.active && e.status !== "suspended") ? "Terminated" : e.status === "suspended" ? "Suspended" : "Active");
const needOwner = () => { if (!isAdmin()) throw new ErpError("Only the owner can manage employees"); };

/** Only shops the person is assigned to, whole counter numbers from 1, each once; an empty list means any counter. */
function cleanCounters(c: Record<string, number[]>, locations: string[]) {
  const out = Object.fromEntries(Object.entries(c).filter(([k, v]) => locations.includes(k) && Array.isArray(v)).map(([k, v]) => [k, [...new Set(v.filter((n) => Number.isInteger(n) && n >= 1 && n <= 50))].sort((a, b) => a - b)]).filter(([, v]) => (v as number[]).length));
  return Object.keys(out).length ? out : undefined;
}
export function saveEmployeeProfile(p: EmployeeProfile, id?: string) {
  needOwner();
  return commit((s, c) => {
    const name = p.name.trim(), phone = p.phone.trim(), email = p.email.trim().toLowerCase();
    if (!name) throw new ErpError("Enter the employee's full name");
    // A way to reach them: a phone or an email (the email is what a login invitation goes to). Whichever is given must be valid.
    if (!phone && !email) throw new ErpError("Enter the employee's phone number or email");
    if (phone && phone.replace(/\D/g, "").length < 7) throw new ErpError("Enter a valid phone number");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new ErpError("Enter a valid email");
    if (!p.businessRefs.length) throw new ErpError("Choose a business");
    const code = p.code.trim() || (id && s.employees.find((e) => e.id === id)?.code) || c.nextRef("EMP");
    if (s.employees.some((e) => e.id !== id && e.code?.toLowerCase() === code.toLowerCase())) throw new ErpError("That Employee ID is already in use");
    const fields = { name, phone, email: email || undefined, code, businessRefs: p.businessRefs, locationIds: p.locationIds, accessRole: p.accessRole, startDate: p.startDate || undefined, employmentType: p.employmentType, ...(p.counters !== undefined ? { counters: cleanCounters(p.counters, p.locationIds) } : {}) };
    if (id) {
      const e = s.employees.find((x) => x.id === id); if (!e) throw new ErpError("Employee not found");
      Object.assign(e, fields); c.audit("EMPLOYEE EDITED", `${code} • ${name}`); return e;
    }
    // Pay is set in Payroll, so no salary is invented here.
    const e: Employee = { ...fields, id: uid(), role: p.accessRole, comp: "salary", salary: 0, rule: { kind: "none", value: 0, paidOnly: false }, active: true, status: "active", createdAt: Date.now() };
    s.employees.unshift(e); c.audit("EMPLOYEE ADDED", `${code} • ${name}`); return e;
  });
}
export function setEmployeeAssignments(id: string, businessRefs: string[], locationIds: string[], accessRole: string) {
  needOwner();
  return commit((s, c) => {
    const e = s.employees.find((x) => x.id === id); if (!e) throw new ErpError("Employee not found");
    e.businessRefs = businessRefs; e.locationIds = locationIds; e.accessRole = accessRole;
    c.audit("EMPLOYEE ASSIGNMENTS", `${e.name}: ${locationIds.length} location(s)`); return e;
  });
}
export function linkEmployeeLogin(id: string, memberId: string | null) {
  return commit((s, c) => {
    const e = s.employees.find((x) => x.id === id); if (!e) throw new ErpError("Employee not found");
    e.memberId = memberId ?? undefined; c.audit("EMPLOYEE LOGIN CREATED", e.name); return e;
  });
}
/** History stays either way: nothing the employee recorded is touched. */
export function setEmploymentStatus(id: string, status: "active" | "suspended" | "terminated") {
  needOwner();
  return commit((s, c) => {
    const e = s.employees.find((x) => x.id === id); if (!e) throw new ErpError("Employee not found");
    e.status = status; e.active = status !== "terminated"; e.terminatedAt = status === "terminated" ? Date.now() : undefined;
    c.audit(`EMPLOYEE ${status.toUpperCase()}`, e.name); return e;
  });
}
