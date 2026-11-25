// Numbering carries on from the old system after an import (owner, 2026-11-25): last sale C003840 -> next sale C003841.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { applyTX, previewTX, suggestTX, type TXOptions } from "@/lib/transaction-import";
import type { Sheet } from "@/lib/opening-import";

const csv = (t: string): Sheet => { const [h, ...r] = t.trim().split("\n").map((l) => l.split(",")); return { file: "t.csv", sheet: "Sheet1", columns: h!, rows: r.map((x) => Object.fromEntries(h!.map((c, i) => [c, x[i] ?? ""]))) }; };
const o: TXOptions = { stock: "record", createProducts: true, dateFmt: "DMY" };
const H = "Type,Receipt No,Date,Customer/Supplier,Phone,Product,Qty,Unit Price,Discount,Total,Cash,M-Pesa,Bank";
const run = (rows: string) => { const s = csv(`${H}\n${rows}`); return applyTX(previewTX(erp.load(), [{ sheet: s, mapping: suggestTX(s.columns) }], o), o); };
const sellOne = () => { const p = erp.load().products[0]!; return erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: { cash: p.sell, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" }); };

describe("continuing numbering from an import", () => {
  beforeEach(() => { localStorage.clear(); erp.addProduct({ name: "Sugar", buy: 50, sell: 100, qty: 50 } as never); });
  it("the next sale follows the last imported one", () => {
    const r = run("Sale,C003839,01/01/2026,,,Sugar,1,100,0,100,100,,\nSale,C003840,02/01/2026,,,Sugar,1,100,0,100,100,,\nSale,C003838,03/01/2026,,,Sugar,1,100,0,100,100,,");
    expect(r.continued.SALE).toBe("C003840");
    expect(sellOne().ref).toBe("C003841");
    expect(sellOne().ref).toBe("C003842");
  });
  it("keeps the business's own numbering once it has made sales itself", () => {
    run("Sale,R-10,01/01/2026,,,Sugar,1,100,0,100,100,,");
    expect(sellOne().ref).toBe("R-11");
    const r = run("Sale,X900,02/01/2026,,,Sugar,1,100,0,100,100,,");
    expect(r.continued.SALE).toBeUndefined();
    expect(sellOne().ref).toBe("R-12");
  });
  it("never goes backwards and leaves other documents alone", () => {
    run("Sale,INV-0050,01/01/2026,,,Sugar,1,100,0,100,100,,");
    expect(erp.refFormat(erp.load().seq, "S")).toEqual({ prefix: "INV-", width: 4 });
    expect(erp.refFormat(erp.load().seq, "PO")).toBeNull();
    expect(sellOne().ref).toBe("INV-0051");
  });
});
