import { describe, expect, it } from "vitest";
import { empty } from "../lib/erp";
import { answerShopbot, BOT_TOPICS, matchTopic, type BotContext } from "../lib/shopbot";
const base = (): BotContext => ({ allowed: true, state: empty(), currency: "KSh", syncedAt: 1000, pending: 2, online: false });
describe("native read-only ShopBot", () => {
  it("answers every documented module without Google or network", () => {
    for (const topic of BOT_TOPICS) expect(answerShopbot(`How to use ${topic.words[0]}`, { ...base(), allowed: false }).path).toBeDefined();
  });
  it("recognizes typos and synonyms", () => { expect(matchTopic("How do I add a prodct")?.id).toBe("products"); expect(matchTopic("split payment")?.id).toBe("payment"); });
  it("keeps follow-up topic", () => { expect(matchTopic("where is it", "payroll")?.id).toBe("payroll"); });
  it("returns exact ledger balances with cached timestamp and pending count", () => {
    const context = base(); context.state?.payments.push({ id: "p", ref: "p", at: 1000, kind: "DEPOSIT", method: "cash", amount: 123, source: "", user: "" });
    const answer = answerShopbot("cash balance", context); expect(answer.data).toBe(true); expect(answer.text).toContain("123"); expect(answer.text).toContain("offline cached"); expect(answer.text).toContain("Last confirmed sync:"); expect(answer.text).toContain("2 changes");
  });
  it("never reads business data without authorized context", () => { const answer = answerShopbot("today sales", { ...base(), allowed: false }); expect(answer.data).toBeUndefined(); expect(answer.text).toContain("Sign in"); });
  it("does not claim a sync timestamp if none occurred", () => { const answer = answerShopbot("cash balance", { ...base(), syncedAt: 0 }); expect(answer.text).toContain("No confirmed sync yet"); });
  it("honestly refuses unsupported figures and unclear questions", () => { expect(answerShopbot("what is the total weather", base()).data).toBeUndefined(); expect(answerShopbot("purple giraffe", base()).topic).toBeUndefined(); });
  it("answers instructions offline and never mutates supplied records", () => { const context = base(), before = JSON.stringify(context.state); answerShopbot("How to record a refund", context); expect(JSON.stringify(context.state)).toBe(before); });
  it("understands how much and date follow-ups without guessing unsupported periods", () => {
    expect(answerShopbot("How much did I sell today?", base()).data).toBe(true);
    expect(answerShopbot("what about this month", base(), "sales").data).toBe(true);
    expect(answerShopbot("last month sales", base()).data).toBeUndefined();
  });
  it("never substitutes local entries for external confirmations or another business", () => {
    expect(answerShopbot("externally confirmed mpesa received today", base()).data).toBeUndefined();
    expect(answerShopbot("today sales from another shop", base()).data).toBeUndefined();
  });
});