// Product Setup: the catalog engine, its link to Purchases, and the real screen. Fixtures only.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import * as catalog from "@/lib/catalog";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const { toast } = await import("sonner");
const { ProductSetup } = await import("@/components/shopbook/product-setup");
const errors = () => vi.mocked(toast.error).mock.calls.map((c) => c[0]);

function Screen() {
  const [s, setS] = useState(erp.load());
  useEffect(() => erp.subscribe(() => setS(erp.load())), []);
  return <div className="shop-app"><ProductSetup s={s} tr={(t) => t} registering={null} onRegistered={() => {}} /></div>;
}
const carton = () => catalog.saveUnit({ id: "unit-carton", name: "Carton", abbr: "ctn", type: "quantity", baseId: "unit-piece", factor: 24 });
const credit = (total: number) => ({ cash: 0, mpesa: 0, bank: 0, credit: total });
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label, { selector: "input,textarea,select" }), { target: { value } });

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Test Shop", email: "t@example.com", currency: "KES", password: "x" }));
  vi.mocked(toast.error).mockClear();
});

describe("units and conversions", () => {
  it("offers the built-in units without writing them, and they can't be duplicated", () => {
    const s = erp.load();
    expect(s.units).toHaveLength(0);
    expect(catalog.listUnits(s).map((u) => u.name)).toEqual(["Piece", "Kg", "Gram", "Litre", "Millilitre", "Box", "Carton", "Packet", "Metre", "Yard"]);
    expect(() => catalog.saveUnit({ name: "carton", abbr: "x", type: "quantity" })).toThrow(/already exists/);
    expect(() => catalog.saveUnit({ name: "Sack", abbr: "ctn", type: "quantity" })).toThrow(/already exists/);
  });

  it("converts only between linked units of the same type, and never in a circle", () => {
    expect(catalog.conversionFactor(erp.load(), "Carton", "Piece")).toBeNull();
    carton();
    expect(catalog.conversionFactor(erp.load(), "Carton", "Piece")).toBe(24);
    expect(catalog.conversionFactor(erp.load(), "Piece", "Carton")).toBeCloseTo(1 / 24);
    expect(catalog.conversionFactor(erp.load(), "Kg", "Gram")).toBe(1000);
    expect(catalog.conversionFactor(erp.load(), "Carton", "Kg")).toBeNull();
    expect(() => catalog.saveUnit({ name: "Sack", abbr: "sk", type: "weight", baseId: "unit-piece", factor: 2 })).toThrow(/same type/);
    expect(() => catalog.saveUnit({ id: "unit-piece", name: "Piece", abbr: "pcs", type: "quantity", baseId: "unit-carton", factor: 2 })).toThrow(/circle/);
    expect(() => catalog.saveUnit({ id: "unit-box", name: "Box", abbr: "box", type: "quantity", baseId: "unit-piece", factor: 0 })).toThrow(/how many/);
  });

  it("2 Cartons bought become 48 Pieces of stock on one product; selling 3 leaves 45", () => {
    carton();
    const p = erp.addProduct({ name: "Soda", buy: 40, sell: 60, qty: 0, unit: "Piece" });
    const sup = fin.addSupplier("Kevin", "0700");
    const pur = fin.confirmPurchase({ lines: [{ productId: p.id, qty: 2, cost: 1000, unit: "Carton" }], pay: credit(2000), supplierId: sup.id, updateCost: true });
    const after = erp.load().products.find((x) => x.id === p.id)!;
    expect(after.qty).toBe(48);
    expect(after.buy).toBeCloseTo(41.666667);
    expect(pur.total).toBe(2000);
    expect(pur.items[0]).toMatchObject({ qty: 48, bought: { qty: 2, unit: "Carton" } });
    expect(erp.load().movements[0]).toMatchObject({ type: "PURCHASE", qty: 48, next: 48 });
    expect(erp.load().products).toHaveLength(1);
    erp.stockOut(p.id, 3, "Sold");
    expect(erp.load().products[0]?.qty).toBe(45);
    expect(() => fin.confirmPurchase({ lines: [{ productId: p.id, qty: 1, cost: 1, unit: "Kg" }], pay: credit(1), supplierId: sup.id, updateCost: false })).toThrow(/can't be converted/);
  });

  it("a shop's own Quantity unit is counted whole, and a rename follows its products", () => {
    const sack = catalog.saveUnit({ name: "Sack", abbr: "sk", type: "quantity" });
    const p = erp.addProduct({ name: "Rice", buy: 1, sell: 2, qty: 5, unit: "Sack" });
    expect(() => erp.stockOut(p.id, 0.5, "x")).toThrow(/whole Sack/);
    catalog.saveUnit({ id: sack.id, name: "Bag50", abbr: "sk", type: "quantity" });
    expect(erp.load().products[0]?.unit).toBe("Bag50");
    catalog.setUnitActive(sack.id, false);
    expect(catalog.unitNames(erp.load())).not.toContain("Bag50");
    expect(catalog.unitNames(erp.load(), "Bag50")).toContain("Bag50"); // a product keeps its unit
  });
});

describe("categories, brands and attributes", () => {
  it("a used category can only be deactivated, and leaves the product form's choices", () => {
    const c = catalog.saveCatalogItem("categories", { name: "Drinks", description: "Cold", icon: "basket" });
    expect(() => catalog.saveCatalogItem("categories", { name: " drinks " })).toThrow(/Already exists/);
    erp.addProduct({ name: "Soda", buy: 1, sell: 2, qty: 0, categoryId: c.id });
    expect(() => erp.removeNamed("categories", c.id)).toThrow(/Deactivate it instead/);
    catalog.setCatalogActive("categories", c.id, false);
    expect(catalog.activeCatalog(erp.load(), "categories")).toHaveLength(0);
    expect(catalog.activeCatalog(erp.load(), "categories", c.id)).toHaveLength(1);
    expect(erp.load().products[0]?.categoryId).toBe(c.id);
  });

  it("attributes refuse duplicates and keep values and attributes that products use", () => {
    const a = catalog.saveAttribute({ name: "Size", values: [{ name: "S" }, { name: "M" }] });
    expect(() => catalog.saveAttribute({ name: "size", values: [{ name: "L" }] })).toThrow(/Already exists/);
    expect(() => catalog.saveAttribute({ name: "Colour", values: [{ name: "Red" }, { name: " red " }] })).toThrow(/listed twice/);
    expect(() => catalog.saveAttribute({ name: "Colour", values: [] })).toThrow(/at least one/);
    const s = a.values[0]!, p = erp.addProduct({ name: "Shirt", buy: 1, sell: 2, qty: 0, attributes: { [a.id]: [s.id] } });
    expect(catalog.attributeText(erp.load(), erp.load().products[0]!)).toBe("Size: S");
    expect(() => catalog.saveAttribute({ id: a.id, name: "Size", values: [a.values[1]!] })).toThrow(/S is used by products/);
    expect(() => catalog.deleteAttribute(a.id)).toThrow(/Deactivate it instead/);
    erp.updateProduct(p.id, { attributes: undefined });
    catalog.deleteAttribute(a.id);
    expect(erp.load().attributes).toHaveLength(0);
  });
});

describe("Product Setup screen", () => {
  it("Add Category validates, saves, and shows up in the search", () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Add Category" }));
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));
    expect(errors()).toContain("Enter a category name");
    type(/Category Name/, "Cereals");
    fireEvent.click(screen.getByRole("button", { name: "Save Category" }));
    expect(erp.load().categories[0]?.name).toBe("Cereals");
    expect(screen.queryByRole("button", { name: "Save Category" })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Search category" }), { target: { value: "cer" } });
    fireEvent.click(screen.getByRole("button", { name: /Cereals/ }));
    expect(screen.getByRole("button", { name: "Edit Cereals" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Search category" }), { target: { value: "zzz" } });
    expect(screen.getByText("No matching category")).toBeTruthy();
  });

  it("Manage Brands edits, deactivates and refuses to delete a used brand", () => {
    const b = catalog.saveCatalogItem("brands", { name: "Acme" });
    erp.addProduct({ name: "Pen", buy: 1, sell: 2, qty: 0, brandId: b.id });
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Manage Brands" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Acme" }));
    expect(errors()[0]).toMatch(/used by 1/);
    expect(erp.load().brands).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate Acme" }));
    expect(erp.load().brands[0]?.active).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Edit Acme" }));
    type(/Brand Name/, "Acme Ltd");
    fireEvent.click(screen.getByRole("button", { name: "Save Brand" }));
    expect(erp.load().brands[0]).toMatchObject({ name: "Acme Ltd", active: false });
  });

  it("Add Unit needs every field, and a conversion shows in Manage Units", () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Add Unit" }));
    type(/Unit Name/, "Dozen");
    fireEvent.click(screen.getByRole("button", { name: "Save Unit" }));
    expect(errors()).toContain("Choose a unit type");
    type(/Abbreviation/, "dz");
    type(/Unit Type/, "quantity");
    type(/Converts to/, "unit-piece");
    type(/How many/, "12");
    fireEvent.click(screen.getByRole("button", { name: "Save Unit" }));
    expect(catalog.conversionFactor(erp.load(), "Dozen", "Piece")).toBe(12);
    fireEvent.click(screen.getByRole("button", { name: "Dozen" }));
    expect(screen.getByText(/1 Dozen = 12 Piece/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Manage Units" }));
    const panel = screen.getByRole("dialog", { name: "Manage Units" });
    expect(within(panel).getByText("1 Dozen = 12 Piece")).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Edit Piece" })).toBeTruthy();
  });

  it("an example fills Add Attribute, and a value still being typed is saved too", () => {
    render(<Screen />);
    fireEvent.click(screen.getByRole("button", { name: "Add Size" }));
    fireEvent.change(screen.getByRole("textbox", { name: "New values" }), { target: { value: "XXL, 3XL" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Attribute" }));
    expect(erp.load().attributes[0]?.values.map((v) => v.name)).toEqual(["S", "M", "L", "XL", "XXL", "3XL"]);
    expect(screen.getByRole("button", { name: "Edit Size" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Size" })).toBeNull();
  });
});
