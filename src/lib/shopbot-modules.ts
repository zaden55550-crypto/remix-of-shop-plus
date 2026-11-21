// Module-aware ShopBot suggestions: plain data, so they can be tested without the UI.
export type ShopbotAction = { label: string; questions: string[] };
export type ShopbotModule = { name: string; intro: string; actions: ShopbotAction[] };

/** Suggested actions send approved questions the deterministic bot answers from records or help topics.
 *  They follow the module on screen; the conversation itself is shared across modules. */
const GENERAL: ShopbotModule = {
  name: "",
  intro: "Hello! 👋 I'm ShopBot. How can I help your business today?",
  actions: [
    { label: "Sales summary", questions: ["Sales today"] },
    { label: "Check stock levels", questions: ["Low stock products"] },
    { label: "Receivables & payables", questions: ["Who owes me", "Supplier balances"] },
    { label: "Reports & insights", questions: ["How do I view reports?"] },
  ],
};
const one = (label: string, question = label): ShopbotAction => ({ label, questions: [question] });
export const SHOPBOT_MODULES: Record<string, ShopbotModule> = {
  "/inventory": { name: "Inventory", intro: "You're in Inventory. I can check stock levels and stock value, or guide you through adding products.", actions: [one("Low stock products"), one("Stock value"), one("Add a product", "How do I add a product?"), one("Record a return", "How do I record a return?")] },
  "/sales": { name: "Sales", intro: "You're in Sales. Ask about today's sales, top products, returns or customer balances.", actions: [one("Sales today"), one("Top products this week"), one("Who owes me"), one("Record a return", "How do I record a return?")] },
  "/pos": { name: "POS", intro: "You're at the POS. I can help with checkout, mixed payments and today's takings.", actions: [one("Sales today"), one("Split a payment", "How do I take a mixed payment?"), one("Give a discount", "How do I give a discount at checkout?"), one("Cash balance")] },
  "/purchases": { name: "Purchases", intro: "You're in Purchases. Ask about supplier balances, this month's purchases or how to record one.", actions: [one("Supplier balances"), one("Purchases this month"), one("Record a purchase", "How do I record a purchase?"), one("Low stock to reorder", "Low stock products")] },
  "/expenses": { name: "Expenses", intro: "You're in Expenses. Ask about spending or how to record an expense.", actions: [one("Expenses this month"), one("Expenses today"), one("Add an expense", "How do I add an expense?"), one("Profit this month")] },
  "/contacts": { name: "Contacts", intro: "You're in Contacts. I can list customer debts and supplier balances.", actions: [one("Who owes me"), one("Supplier balances"), one("Customer credit", "How do I record a customer debt?")] },
  "/accounting": { name: "Accounting", intro: "You're in Accounting. Ask about profit, balances or the journal.", actions: [one("Profit this month"), one("Cash balance"), one("Bank balance"), one("The journal", "How do I view the accounting journal?")] },
  "/float": { name: "Float", intro: "You're in Float. I can show cash, M-Pesa and bank balances or explain a cash-up.", actions: [one("Cash balance"), one("M-Pesa balance"), one("Bank balance"), one("Do a cash-up", "How do I do a cash up?")] },
  "/payroll": { name: "Payroll", intro: "You're in Payroll. I can guide you through employees, salaries and commission.", actions: [one("Pay salaries", "How do I pay salary?"), one("Seller commission", "How do I set seller commission?"), one("Add an employee", "How do I add an employee?")] },
  "/reports": { name: "Reports", intro: "You're in Reports. Ask for sales, profit or top products for a period.", actions: [one("Sales this month"), one("Profit this month"), one("Top products this month"), one("Export a report", "How do I export data?")] },
  "/summary": { name: "Summary", intro: "You're in Summary. Ask how the business is doing this week or month.", actions: [one("Sales this week"), one("Profit this month"), one("Expenses this month"), one("Stock value")] },
  "/settings": { name: "Settings", intro: "You're in Settings. I can explain imports, backups, currency and appearance.", actions: [one("Import data", "How do I import data?"), one("Back up / restore", "How do I download a backup?"), one("Change currency", "How do I change currency?"), one("Sync status", "Why is sync pending?")] },
};
export const shopbotModule = (path: string): ShopbotModule =>
  SHOPBOT_MODULES[Object.keys(SHOPBOT_MODULES).find((k) => path === k || path.startsWith(`${k}/`)) ?? ""] ?? GENERAL;
