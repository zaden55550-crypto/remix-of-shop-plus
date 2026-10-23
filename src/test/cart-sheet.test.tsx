import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartCheckout, lineForAmount } from "@/components/shopbook/cart-sheet";
import { parseQty } from "@/lib/qty-parse";
import * as erp from "@/lib/erp";

afterEach(cleanup);
const shop = () => {
  const s = erp.empty();
  s.products.push({ id: "meat", name: "Beef", buy: 500, sell: 800, qty: 10, unit: "kg", createdAt: 1 });
  s.products.push({ id: "soap", name: "Soap", buy: 50, sell: 100, qty: 5, unit: "pcs", createdAt: 1 });
  return s;
};
function setup(line: erp.CartLine) {
  const setLine = vi.fn();
  render(<CartCheckout s={shop()} cart={[line]} money={(n: number) => `KSh ${n}`} tr={(x: string) => x} channel="Sales" setLine={setLine} remove={vi.fn()} clear={vi.fn()} back={vi.fn()} saveDraft={vi.fn()} onDone={vi.fn()} />);
  return setLine;
}

describe("typed quantities", () => {
  it("reads decimals, fractions and mixed fractions", () => {
    expect(parseQty("0.5")).toBe(0.5);
    expect(parseQty("1/2")).toBe(0.5);
    expect(parseQty("1 3/4")).toBe(1.75);
    expect(parseQty("1 and 3/4 yards")).toBe(1.75);
    expect(parseQty("2.25 yard")).toBe(2.25);
    expect(parseQty("¼")).toBe(0.25);
    expect(parseQty("abc")).toBeNull();
  });
  it("sets half a kg from the quantity box", () => {
    const setLine = setup({ productId: "meat", qty: 1 });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity Beef" }), { target: { value: "1/2" } });
    expect(setLine).toHaveBeenCalledWith({ productId: "meat", qty: 0.5 });
  });
  it("blocks more than the stock on hand", () => {
    const setLine = setup({ productId: "meat", qty: 1 });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity Beef" }), { target: { value: "11" } });
    expect(setLine).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Complete Sale/ })).toBeDisabled();
  });
  it("blocks half a piece", () => {
    const setLine = setup({ productId: "soap", qty: 1 });
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity Soap" }), { target: { value: "0.5" } });
    expect(setLine).not.toHaveBeenCalled();
  });
});

describe("typed amounts", () => {
  it("KSh 100 of 800/kg meat is 0.125 kg at the normal price", () => {
    const setLine = setup({ productId: "meat", qty: 1 });
    fireEvent.change(screen.getByRole("textbox", { name: "Amount Beef" }), { target: { value: "100" } });
    expect(setLine).toHaveBeenCalledWith({ productId: "meat", qty: 0.125 });
  });
  it("an amount that does not divide evenly keeps the exact money with a recorded price override", () => {
    const l = lineForAmount(shop(), { productId: "meat", qty: 1 }, 333)!;
    expect(l.qty).toBe(0.416);
    expect(Math.round(l.qty * l.price! * 100) / 100).toBe(333);
    expect(l.priceReason).toBe("Manual amount");
  });
});
