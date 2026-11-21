// The shop's selling and buying rules: part quantities, buying and selling by money, free prices, and the two confirmations.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { CartCheckout, lineForAmount } from "@/components/shopbook/cart-sheet";
import { conversionFactor, listUnits } from "@/lib/catalog";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

let meat: erp.Product, soap: erp.Product, cloth: erp.Product;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Test Shop", email: "t@example.com", currency: "KES", password: "x" }));
  meat = erp.addProduct({ name: "Meat", buy: 700, sell: 800, qty: 10, unit: "Kg" });
  soap = erp.addProduct({ name: "Soap", buy: 50, sell: 100, qty: 5, unit: "Piece" });
  cloth = erp.addProduct({ name: "Cloth", buy: 200, sell: 300, qty: 20, unit: "Yard" });
});
const cash = (total: number) => ({ cash: total, mpesa: 0, bank: 0, credit: 0 });
const sell = (lines: erp.CartLine[], total: number) => erp.confirmSale({ cart: lines, discount: 0, pay: cash(total), channel: "POS" });

function Cart({ first }: { first: erp.CartLine[] }) {
  const [cart, setCart] = useState(first);
  const [s, setS] = useState(erp.load());
  return <CartCheckout s={s} cart={cart} money={(n) => `KSh ${n}`} tr={(x) => x} channel="POS"
    setLine={(l) => setCart((c) => c.map((v) => (v.productId === l.productId ? l : v)))} remove={vi.fn()} clear={vi.fn()} back={vi.fn()} saveDraft={vi.fn()} onDone={() => setS(erp.load())} />;
}
const type = (name: string, value: string) => {
  const box = screen.getByRole("textbox", { name });
  fireEvent.focus(box);
  fireEvent.change(box, { target: { value } });
  fireEvent.blur(box);
};

describe("selling kilos, litres and yards", () => {
  it("2 kg of meat at 800 is 1,600; half a kg is 400; 100 shillings' worth is 0.125 kg", () => {
    const s = erp.load();
    expect(erp.lineAmount(s, { productId: meat.id, qty: 2 })).toBe(1600);
    expect(erp.lineAmount(s, { productId: meat.id, qty: 0.5 })).toBe(400);
    expect(lineForAmount(s, { productId: meat.id, qty: 1 }, 100)).toEqual({ productId: meat.id, qty: 0.125 });
    const sale = sell([{ productId: meat.id, qty: 0.125 }], 100);
    expect(sale.total).toBe(100);
    expect(erp.load().products.find((p) => p.id === meat.id)?.qty).toBe(9.875);
  });

  it("yards sell in part too, and Yard is a built-in unit", () => {
    expect(listUnits(erp.load()).some((u) => u.name === "Yard" && u.type === "length")).toBe(true);
    expect(erp.isWholeUnit("Yard", erp.load().units)).toBe(false);
    const sale = sell([{ productId: cloth.id, qty: 1.5 }], 450);
    expect(sale.items[0]).toMatchObject({ qty: 1.5, price: 300 });
    expect(lineForAmount(erp.load(), { productId: cloth.id, qty: 1 }, 750)).toEqual({ productId: cloth.id, qty: 2.5 });
    expect(conversionFactor(erp.load(), "Yard", "Yard")).toBe(1);
  });

  it("pieces stay whole: another amount is another price for the same pieces", () => {
    expect(() => sell([{ productId: soap.id, qty: 0.5 }], 50)).toThrow(/whole/);
    const s = erp.load();
    expect(lineForAmount(s, { productId: soap.id, qty: 2 }, 300)).toEqual({ productId: soap.id, qty: 3 });
    expect(lineForAmount(s, { productId: soap.id, qty: 2 }, 150)).toMatchObject({ qty: 2, price: 75, priceReason: "Manual amount" });
  });

  it("a product with no selling price yet can be sold at the amount typed", () => {
    const free = erp.addProduct({ name: "Offal", buy: 0, sell: 0, qty: 5, unit: "Kg" });
    expect(lineForAmount(erp.load(), { productId: free.id, qty: 2 }, 500)).toMatchObject({ qty: 2, price: 250 });
  });
});

describe("cart screen", () => {
  it("any price can be typed; the product's own price stays", () => {
    render(<Cart first={[{ productId: meat.id, qty: 2 }]} />);
    type(`Price Meat`, "750");
    expect((screen.getByRole("textbox", { name: "Amount Meat" }) as HTMLInputElement).value).toBe("1500");
    expect(screen.queryByRole("alertdialog")).toBeNull(); // 750 is above the buying price
    expect(erp.load().products.find((p) => p.id === meat.id)?.sell).toBe(800);
  });

  it("below the buying price warns, and Change price goes back", async () => {
    render(<Cart first={[{ productId: meat.id, qty: 1 }]} />);
    type("Price Meat", "600");
    const box = await screen.findByRole("alertdialog");
    expect(box.textContent).toMatch(/below the buying price/);
    await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Change price" })));
    expect((screen.getByRole("textbox", { name: "Price Meat" }) as HTMLInputElement).value).toBe("800");
  });

  it("a confirmed low price, then the final check, completes and is audited", async () => {
    render(<Cart first={[{ productId: meat.id, qty: 1 }]} />);
    type("Amount Meat", "800");
    type("Price Meat", "600");
    await act(async () => fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Yes, confirm" })));
    fireEvent.click(screen.getByRole("button", { name: /Complete Sale/ }));
    expect(erp.load().sales).toHaveLength(0); // nothing until the final yes
    const check = await screen.findByRole("alertdialog");
    expect(check.textContent).toMatch(/Is it confirmed/);
    expect(check.textContent).toMatch(/1 Kg × KSh 600/);
    expect(check.textContent).toMatch(/below buying price/);
    await act(async () => fireEvent.click(within(check).getByRole("button", { name: "Yes, complete sale" })));
    expect(erp.load().sales[0]?.total).toBe(600);
    expect(erp.load().audit.some((a) => a.action === "SOLD BELOW BUYING PRICE" && a.detail.includes("buying price 700"))).toBe(true);
  });
});

describe("buying", () => {
  const supplier = () => fin.addSupplier("Kevin", "0700").id;
  const credit = (total: number) => ({ cash: 0, mpesa: 0, bank: 0, credit: total });

  it("kilos can be bought in part; pieces can't", () => {
    const supplierId = supplier();
    fin.confirmPurchase({ lines: [{ productId: meat.id, qty: 2.5, cost: 700 }], pay: credit(1750), supplierId, updateCost: true });
    expect(erp.load().products.find((p) => p.id === meat.id)?.qty).toBe(12.5);
    expect(() => fin.confirmPurchase({ lines: [{ productId: soap.id, qty: 1.5, cost: 50 }], pay: credit(75), supplierId, updateCost: true })).toThrow(/whole/);
  });

  it("100 shillings' worth is recorded at exactly 100 and leaves the buying price alone", () => {
    const qty = 0.143, cost = Math.round((100 / qty) * 1e6) / 1e6;
    const p = fin.confirmPurchase({ lines: [{ productId: meat.id, qty, cost, keepCost: true }], pay: credit(100), supplierId: supplier(), updateCost: true });
    expect(p.total).toBe(100);
    const after = erp.load().products.find((x) => x.id === meat.id);
    expect(after?.qty).toBe(10.143);
    expect(after?.buy).toBe(700);
  });
});
