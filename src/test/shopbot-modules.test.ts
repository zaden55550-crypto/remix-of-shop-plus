import { describe, expect, it } from "vitest";
import { empty } from "../lib/erp";
import { answerShopbot, type BotContext } from "../lib/shopbot";
import { SHOPBOT_MODULES, shopbotModule } from "../lib/shopbot-modules";

const context = (): BotContext => ({ allowed: true, state: empty(), currency: "KSh", syncedAt: 1000, pending: 0, online: true });
const FALLBACK = "I couldn't match that question reliably";

describe("module-aware ShopBot suggestions", () => {
  it("every suggested question in every module gets a real answer, not the fallback", () => {
    for (const [path, module] of Object.entries(SHOPBOT_MODULES)) {
      for (const action of module.actions) {
        for (const q of action.questions) {
          const answer = answerShopbot(q, context());
          expect(answer.text, `${path} → "${q}"`).not.toContain(FALLBACK);
        }
      }
    }
  });

  it("recognises the module from the current page, including subpages", () => {
    expect(shopbotModule("/inventory").name).toBe("Inventory");
    expect(shopbotModule("/pos").name).toBe("POS");
    expect(shopbotModule("/accounting/journal").name).toBe("Accounting");
    expect(shopbotModule("/apps").name).toBe("");
    expect(shopbotModule("/dashboard").name).toBe("");
    // A route that merely starts with the same letters is not that module.
    expect(shopbotModule("/salesforce").name).toBe("");
  });
});
