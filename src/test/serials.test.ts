import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { addSerials, findSerial, parseSerials, removeSerial, serialsInStock } from "@/lib/serials";
import { addScannedSerial, missingSerials } from "@/components/shopbook/serial-chooser";
import { currentFeatures, defaultFeatures, saveFeatures } from "@/lib/trade-features";

const phone: erp.Product = { id: "a15", name: "Samsung A15", unit: "pcs", qty: 3, sell: 18000, buy: 15000, createdAt: 1, serialTracked: true, warrantyMonths: 12 };
const cover: erp.Product = { id: "cover", name: "Phone cover", unit: "pcs", qty: 20, sell: 300, buy: 150, createdAt: 1 };
const cash = (n: number): erp.PayRecord => ({ cash: n, mpesa: 0, bank: 0, credit: 0 });
const sell = (cart: erp.CartLine[], total: number) => erp.confirmSale({ cart, discount: 0, pay: cash(total), channel: "POS", vatRate: 0 });
const product = () => erp.load().products.find((p) => p.id === "a15")!;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru Phones", email: "k@example.com", currency: "KES", password: "x", plan: "business", trialStart: Date.now(), businessId: "biz-1" }));
  localStorage.setItem("shopbook.session", "1");
  localStorage.setItem("shopbook.erp", JSON.stringify({ products: [phone, cover] }));
  addSerials("a15", ["356938035643801", "356938035643802", "356938035643803"]);
});

describe("adding serials", () => {
  it("reads one per line, commas or a pasted column, without repeats", () => {
    expect(parseSerials("111\n222, 333;444\t555\n111\n  ")).toEqual(["111", "222", "333", "444", "555"]);
  });
  it("never records one serial twice, even on another product", () => {
    expect(() => addSerials("cover", ["356938035643801"])).toThrow(/already recorded/);
    const r = addSerials("a15", ["356938035643801", "356938035643804"]);
    expect(r).toEqual({ added: ["356938035643804"], skipped: ["356938035643801"] });
  });
});

describe("selling a tracked product", () => {
  it("is refused until a serial is chosen for every unit", () => {
    expect(() => sell([{ productId: "a15", qty: 1 }], 18000)).toThrow(/Choose 1 serial/);
    expect(() => sell([{ productId: "a15", qty: 2, serials: ["356938035643801"] }], 36000)).toThrow(/Choose 2 serial/);
  });
  it("refuses a serial that isn't this product's, or one chosen twice", () => {
    expect(() => sell([{ productId: "a15", qty: 1, serials: ["999"] }], 18000)).toThrow(/not a serial/);
    expect(() => sell([{ productId: "a15", qty: 2, serials: ["356938035643801", "356938035643801"] }], 36000)).toThrow(/chosen twice/);
  });
  it("marks the serials sold, saves them with the warranty end, and never sells one twice", () => {
    const sale = sell([{ productId: "a15", qty: 1, serials: ["3569 3803 5643 801"] }, { productId: "cover", qty: 1 }], 18300);
    const line = sale.items.find((i) => i.productId === "a15")!;
    expect(line.serials).toEqual(["356938035643801"]);
    expect(line.warrantyUntil).toBe(erp.warrantyEnd(sale.at, 12));
    expect(sale.items.find((i) => i.productId === "cover")?.serials).toBeUndefined();
    expect(serialsInStock(product()).map((u) => u.code)).toEqual(["356938035643802", "356938035643803"]);
    expect(() => sell([{ productId: "a15", qty: 1, serials: ["356938035643801"] }], 18000)).toThrow(/already sold/);
    const found = findSerial(erp.load(), "356938035643801");
    expect(found?.sale?.ref).toBe(sale.ref);
    expect(found?.warrantyUntil).toBe(line.warrantyUntil);
  });
  it("puts a returned unit's serial back in stock", () => {
    const sale = sell([{ productId: "a15", qty: 2, serials: ["356938035643801", "356938035643802"] }], 36000);
    erp.returnSale(sale.id, [{ productId: "a15", qty: 1 }], "cash");
    expect(serialsInStock(product()).map((u) => u.code).sort()).toEqual(["356938035643802", "356938035643803"]);
    expect(erp.load().returns[0]?.items[0]?.serials).toEqual(["356938035643802"]);
  });
  it("keeps a sold serial on record", () => {
    sell([{ productId: "a15", qty: 1, serials: ["356938035643801"] }], 18000);
    expect(() => removeSerial("a15", "356938035643801")).toThrow(/stays on record/);
    removeSerial("a15", "356938035643803");
    expect(product().serials?.map((u) => u.code)).toEqual(["356938035643801", "356938035643802"]);
  });
});

describe("finding and scanning", () => {
  it("product search and barcode lookup find a phone by its IMEI", () => {
    expect(erp.searchProducts(erp.load(), "356938035643802").map((p) => p.id)).toEqual(["a15"]);
    expect(erp.findByCode(erp.load(), "356938035643802")?.id).toBe("a15");
  });
  it("scanning an IMEI adds the phone with that serial chosen", () => {
    const s = erp.load();
    const once = addScannedSerial(s, [], "356938035643802")!;
    expect(once.cart).toEqual([{ productId: "a15", qty: 1, serials: ["356938035643802"] }]);
    const twice = addScannedSerial(s, once.cart, "356938035643803")!;
    expect(twice.cart).toEqual([{ productId: "a15", qty: 2, serials: ["356938035643802", "356938035643803"] }]);
    expect(addScannedSerial(s, twice.cart, "356938035643803")!.cart).toBe(twice.cart);
    expect(addScannedSerial(s, [], "not-a-serial")).toBeNull();
  });
  it("counts how many serials a line still needs", () => {
    expect(missingSerials(product(), { productId: "a15", qty: 3, serials: ["356938035643801"] })).toBe(2);
    expect(missingSerials(cover, { productId: "cover", qty: 3 })).toBe(0);
  });
});

describe("the feature switch", () => {
  it("starts on for phone, electronics and jewellery shops", () => {
    expect(defaultFeatures(["Mobile Phones & Accessories"]).serials).toBe(true);
    expect(defaultFeatures(["Butchery"]).serials).toBe(false);
    saveFeatures({ serials: true });
    expect(currentFeatures(["Butchery"]).serials).toBe(true);
  });
});
