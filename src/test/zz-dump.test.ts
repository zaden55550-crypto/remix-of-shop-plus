import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { loadDemoData } from "../lib/demo";
import { load } from "../lib/erp";
import { buildAssistantContext } from "../lib/business-assistant";
import { profitAndLoss } from "../lib/accounting";
import { purchaseTotals } from "../lib/finance";
it("dump", () => { localStorage.clear(); loadDemoData(); const s = load(); const c = buildAssistantContext(s, "TechPoint", "KSh"); const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
writeFileSync("/tmp/ai/ctx.json", JSON.stringify(c)); writeFileSync("/tmp/ai/truth.json", JSON.stringify({ profitMonth: profitAndLoss(s, from, Date.now()).net, payables: purchaseTotals(s).payables, receivables: c.position.receivables, salesMonth: c.periods[4]!.sales })); });
