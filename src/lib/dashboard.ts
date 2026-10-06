import type { ErpState } from "@/lib/erp";

/** Read-only summary. Purchases and Expenses do not have transaction engines yet. */
export function dashboardTotals(s: ErpState) {
  const sales = s.sales.reduce((sum, sale) => sum + sale.total, 0)
    - s.returns.reduce((sum, ret) => sum + ret.amount, 0);
  const stock = s.products.reduce((sum, product) => sum + product.qty * product.buy, 0);
  return { sales, purchases: null, expenses: null, profit: null, stock };
}