import { describe, expect, it } from "vitest";
import { code128, eanCheck, newBarcode } from "@/lib/day-tools";
import { _forTests, qrMatrix } from "@/lib/qr";

describe("QR codes", () => {
  it("computes the Reed-Solomon codes of the standard's worked example (HELLO WORLD, 1-M)", () => {
    const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
    expect(_forTests.rsRemainder(data, _forTests.rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
  it("draws finder patterns and a size that fits the text", () => {
    const m = qrMatrix("https://example.com/shop/kifaru-shop");
    expect(m.length).toBe(29); // 36 characters fit version 3 at level M
    const finder = (x: number, y: number) => [0, 1, 2, 3, 4, 5, 6].map((dy) => [0, 1, 2, 3, 4, 5, 6].map((dx) => (m[y + dy]![x + dx] ? 1 : 0)).join("")).join("/");
    const want = "1111111/1000001/1011101/1011101/1011101/1000001/1111111";
    expect(finder(0, 0)).toBe(want); expect(finder(m.length - 7, 0)).toBe(want); expect(finder(0, m.length - 7)).toBe(want);
    expect(m[m.length - 8]![8]).toBe(true); // the dark module
  });
  it("refuses text too long for version 10", () => { expect(() => qrMatrix("x".repeat(400))).toThrow(); });
});

describe("barcodes", () => {
  it("gives the EAN-13 check digit", () => { expect(eanCheck("400638133393")).toBe("1"); });
  it("makes unused in-store EAN-13 codes starting 20", () => {
    const code = newBarcode({ products: [] }, 12345);
    expect(code).toMatch(/^20\d{11}$/);
    expect(eanCheck(code.slice(0, 12))).toBe(code[12]);
    expect(newBarcode({ products: [{ barcode: code }] as never }, 12345)).not.toBe(code);
  });
  it("draws Code 128 B with start, check and stop symbols", () => {
    const bars = code128("AB12");
    expect(bars.reduce((a, [, w]) => a + w, 0)).toBe(11 * (4 + 2) + 13);
    expect(bars.slice(0, 6).map(([, w]) => w).join("")).toBe("211214");
    expect(bars.slice(-7).map(([, w]) => w).join("")).toBe("2331112");
  });
});
