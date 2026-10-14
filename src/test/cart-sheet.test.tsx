import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CartSheet } from "@/components/shopbook/cart-sheet";
import * as erp from "@/lib/erp";

afterEach(cleanup);
function setup() {
  const s = erp.empty();
  s.products.push({ id: "flour", name: "Ajab Flour", buy: 100, sell: 300, qty: 10, unit: "kg", createdAt: 1 });
  const setLine = vi.fn(), saveDraft = vi.fn(), close = vi.fn();
  render(<CartSheet s={s} cart={[{ productId: "flour", qty: 0.5, price: 200, priceReason: "wholesale" }]} money={(n) => `KSh ${n}`} tr={(x) => x} setLine={setLine} remove={vi.fn()} clear={vi.fn()} close={close} next={vi.fn()} saveDraft={saveDraft} />);
  return { setLine, saveDraft, close };
}
describe("shared reference cart", () => {
  it("opens the quantity keypad and preserves the line price override", () => {
    const { setLine } = setup();
    expect(screen.getByText("Subtotal (1 items)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit quantity Ajab Flour" }));
    for (const key of ["0", ".", "2", "5"]) fireEvent.click(screen.getByRole("button", { name: key, exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Done", exact: true }));
    expect(setLine).toHaveBeenCalledWith({ productId: "flour", qty: 0.25, price: 200, priceReason: "wholesale" });
  });
  it("blocks over-stock quantity and lets Cancel keep the original line", () => {
    const { setLine } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Edit quantity Ajab Flour" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Quantity" }), { target: { value: "11" } });
    expect(screen.getByRole("button", { name: "Done", exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(setLine).not.toHaveBeenCalled();
  });
  it("saves only the draft and closes the cart", () => {
    const { saveDraft, close, setLine } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Save Cart", exact: true }));
    expect(saveDraft).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(setLine).not.toHaveBeenCalled();
  });
});