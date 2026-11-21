// Drives the real Inventory screen (router mocked) and checks each workflow's effect on the saved ERP records.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import * as erp from "@/lib/erp";
import { saveLocation } from "@/lib/locations";

const navigate = vi.hoisted(() => () => {});
// The URL search a Dashboard link would carry (?menu=…&sub=…&filter=…); empty for a plain visit.
const link = vi.hoisted(() => ({ search: {} as Record<string, string> }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Record<string, unknown>) => ({ options, useSearch: () => link.search }),
  useNavigate: () => navigate, // stable like the real hook; a new fn per render loops the account effect
  Link: ({ children }: { children: unknown }) => children,
}));
vi.mock("@/components/shopbook/business-assistant", () => ({ ShopBotLauncher: () => null }));
vi.mock("@/components/shopbook/connection-status", () => ({ ConnectionStatus: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { Route } = await import("@/routes/inventory");
const { toast } = await import("sonner");
const Inventory = (Route as unknown as { options: { component: () => ReactElement } }).options.component;

const account = { shopName: "Test Shop", email: "t@example.com", currency: "KES", password: "x", plan: "trial", trialStart: Date.now() };
beforeEach(() => {
  link.search = {};
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify(account));
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.success).mockClear();
});

const open = async (menu: RegExp, sub?: RegExp) => {
  render(<Inventory />);
  fireEvent.click(await screen.findByRole("tab", { name: menu }));
  if (sub) fireEvent.click(screen.queryByRole("tab", { name: sub }) ?? screen.getByRole("button", { name: sub })); // Add Product opens from All Products' button
};
// Labels pass through translation, which can change their case ("Product name").
const field = (label: RegExp) => screen.getByLabelText(new RegExp(label.source, "i"), { selector: "input,select" }) as HTMLInputElement;
const pick = (name: string) => {
  fireEvent.focus(screen.getByPlaceholderText(/Select, search or scan product/));
  const dialog = screen.queryByRole("dialog");
  fireEvent.click((dialog ? within(dialog) : screen).getByRole("button", { name: new RegExp(name) }));
};
const errors = () => vi.mocked(toast.error).mock.calls.map((c) => c[0]);

describe("Inventory screen", () => {
  it("Add Product saves through the engine and blocks a duplicate barcode", async () => {
    erp.addProduct({ name: "Existing", buy: 1, sell: 2, qty: 1, barcode: "111" });
    await open(/Products & Stock/, /Add Product/);
    fireEvent.change(field(/Product Name/), { target: { value: "Tea" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Barcode" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Barcode" }), { target: { value: "111" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Product/ }));
    expect(errors()).toContain("Barcode already used by another product");
    expect(erp.load().products).toHaveLength(1);
  });

  it("Add Product leaves unspecified category, brand, SKU and barcode blank", async () => {
    await open(/Products & Stock/, /Add Product/);
    expect(screen.queryByLabelText(/Minimum Stock/i)).toBeNull();
    expect(screen.queryByLabelText(/Reorder Level/i)).toBeNull();
    fireEvent.change(field(/Product Name/), { target: { value: "Salt" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Product/ }));
    const p = erp.load().products[0];
    expect(p?.minStock).toBeUndefined();
    expect(p?.categoryId).toBeUndefined();
    expect(p?.brandId).toBeUndefined();
    expect(p?.sku).toBeUndefined();
    expect(p?.barcode).toBeUndefined();
    expect(erp.stockStatus({ ...p!, qty: erp.DEFAULT_MIN_STOCK })).toBe("LOW");
  });

  it("ticking Category searches existing ones, and picking one saves it", async () => {
    erp.addNamed("categories", "Groceries");
    erp.addNamed("categories", "Hardware");
    await open(/Products & Stock/, /Add Product/);
    expect(screen.queryByRole("textbox", { name: /Search category/ })).toBeNull(); // nothing until ticked
    fireEvent.change(field(/Product Name/), { target: { value: "Rice" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Category" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Search category/ }), { target: { value: "gro" } });
    expect(screen.queryByRole("button", { name: "Hardware" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Groceries" }));
    fireEvent.click(screen.getByRole("button", { name: /Save Product/ }));
    const s = erp.load();
    expect(s.products[0]?.categoryId).toBe(s.categories.find((c) => c.name === "Groceries")?.id);
  });

  it("an unknown category sends you to register it, and you return with your form and the new category", async () => {
    await open(/Products & Stock/, /Add Product/);
    fireEvent.change(field(/Product Name/), { target: { value: "Rice" } });
    fireEvent.change(field(/Buying Price/), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Category" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Search category/ }), { target: { value: "Cereals" } });
    expect(screen.getByText(/is not registered yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Register category "Cereals"/ }));
    expect(screen.getByText(/Register the new category here/)).toBeTruthy();
    expect(erp.load().categories).toHaveLength(0); // nothing is created until it's registered
    fireEvent.click(screen.getByRole("button", { name: /Save Category/ }));
    const made = erp.load().categories.find((c) => c.name === "Cereals");
    expect(made).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Add Product/ })).toBeNull();
    expect(field(/Product Name/).value).toBe("Rice");
    expect(field(/Buying Price/).value).toBe("120");
    fireEvent.click(screen.getByRole("button", { name: /Save Product/ }));
    expect(erp.load().products[0]).toMatchObject({ name: "Rice", buy: 120, categoryId: made?.id });
  });

  it("unticking a detail removes it from what gets saved", async () => {
    erp.addNamed("brands", "Acme");
    await open(/Products & Stock/, /Add Product/);
    fireEvent.change(field(/Product Name/), { target: { value: "Pen" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Brand" }));
    fireEvent.click(screen.getByRole("button", { name: "Acme" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Brand" }));
    fireEvent.click(screen.getByRole("button", { name: /Save Product/ }));
    expect(erp.load().products[0]?.brandId).toBeUndefined();
  });

  it("Add Product saves every field, and Save & Add Another leaves a clean form for the next one", async () => {
    await open(/Products & Stock/, /Add Product/);
    fireEvent.change(field(/Product Name/), { target: { value: "Tea" } });
    fireEvent.change(field(/Pieces/), { target: { value: "24" } });
    fireEvent.change(field(/Opening Stock/), { target: { value: "6" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Description/ }), { target: { value: "Green tea" } });
    fireEvent.click(screen.getByRole("button", { name: /Save & Add Another/ }));
    expect(erp.load().products[0]).toMatchObject({ name: "Tea", pieces: 24, qty: 6, description: "Green tea" });
    expect(erp.load().products[0]?.image).toBeUndefined(); // no picture is ever made up
    expect((field(/Product Name/) as HTMLInputElement).value).toBe("");
    // The form is empty, so clicking again can't create a second product
    fireEvent.click(screen.getByRole("button", { name: /Save Product/ }));
    expect(erp.load().products).toHaveLength(1);
  });

  it("opens stock workflows as translucent glass pages over All Products", async () => {
    erp.addProduct({ name: "Rice", buy: 100, sell: 150, qty: 2, unit: "Kg" });
    await open(/Products & Stock/, /Stock In/);
    const dialog = screen.getByRole("dialog", { name: /Stock In/ });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector(".inventory-content .pw-list")).not.toBeNull();
    expect(document.querySelector(".glass-page")).not.toBeNull();
    fireEvent.click(document.querySelector(".glass-overlay")!);
    expect(screen.queryByRole("dialog", { name: /Stock In/ })).toBeNull();
    expect(screen.getByRole("tab", { name: /All Products/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("Stock In records an inter-shop origin, optional batch, and automatic reference", async () => {
    const p = erp.addProduct({ name: "Rice", buy: 100, sell: 150, qty: 2, unit: "Kg" });
    localStorage.setItem("shopbook.settings", JSON.stringify({ branches: [{ name: "West Shop", location: "" }, { name: "Central Store", location: "" }] }));
    await open(/Products & Stock/, /Stock In/);
    expect(screen.queryByLabelText(/Supplier|Vendor/i)).toBeNull();
    expect(screen.queryByLabelText(/Invoice Number|Notes/i)).toBeNull();
    pick("Rice");
    expect(field(/Moved From/).querySelectorAll("option")).toHaveLength(5); // placeholder, main shop, two branches, plus Other
    fireEvent.change(field(/Quantity Received/), { target: { value: "3" } });
    fireEvent.change(field(/Cost Price/), { target: { value: "110" } });
    fireEvent.change(field(/Moved From/), { target: { value: "West Shop" } });
    fireEvent.change(field(/Batch \/ Lot Number/), { target: { value: "LOT-7" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Stock In/ }));
    expect(erp.load().products.find((x) => x.id === p.id)).toMatchObject({ qty: 5, buy: 110 });
    const move = erp.load().movements.find((m) => m.productId === p.id && m.type === "STOCK IN");
    expect(move?.source).toBe("SI-000001");
    expect(move?.reason).toContain("Moved from: West Shop");
    expect(move?.reason).toContain("Batch: LOT-7");
    expect(screen.getByDisplayValue("SI-000001")).toBeTruthy();
  });

  it("Warehouse Stock lists what a warehouse holds and offers no way to change it; Stock In can receive into it", async () => {
    const depot = saveLocation({ name: "Depot", type: "warehouse" });
    const p = erp.addProduct({ name: "Rice", buy: 100, sell: 150, qty: 2, unit: "Kg" });
    saveLocation({ name: "Town", type: "shop", connected: [depot.id] });
    erp.stockIn(p.id, 7, "Bulk", undefined, depot.id);
    const before = JSON.stringify(erp.load());
    await open(/Returns & Transfers/, /Warehouse Stock/);
    const text = document.body.textContent ?? "";
    for (const shown of ["Depot", "Rice", "7 Kg", "Town"]) expect(text).toContain(shown);
    expect(JSON.stringify(erp.load())).toBe(before);
    cleanup();
    await open(/Products & Stock/, /Stock In/);
    pick("Rice");
    fireEvent.change(field(/Quantity Received/), { target: { value: "3" } });
    fireEvent.change(field(/Moved From/), { target: { value: "Test Shop" } });
    fireEvent.change(field(/Receive Into/), { target: { value: depot.id } });
    fireEvent.click(screen.getByRole("button", { name: /Save Stock In/ }));
    expect(erp.heldAt(erp.load(), p.id, depot.id)).toBe(10);
  });

  it("Stock History filters match the real movement types", async () => {
    const p = erp.addProduct({ name: "Pen", buy: 1, sell: 2, qty: 5 });
    erp.stockIn(p.id, 2, "Restock");
    erp.stockOut(p.id, 1, "Damaged");
    erp.adjustStock(p.id, 5, "Count");
    await open(/Products & Stock/, /Stock History/);
    const count = () => /(\d+)\s*entries/i.exec(document.body.textContent ?? "")?.[1];
    expect(count()).toBe("4");
    for (const [chip, n] of [["IN", 2], ["OUT", 1], ["ADJUST", 1], ["SALE", 0]] as const) {
      fireEvent.click(screen.getByRole("button", { name: chip }));
      expect(count()).toBe(String(n));
    }
  });

  it("a new transfer uses configured shop choices and can be cancelled from Transfer History", async () => {
    const p = erp.addProduct({ name: "Chair", buy: 1, sell: 2, qty: 5 });
    localStorage.setItem("shopbook.settings", JSON.stringify({ branches: [{ name: "East Branch", location: "" }, { name: "Central Store", location: "" }] }));
    await open(/Returns & Transfers/, /New Transfer/);
    expect(field(/From Location/).value).toBe("Test Shop");
    expect(field(/To Location/).querySelectorAll("option")).toHaveLength(3); // placeholder plus two other locations
    fireEvent.change(field(/To Location/), { target: { value: "East Branch" } });
    pick("Chair");
    fireEvent.change(field(/^Quantity/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(erp.load().transfers[0]).toMatchObject({ status: "SENT", from: "Test Shop", to: "East Branch" });
    expect(erp.load().products.find((x) => x.id === p.id)?.qty).toBe(3);

    fireEvent.click(screen.getByRole("tab", { name: /Transfer History/ }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/ }));
    expect(erp.load().transfers[0]?.status).toBe("CANCELLED");
    expect(erp.load().products.find((x) => x.id === p.id)?.qty).toBe(5);
  });

  it("receiving an inter-shop transfer restores it to the combined stock total", async () => {
    const p = erp.addProduct({ name: "Oil", buy: 10, sell: 15, qty: 5 });
    localStorage.setItem("shopbook.settings", JSON.stringify({ branches: [{ name: "North Shop", location: "" }] }));
    await open(/Returns & Transfers/, /New Transfer/);
    fireEvent.change(field(/To Location/), { target: { value: "North Shop" } });
    pick("Oil");
    fireEvent.change(field(/^Quantity/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(erp.load().products.find((x) => x.id === p.id)?.qty).toBe(3);
    fireEvent.click(screen.getByRole("tab", { name: /Transfer History/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Receive$/ }));
    expect(erp.load().products.find((x) => x.id === p.id)?.qty).toBe(5);
    expect(erp.load().movements.find((m) => m.type === "TRANSFER IN")?.reason).toBe("From Test Shop");
  });

  it("a customer return against a recorded sale refunds and updates the sale; Reject leaves stock alone", async () => {
    const p = erp.addProduct({ name: "Kettle", buy: 500, sell: 1000, qty: 5 });
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: { cash: 2000, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" });
    await open(/Returns & Transfers/, /Customer Returns/);
    fireEvent.change(field(/Receipt Ref No/), { target: { value: sale.ref.toLowerCase() } });
    pick("Kettle");
    expect(screen.getByText(/Linked to sale/)).toBeTruthy();
    fireEvent.change(field(/Quantity Returned/), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    let s = erp.load();
    expect(s.products[0]?.qty).toBe(4);
    expect(s.sales[0]?.items[0]?.returned).toBe(1);
    expect(s.payments.find((x) => x.kind === "REFUND")?.amount).toBe(-1000);

    fireEvent.change(field(/Receipt Ref No/), { target: { value: sale.ref } });
    pick("Kettle");
    fireEvent.change(field(/Quantity Returned/), { target: { value: "1" } });
    fireEvent.change(field(/Resolution/), { target: { value: "Reject" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    s = erp.load();
    expect(s.products[0]?.qty).toBe(4);
    expect(s.audit[0]?.action).toBe("RETURN REJECTED");
  });

  it("the product name opens read-only details; the pen opens the edit page", async () => {
    erp.addProduct({ name: "Lamp", buy: 300, sell: 600, qty: 2, sku: "LAMP-1", description: "Desk lamp" });
    await open(/Products & Stock/, /All Products/);
    fireEvent.click(screen.getByRole("button", { name: "Lamp" }));
    expect(screen.getByRole("heading", { name: /Product Details/ })).toBeTruthy();
    expect(screen.getByText("Desk lamp")).toBeTruthy();
    expect(document.querySelectorAll(".pw-page input, .pw-page select, .pw-page textarea")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit Lamp" }));
    expect(screen.getByRole("heading", { name: "Edit Product" })).toBeTruthy();
    // The list stays behind the panel, so look inside the panel.
    const panel = within(screen.getByRole("dialog"));
    expect((panel.getByLabelText(/SKU/) as HTMLInputElement).value).toBe("LAMP-1");
    fireEvent.change(panel.getByLabelText(/Selling Price/i), { target: { value: "650" } });
    fireEvent.change(panel.getByLabelText(/Pieces/i), { target: { value: "12" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save Changes" })));
    expect(erp.load().products[0]).toMatchObject({ sell: 650, pieces: 12, qty: 2 });
    expect(screen.getByRole("button", { name: "Edit Lamp" })).toBeTruthy(); // back on the list
  });

  it("delete warns once and needs nothing typed; stock is written off, history is kept, and it is audited", async () => {
    erp.addProduct({ name: "Stocked", buy: 10, sell: 20, qty: 2 });
    const used = erp.addProduct({ name: "Used", buy: 1, sell: 2, qty: 1 });
    erp.stockOut(used.id, 1, "Damaged");
    erp.addProduct({ name: "Clean", buy: 1, sell: 2, qty: 0 });
    await open(/Products & Stock/, /All Products/);
    const confirmDelete = async (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: `Edit ${name}` }));
      fireEvent.click(screen.getByRole("button", { name: /Delete Product/ }));
      const box = await screen.findByRole("alertdialog");
      expect(box.textContent).toMatch(/You are about to delete a product/);
      expect(box.querySelector("select, textarea, input")).toBeNull();
      expect(erp.load().products.some((p) => p.name === name && !p.archived)).toBe(true); // the first click only warns
      await act(async () => fireEvent.click(within(box).getByRole("button", { name: "Delete" })));
    };

    await confirmDelete("Stocked");
    const stocked = erp.load().products.find((p) => p.name === "Stocked");
    expect(stocked).toMatchObject({ archived: true, qty: 0 });
    expect(erp.load().movements.find((m) => m.productId === stocked?.id && m.type === "STOCK OUT")).toMatchObject({ qty: -2, reason: "Product deleted" });

    await confirmDelete("Used");
    expect(erp.load().products.find((p) => p.name === "Used")?.archived).toBe(true);
    expect(erp.load().audit.find((x) => x.action === "PRODUCT ARCHIVED")?.detail).toContain("Used");
    expect(screen.queryByRole("button", { name: "Used" })).toBeNull();

    await confirmDelete("Clean");
    expect(erp.load().products.some((p) => p.name === "Clean")).toBe(false);
    expect(erp.load().audit.find((x) => x.action === "PRODUCT DELETED")?.detail).toContain("Clean");
  });

  it("only an admin sees Delete, and the engine refuses anyone else", async () => {
    const p = erp.addProduct({ name: "Tea", buy: 1, sell: 2, qty: 0 });
    localStorage.setItem("shopbook.account", JSON.stringify({ ...account, role: "staff" }));
    await open(/Products & Stock/, /All Products/);
    fireEvent.click(screen.getByRole("button", { name: "Edit Tea" }));
    expect(screen.queryByRole("button", { name: /Delete Product/ })).toBeNull();
    expect(screen.getByText(/Only an admin can delete products/)).toBeTruthy();
    expect(() => erp.removeProduct(p.id)).toThrow(/Only an admin/);
    expect(erp.load().products).toHaveLength(1);
  });

  it("shows every product in one scrollable list without status or pagination, while search still works", async () => {
    for (let i = 1; i <= 18; i++) erp.addProduct({ name: `Item ${String(i).padStart(2, "0")}`, buy: i, sell: i * 2, qty: 10, sku: `SK-${i}`, barcode: `99${i}` });
    await open(/Products & Stock/, /All Products/);
    expect(screen.getByText(/Showing 1–18 of 18/)).toBeTruthy();
    const toolbarButtons = Array.from(document.querySelectorAll(".pw-toolbar button")).map((button) => button.getAttribute("aria-label"));
    expect(toolbarButtons).toEqual(["Scan barcode", "Add Product", "Import", "Share"]);
    expect(screen.getByText("Barcode: 991")).toBeTruthy();
    expect(document.querySelectorAll(".pw-table-scroll .pw-table tbody tr")).toHaveLength(18);
    expect(document.querySelectorAll(".pw-c-action button")).toHaveLength(18);
    expect(document.querySelectorAll(".pw-table .pw-c-status, .pw-table .pw-status")).toHaveLength(0);
    expect(screen.queryByRole("columnheader", { name: /Status/i })).toBeNull();
    expect(screen.queryByRole("combobox", { name: /Status/i })).toBeNull();
    const headings = Array.from(document.querySelectorAll(".pw-table thead th")).map((cell) => cell.textContent?.trim() ?? "");
    expect(headings.indexOf("Category")).toBe(headings.indexOf("Brand") - 1);
    expect(screen.queryByRole("combobox", { name: "Category" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Next page|Previous page/i })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    const shareDialog = screen.getByRole("dialog", { name: "Share Products" });
    expect(within(shareDialog).getByRole("radio", { name: "PDF" })).toBeTruthy();
    fireEvent.click(within(shareDialog).getByRole("button", { name: "Cancel" }));
    fireEvent.change(screen.getByPlaceholderText(/Search product by name/), { target: { value: "SK-7" } });
    expect(screen.getByText(/Showing 1–1 of 1/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Item 07" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    fireEvent.change(screen.getByPlaceholderText(/Search product by name/), { target: { value: "9912" } });
    expect(screen.getByRole("button", { name: "Item 12" })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Search product by name/), { target: { value: "nothing here" } });
    expect(screen.getByText(/No product matches/)).toBeTruthy();
  });

  it("the Dashboard's Low Stock link opens All Products showing only low and out-of-stock items", async () => {
    erp.addProduct({ name: "Plenty", buy: 1, sell: 2, qty: 50 });
    erp.addProduct({ name: "Few", buy: 1, sell: 2, qty: 2 });
    erp.addProduct({ name: "None", buy: 1, sell: 2, qty: 0 });
    link.search = { menu: "products & stock", sub: "All Products", filter: "ATTENTION" };
    render(<Inventory />);
    expect(await screen.findByText("Few")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
    expect(screen.queryByText("Plenty")).toBeNull();
    expect(screen.getByRole("tab", { name: /All Products/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("keeps the overview action-light and orders its header module before the shop", async () => {
    await open(/Overview/);
    const overview = document.querySelector(".app-overview");
    expect(overview).not.toBeNull();
    const overviewUi = within(overview as HTMLElement);
    for (const name of [/^Stock In$/i, /^Stock Out$/i, /^Replenishment$/i, /^Restock$/i]) {
      expect(overviewUi.queryByRole("button", { name })).toBeNull();
    }

    const title = document.querySelector(".inventory-screen .dash-header-title");
    const titleText = title?.textContent || "";
    expect(titleText.indexOf("Inventory")).toBeGreaterThanOrEqual(0);
    expect(titleText.indexOf("TEST SHOP")).toBeGreaterThan(titleText.indexOf("Inventory"));
    expect(title?.querySelector(".app-header-title-divider")).not.toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: /Products & Stock/i }));
    expect(await screen.findByRole("tab", { name: /All Products/i })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: /Add Product/i })).toBeNull();
    expect(screen.getByRole("tab", { name: /Stock In/i })).toBeTruthy();
  });

  it("an unknown link target falls back to the usual Overview", async () => {
    link.search = { menu: "nonsense", sub: "x", filter: "DROP" };
    render(<Inventory />);
    expect((await screen.findByRole("tab", { name: /Overview/ })).getAttribute("aria-selected")).toBe("true");
  });
});
