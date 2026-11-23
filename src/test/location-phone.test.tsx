// Each shop's own phone (Business Setup › Phone): saved at Activate, loaded back into the row, checked when typed,
// and printed on that shop's receipts instead of the business number.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import * as erp from "@/lib/erp";
import { activateSetup, rowsFromRecords, validate, type SetupDraft, type SetupRow } from "@/lib/business-setup";
import { listLocations, saveLocation } from "@/lib/locations";
import { Receipt } from "@/components/shopbook/selling";

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ tr: (v: string) => v, language: "English", dir: "ltr" }) }));

const account = () => {
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Byteboost", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1", phone: "0700 000 000" }));
  localStorage.setItem("shopbook.session", "1");
};
const row = (key: string, name: string, code: string, extra: Partial<SetupRow> = {}): SetupRow => ({ key, type: "shop", name, code, ...extra });
const draft = (rows: SetupRow[]): SetupDraft => ({ businessName: "Byteboost", businessType: "Supermarket", otherType: "", extraBusinessTypes: [], rows, users: [], industryFamilyId: "trade" } as unknown as SetupDraft);

beforeEach(() => { localStorage.clear(); account(); });
afterEach(cleanup);

describe("a location's own phone", () => {
  it("is saved at Activate and loads back into its row", () => {
    activateSetup(draft([row("a", "Westlands", "S001", { phone: " 0712 345 678 " }), row("b", "CBD", "S002")]));
    const saved = listLocations(erp.load());
    expect(saved.find((l) => l.name === "Westlands")?.phone).toBe("0712 345 678");
    expect(saved.find((l) => l.name === "CBD")?.phone).toBeUndefined();
    expect(rowsFromRecords(erp.load()).find((r) => r.name === "Westlands")?.phone).toBe("0712 345 678");
  });

  it("must look like a phone number when one is typed", () => {
    const problems = (phone: string) => validate(draft([row("a", "Westlands", "S001", { phone })]), 5, 5, 0, [], []).filter((p) => p.field === "phone");
    expect(problems("0712 345 678")).toEqual([]);
    expect(problems("+254 712 345 678")).toEqual([]);
    expect(problems("")).toEqual([]);
    expect(problems("abc")).toHaveLength(1);
    expect(problems("123")).toHaveLength(1);
  });

  it("is printed on that shop's receipts instead of the business number", () => {
    const shop = saveLocation({ name: "Westlands", type: "shop", phone: "0712 345 678" });
    const s = erp.load();
    const sale = { id: "s1", ref: "S-000001", at: Date.now(), items: [], subtotal: 0, discount: 0, total: 0, pay: erp.emptyPayRecord(), cashier: "Admin", channel: "POS", locationId: shop.id } as unknown as erp.Sale;
    render(<Receipt sale={sale} s={s} money={(n) => `KSh ${n}`} tr={(v) => v} shop="Byteboost" />);
    expect(screen.getByText("Tel: 0712 345 678")).toBeInTheDocument();
  });

  it("falls back to the business number for a shop without one", () => {
    const shop = saveLocation({ name: "CBD", type: "shop" });
    const sale = { id: "s2", ref: "S-000002", at: Date.now(), items: [], subtotal: 0, discount: 0, total: 0, pay: erp.emptyPayRecord(), cashier: "Admin", channel: "POS", locationId: shop.id } as unknown as erp.Sale;
    render(<Receipt sale={sale} s={erp.load()} money={(n) => `KSh ${n}`} tr={(v) => v} shop="Byteboost" />);
    expect(screen.getByText("Tel: 0700 000 000")).toBeInTheDocument();
  });
});
