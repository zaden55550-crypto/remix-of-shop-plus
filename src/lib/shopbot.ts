import { performance, position, periodStart, type Period } from "@/lib/summary";
import { floatBalances, purchaseTotals } from "@/lib/finance";
import { profitAndLoss } from "@/lib/accounting";
import { stockStatus, type ErpState } from "@/lib/erp";

export type BotAnswer = { text: string; path?: string; topic?: string; data?: boolean };
type Topic = { id: string; words: string[]; path: string; steps: string };
export const BOT_TOPICS: Topic[] = [
  { id: "products", words: ["product", "inventory", "stock", "barcode", "sku", "price"], path: "/inventory", steps: "Open Inventory. Use Add Product, enter its name, buying price, selling price and opening quantity, then save. Tap a product to add it to a selling cart. Stock corrections require a recorded movement and reason." },
  { id: "brands", words: ["brand", "category", "categories"], path: "/settings", steps: "Open Settings → General → Categories and Brands. Add or rename the entry. Assign it when editing a product in Inventory." },
  { id: "purchases", words: ["purchase", "supplier", "buy", "bill"], path: "/purchases", steps: "Open Purchases and start a purchase. Choose products, quantities, costs and supplier. Allocate payment; unpaid amounts use Credit and require a supplier. Review and confirm. Supplier returns are recorded against the original purchase." },
  { id: "sales", words: ["sale", "sales", "pos", "sell", "checkout", "discount", "receipt"], path: "/pos", steps: "Open POS or Sales. Tap a product to add it. Use +/− for quantity or tap the quantity for the keypad; edit Amt/Price for a one-sale override. Open Checkout, allocate payment and confirm. Cash tender above the total produces change; credit requires a named customer." },
  { id: "payment", words: ["partial", "mixed", "split", "mpesa", "m pesa", "p pay", "payment"], path: "/sales", steps: "At Checkout use the shared payment picker for Cash, M-Pesa, Bank or Credit. Split the total between methods; the unpaid remainder goes to Credit. Choose a customer when any credit remains. Use P.PAY on the saved sale to settle later. M-Pesa and bank entries are manual records, not external payment confirmations." },
  { id: "returns", words: ["return", "refund"], path: "/sales", steps: "Open the original sale in Sales and record a return with quantities and refund method. For supplier returns use the original purchase in Purchases. Confirming records stock and refund movements together; earned commission history is preserved with reversal entries." },
  { id: "expenses", words: ["expense", "spend", "spent", "cost"], path: "/expenses", steps: "Open Expenses, add an expense, select its category, amount and payment method, then save. Expense paid and balance figures come from recorded payments." },
  { id: "contacts", words: ["customer", "contact", "debt", "owe", "credit"], path: "/contacts", steps: "Open Contacts → Customers or Suppliers. Open the person to see balances and statements. Customer debt repayments are recorded against open sales, oldest first; the original sale payment split stays unchanged." },
  { id: "accounting", words: ["accounting", "journal", "profit", "loss", "ledger"], path: "/accounting", steps: "Open Accounting for the journal, Profit & Loss, balance sheet and trial balance. These are read-only calculations from the shared records; purchases are stock bought, not automatically operating expenses." },
  { id: "reports", words: ["report", "summary", "chart", "dashboard"], path: "/reports", steps: "Open Reports, select a report and date range, then view or export. Summary shows performance and financial position. Missing financial sources show a dash rather than invented totals." },
  { id: "float", words: ["float", "cash", "cashup", "cash up", "transfer", "deposit", "withdrawal"], path: "/float", steps: "Open Float for recorded Cash, M-Pesa and Bank balances, deposits, withdrawals and transfers. For cash-up enter the counted drawer money and a reason for any difference. POS and Float share the same cash-up history." },
  { id: "payroll", words: ["payroll", "employee", "salary", "commission", "seller"], path: "/payroll", steps: "Open Payroll to add employees, compensation and commission rules. Select a seller at checkout. Generate a payroll run for a period, review salary/commission/deductions, then record payment. Commission reversals are separate ledger rows." },
  { id: "imports", words: ["import", "upload", "template", "excel", "workbook"], path: "/settings", steps: "Open Settings → General → Import & Data. Choose Full Business Import or Import by Category. Download the template, fill the sheets, upload, map unmatched columns, validate and review errors before confirming. Re-import protection uses saved import keys." },
  { id: "export", words: ["export", "download", "backup", "restore"], path: "/settings", steps: "Open Settings → General → Export Data to download records. For whole-business protection use Autosave & Backup. Review a restore carefully; account, password and plan are not replaced. Automatic cloud backups run while the app is open." },
  { id: "settings", words: ["setting", "currency", "appearance", "size", "theme", "language", "notification", "integration", "security"], path: "/settings", steps: "Open Settings for Business Profile, Appearance, language, data and other preferences. The interface size control spans 50%–200%. Currency is also available from Apps → Menu → Currency. Integration preferences do not mean a live payment provider is connected." },
  { id: "plans", words: ["plan", "subscription", "billing", "trial", "role", "permission", "user"], path: "/plans", steps: "Open Plans to review subscriptions or Apps → Menu → Profile → Manage subscription. Modules follow your current plan. Staff account permissions are not fully implemented; employee records do not create secure staff logins." },
  { id: "sync", words: ["sync", "offline", "online", "connecting", "waiting", "pending", "connection"], path: "/apps", steps: "Tap the connection indicator to see backend availability, pending changes and confirmed times. Records save on this device first. Active checks run every five seconds. Retry now checks the backend and retries eligible changes. Sign-in is required for cloud sync; conflicts remain saved and require review. Keep this device's data until pending changes are resolved." },
];
const normalize = (s: string) => s.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
function distance(a: string, b: string) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min((next[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = next; }
  return prev[b.length] ?? 100;
}
export function matchTopic(question: string, previous?: string): Topic | undefined {
  const q = normalize(question), tokens = q.split(" ");
  if (/^(and |what about |how about |then|where is it|how do i do that)/.test(q) && previous) return BOT_TOPICS.find((t) => t.id === previous);
  const candidates = BOT_TOPICS.map((topic) => ({ topic, score: topic.words.reduce((n, word) => n + (q.includes(word) ? word.includes(" ") ? 3 : 2 : tokens.some((token) => token.length >= 5 && word.length >= 5 && distance(token, word) <= 1) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score > 0 ? candidates[0].topic : undefined;
}
export type BotContext = { state: ErpState | null; allowed: boolean; currency: string; syncedAt: number; pending: number; online: boolean };
export function answerShopbot(question: string, context: BotContext, previous?: string, now = new Date()): BotAnswer {
  const raw = normalize(question);
  const follow = /^(and |what about |how about )/.test(raw) && !BOT_TOPICS.some((t) => t.words.some((w) => raw.includes(w))) && previous;
  const q = follow ? `${raw} ${previous}` : raw, topic = matchTopic(question, previous);
  const help = /\b(how to|how do|how can|where|add|record|change|set|import|export|why|download)\b/.test(q);
  const dataQuestion = !help && /\b(today|month|week|yesterday|balance|balances|value|worth|low|owe|owes|outstanding|top|much|total|received|profit)\b/.test(q);
  if (dataQuestion) {
    if (/another (shop|business|user)|other (shop|business|user)/.test(q)) return { text: "I can only answer from this shop's authorized records." };
    if (/live|externally confirmed|provider confirmed/.test(q)) return { text: "I cannot verify external provider payment confirmations. Recorded entries are not proof of M-Pesa or bank settlement." };
    if (!context.allowed || !context.state) return { text: "Sign in to this shop to view its records. I can still help with SHOPBOOK instructions." };
    const s = context.state, currency = context.currency;
    const money = (n: number) => `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
    const period: Period = q.includes("month") ? "Month" : q.includes("week") ? "Week" : q.includes("all time") ? "All time" : "Today";
    const from = q.includes("yesterday") ? periodStart("Today", now) - 864e5 : q.includes("this week") ? periodStart("Today", now) - ((now.getDay() + 6) % 7) * 864e5 : periodStart(period, now);
    const to = q.includes("yesterday") ? periodStart("Today", now) - 1 : now.getTime();
    let text: string | undefined, path = topic?.path;
    if (/low.*stock|out.*stock|reorder/.test(q)) { text = s.products.filter((p) => stockStatus(p) !== "OK").map((p) => `${p.name}: ${p.qty} ${p.unit ?? "pcs"}`).join("\n") || "No products are low or out of stock in these records."; path = "/inventory"; }
    else if (/stock.*(value|worth)|inventory.*value/.test(q)) text = `Stock value at buying cost: ${money(position(s).stock)}.`;
    else if (/customer.*(owe|outstanding|credit)|who.*owe|receivable/.test(q)) { text = s.customers.filter((c) => c.balance > 0).map((c) => `${c.name}: ${money(c.balance)}`).join("\n") || "No outstanding customer balances in these records."; path = "/contacts"; }
    else if (/supplier.*balance|purchase.*balance|payable/.test(q)) { text = `Outstanding purchase balances: ${money(purchaseTotals(s).payables)}.`; path = "/purchases"; }
    else if (/balance/.test(q)) { const accounts = floatBalances(s), method = q.includes("mpesa") || q.includes("m pesa") ? "mpesa" : q.includes("bank") ? "bank" : "cash"; text = `Recorded ${method === "mpesa" ? "M-Pesa" : method} balance: ${money(accounts[method])}.`; path = "/float"; }
    else if (/top|best sell/.test(q)) { text = performance(s, from, to).top.map((p) => `${p.name}: ${p.qty} sold, ${money(p.value)}`).join("\n") || "No sales in this period."; path = "/reports"; }
    else if (/mpesa|m pesa/.test(q)) { const total = s.payments.filter((p) => p.method === "mpesa" && p.amount > 0 && p.at >= from && p.at <= to).reduce((a, p) => a + p.amount, 0); text = `${period} recorded M-Pesa inflows: ${money(total)}. These entries are not externally verified.`; path = "/float"; }
    else if (/expense|spen[dt]/.test(q)) text = `${period} expenses: ${money(purchaseTotals(s, from, to).expenses)}.`;
    else if (/profit/.test(q)) text = `${period} net profit: ${money(profitAndLoss(s, from, to).net)}.`;
    else if (/sale|sold|sell/.test(q)) text = `${period} net sales after returns: ${money(performance(s, from, to).sales)}.`;
    else if (/purchase/.test(q)) text = `${period} purchases: ${money(purchaseTotals(s, from, to).purchases)}.`;
    if (text) return { text: `${text}\n\nDevice records${context.online ? "" : " · offline cached data"}. ${context.syncedAt ? `Last confirmed sync: ${new Date(context.syncedAt).toLocaleString()}.` : "No confirmed sync yet."} ${context.pending ? `${context.pending} changes waiting to sync.` : ""}`, ...(path ? { path } : {}), ...(topic ? { topic: topic.id } : {}), data: true };
    return { text: "I cannot verify that figure from an approved query. Ask about sales, expenses, profit, stock, customer debt or account balances." };
  }
  if (topic) return { text: topic.steps, path: topic.path, topic: topic.id };
  return { text: "I couldn't match that question reliably. Ask about adding products, checkout, payments, imports, backups, payroll or synchronization.", path: "/apps" };
}