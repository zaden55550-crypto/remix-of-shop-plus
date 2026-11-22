import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as erp from "@/lib/erp";
import { WeightPad } from "@/components/shopbook/weight-pad";
import { currentFeatures, defaultFeatures, saveFeatures } from "@/lib/trade-features";
import { qtyTimesPrice, weighedUnit } from "@/lib/weight-display";

vi.mock("@/hooks/use-language", () => ({
  useLanguage: () => ({ tr: (v: string, x?: string | number) => (x === undefined ? v : v.replace("{x}", String(x))), language: "English", dir: "ltr" }),
}));

const beef: erp.Product = { id: "beef", name: "Beef", unit: "kg", qty: 10, sell: 700, buy: 500, createdAt: 1 };
const soda: erp.Product = { id: "soda", name: "Soda", unit: "pcs", qty: 24, sell: 60, buy: 45, createdAt: 1 };
const state = (): erp.ErpState => ({ ...erp.empty(), products: [beef, soda] });
const money = (n: number) => `KSh ${n}`;

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("which units are weighed", () => {
  it("knows kilos and grams, not pieces", () => {
    for (const u of ["kg", "KG", "kgs", "kilo", "g", "grams"]) expect(erp.isWeightUnit(u), u).toBe(true);
    for (const u of ["pcs", "litre", "packet", "", undefined]) expect(erp.isWeightUnit(u), String(u)).toBe(false);
  });
  it("follows a shop's own unit by its type", () => {
    const units: erp.Unit[] = [{ id: "u1", name: "Debe", abbr: "debe", type: "weight" }, { id: "u2", name: "Gram pack", abbr: "g", type: "quantity" }];
    expect(erp.isWeightUnit("Debe", units)).toBe(true);
    expect(erp.isWeightUnit("g", units)).toBe(false);
  });
});

describe("the Selling by weight switch", () => {
  it("starts on for shops that weigh what they sell", () => {
    expect(defaultFeatures(["Butchery"]).weight).toBe(true);
    expect(defaultFeatures(["Cereals & Grains Shop"]).weight).toBe(true);
    expect(defaultFeatures(["Hardware Shop"]).weight).toBe(false);
    expect(defaultFeatures(["Hardware Shop", "Agrovet"]).weight).toBe(true);
  });
  it("keeps the owner's own choice over the type's", () => {
    saveFeatures({ weight: false });
    expect(currentFeatures(["Butchery"]).weight).toBe(false);
    saveFeatures({ weight: true });
    expect(currentFeatures(["Hardware Shop"]).weight).toBe(true);
  });
});

describe("price per kg on screens", () => {
  it("shows the unit only for weighed lines with the feature on", () => {
    const s = state();
    expect(weighedUnit(s, "beef", undefined, true)).toBe("kg");
    expect(weighedUnit(s, "beef", "kg", false)).toBe("");
    expect(weighedUnit(s, "soda", undefined, true)).toBe("");
    expect(qtyTimesPrice(1.25, "700", "kg")).toBe("1.25 kg × 700/kg");
    expect(qtyTimesPrice(2, "60", "")).toBe("2 × 60");
  });
  it("keeps the unit a line was sold in", () => {
    expect(erp.isWeightUnit("kg")).toBe(true);
    const s = { ...state(), products: [{ ...beef, unit: "pcs" }] };
    expect(weighedUnit(s, "beef", "kg", true)).toBe("kg");
  });
});

describe("the weight keypad", () => {
  const open = (line?: erp.CartLine) => {
    const onSet = vi.fn(), onClose = vi.fn();
    render(<WeightPad s={state()} p={beef} line={line} money={money} onSet={onSet} onClose={onClose} />);
    return { onSet, onClose, entry: screen.getByLabelText("Weight", { selector: "input" }) };
  };

  it("adds the typed weight and shows the price per kg", () => {
    const { onSet, onClose, entry } = open();
    fireEvent.change(entry, { target: { value: "1.25" } });
    expect(screen.getByRole("status").textContent).toBe("1.25 kg × KSh 700/kg = KSh 875");
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(onSet).toHaveBeenCalledWith({ productId: "beef", qty: 1.25 });
    expect(onClose).toHaveBeenCalled();
  });

  it("understands halves and quarters", () => {
    const { onSet, entry } = open();
    fireEvent.change(entry, { target: { value: "1 1/2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(onSet).toHaveBeenCalledWith({ productId: "beef", qty: 1.5 });
  });

  it("sells by money: KSh 350 of beef at 700/kg is half a kilo", () => {
    const { onSet } = open();
    fireEvent.click(screen.getByRole("tab", { name: "Amount" }));
    fireEvent.change(screen.getByLabelText("Amount", { selector: "input" }), { target: { value: "350" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(onSet).toHaveBeenCalledWith({ productId: "beef", qty: 0.5 });
  });

  it("keeps an amount that doesn't divide evenly exact, as an audited price", () => {
    const { onSet } = open();
    fireEvent.click(screen.getByRole("tab", { name: "Amount" }));
    fireEvent.change(screen.getByLabelText("Amount", { selector: "input" }), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    const line = onSet.mock.calls[0]![0] as erp.CartLine;
    expect(line.qty).toBe(0.143);
    expect(line.priceReason).toBe("Manual amount");
    expect(erp.lineAmount(state(), line)).toBe(100);
  });

  it("uses the quick buttons", () => {
    const { onSet } = open();
    fireEvent.click(screen.getByRole("button", { name: "½ kg" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to cart" }));
    expect(onSet).toHaveBeenCalledWith({ productId: "beef", qty: 0.5 });
  });

  it("never sells more than is in stock", () => {
    const { onSet, entry } = open();
    fireEvent.change(entry, { target: { value: "12" } });
    expect(screen.getByRole("status").textContent).toContain("Insufficient stock");
    expect(screen.getByRole("button", { name: "Add to cart" })).toBeDisabled();
    expect(onSet).not.toHaveBeenCalled();
  });

  it("changes a line already in the cart", () => {
    const { onSet, entry } = open({ productId: "beef", qty: 2 });
    expect(entry).toHaveValue("2");
    fireEvent.change(entry, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Update cart" }));
    expect(onSet).toHaveBeenCalledWith({ productId: "beef", qty: 3 });
  });
});
