// Every readable spreadsheet of the shop's records, on every plan, so records in an app the plan has locked can still be taken away. Read-only.
import { accountInfo, journal } from "@/lib/accounting";
import { downloadBlob } from "@/lib/download";
import * as erp from "@/lib/erp";

export type Sheet = {
  name: string;
  dated: boolean;
  rows: (s: erp.ErpState) => { at?: number; row: Record<string, unknown> }[];
};
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const employee = (s: erp.ErpState, id: string) => s.employees.find((e) => e.id === id)?.name ?? "";

export const SHEETS: Sheet[] = [
  {
    name: "Products",
    dated: false,
    rows: (s) =>
      s.products.map((p) => ({
        row: {
          ID: p.id,
          Name: p.name,
          SKU: p.sku ?? "",
          Barcode: p.barcode ?? "",
          Category: s.categories.find((c) => c.id === p.categoryId)?.name ?? "",
          Brand: s.brands.find((b) => b.id === p.brandId)?.name ?? "",
          Qty: p.qty,
          "Buying price": p.buy,
          "Selling price": p.sell,
        },
      })),
  },
  {
    name: "Categories",
    dated: false,
    rows: (s) => s.categories.map((c) => ({ row: { ID: c.id, Name: c.name } })),
  },
  {
    name: "Brands",
    dated: false,
    rows: (s) => s.brands.map((c) => ({ row: { ID: c.id, Name: c.name } })),
  },
  {
    name: "Customers",
    dated: false,
    rows: (s) =>
      s.customers.map((c) => ({
        row: { ID: c.id, Name: c.name, Phone: c.phone ?? "", Balance: c.balance },
      })),
  },
  {
    name: "Suppliers",
    dated: false,
    rows: (s) =>
      s.suppliers.map((c) => ({
        row: { ID: c.id, Name: c.name, Phone: c.phone ?? "", Balance: c.balance },
      })),
  },
  {
    name: "Sales",
    dated: true,
    rows: (s) =>
      s.sales.map((x) => ({
        at: x.at,
        row: {
          Ref: x.ref,
          Date: iso(x.at),
          "Customer ID": x.customerId ?? "",
          Customer: s.customers.find((c) => c.id === x.customerId)?.name ?? "",
          Total: x.total,
          Cash: x.pay.cash,
          "M-Pesa": x.pay.mpesa,
          Bank: x.pay.bank,
          "Other accounts": Math.round((erp.paidAmount(x.pay) - x.pay.cash - x.pay.mpesa - x.pay.bank) * 100) / 100,
          "Other account names": erp.payParts(x.pay).filter(([m]) => erp.isAccountMethod(m)).map(([m, v]) => `${erp.methodName(m, s)} ${v}`).join("; "),
          Credit: x.pay.credit,
          // Every method by the business's own name (an M-Pesa renamed EVC reads EVC here), in its order; the columns above stay fixed for re-import.
          "Paid by": erp.payLines(s, x.pay).filter(([m]) => m !== "credit").map(([m, v]) => `${erp.methodName(m, s)} ${v}`).join("; "),
          Settled: x.settled ?? 0,
        },
      })),
  },
  {
    name: "Purchases",
    dated: true,
    rows: (s) =>
      s.purchases.map((x) => ({
        at: x.at,
        row: {
          Ref: x.ref,
          Date: iso(x.at),
          "Supplier ID": x.supplierId ?? "",
          Supplier: s.suppliers.find((c) => c.id === x.supplierId)?.name ?? "",
          Total: x.total,
          Cash: x.pay.cash,
          "M-Pesa": x.pay.mpesa,
          Bank: x.pay.bank,
          "Other accounts": Math.round((erp.paidAmount(x.pay) - x.pay.cash - x.pay.mpesa - x.pay.bank) * 100) / 100,
          "Other account names": erp.payParts(x.pay).filter(([m]) => erp.isAccountMethod(m)).map(([m, v]) => `${erp.methodName(m, s)} ${v}`).join("; "),
          Credit: x.pay.credit,
          // Every method by the business's own name (an M-Pesa renamed EVC reads EVC here), in its order; the columns above stay fixed for re-import.
          "Paid by": erp.payLines(s, x.pay).filter(([m]) => m !== "credit").map(([m, v]) => `${erp.methodName(m, s)} ${v}`).join("; "),
          Settled: x.settled ?? 0,
        },
      })),
  },
  {
    name: "Expenses",
    dated: true,
    rows: (s) =>
      s.expenses.map((x) => ({
        at: x.at,
        row: {
          Ref: x.ref,
          Date: iso(x.at),
          Category: x.category,
          Note: x.description ?? x.note ?? "",
          Amount: x.amount,
          Method: x.method,
        },
      })),
  },
  {
    name: "Stock movements",
    dated: true,
    rows: (s) =>
      s.movements.map((m) => ({ at: m.at, row: { ...m, at: undefined, Date: iso(m.at) } })),
  },
  {
    name: "Other contacts",
    dated: false,
    rows: (s) =>
      s.otherContacts.map((c) => ({
        row: { ID: c.id, Name: c.name, Phone: c.phone ?? "", Category: c.category ?? "" },
      })),
  },
  {
    name: "Employees",
    dated: false,
    rows: (s) =>
      s.employees.map((e) => ({
        row: {
          ID: e.id,
          Name: e.name,
          Phone: e.phone ?? "",
          Role: e.role,
          "Pay type": e.comp,
          Salary: e.salary,
          Active: e.active ? "Yes" : "No",
        },
      })),
  },
  {
    name: "Payroll",
    dated: true,
    rows: (s) =>
      s.payrolls.map((x) => ({
        at: x.at,
        row: {
          Ref: x.ref,
          Date: iso(x.at),
          Employee: employee(s, x.employeeId),
          From: iso(x.from),
          To: iso(x.to),
          Salary: x.salary,
          Commission: x.commission,
          Deductions: x.deductions,
          Net: x.net,
          Paid: x.paid,
        },
      })),
  },
  {
    name: "Payroll payments",
    dated: true,
    rows: (s) =>
      s.payrollPayments.map((x) => ({
        at: x.at,
        row: {
          Ref: x.ref,
          Date: iso(x.at),
          Employee: employee(s, x.employeeId),
          Payroll: s.payrolls.find((p) => p.id === x.payrollId)?.ref ?? "",
          Method: x.method,
          Amount: x.amount,
        },
      })),
  },
  {
    name: "Commissions",
    dated: true,
    rows: (s) =>
      s.commissions.map((x) => ({
        at: x.at,
        row: {
          Date: iso(x.at),
          Employee: employee(s, x.employeeId),
          Source: x.source,
          Kind: x.kind,
          Amount: x.amount,
          Pending: x.pending ? "Yes" : "No",
        },
      })),
  },
  {
    name: "Money movements",
    dated: true,
    rows: (s) =>
      s.payments.map((x) => ({
        at: x.at,
        row: { Ref: x.ref, Date: iso(x.at), Kind: x.kind, Method: x.method, Amount: x.amount },
      })),
  },
  {
    name: "Cash register",
    dated: true,
    rows: (s) =>
      s.cash.map((x) => ({
        at: x.at,
        row: {
          Date: iso(x.at),
          Type: x.type,
          Amount: x.amount,
          Expected: x.expected ?? "",
          Counted: x.counted ?? "",
          Note: x.note ?? "",
          User: x.user,
        },
      })),
  },
  {
    name: "Accounting journal",
    dated: true,
    rows: (s) =>
      journal(s).flatMap((entry) =>
        entry.lines.map((line) => ({
          at: entry.at,
          row: {
            Date: iso(entry.at),
            Ref: entry.ref,
            Memo: entry.memo,
            Account: accountInfo(line.account).name,
            Debit: line.debit,
            Credit: line.credit,
          },
        })),
      ),
  },
];

/** One workbook with everything, whatever the plan. The Excel library loads only when this is used. */
export async function downloadMyRecords(shopName: string, state: erp.ErpState = erp.load()) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  for (const sheet of SHEETS) {
    const rows = sheet.rows(state).map((r) => r.row);
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No records" }]),
      sheet.name,
    );
  }
  const data = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const safeName = shopName.replace(/[^\w-]+/g, "_");
  downloadBlob(
    new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${safeName}-records-${iso(Date.now())}.xlsx`,
  );
}
