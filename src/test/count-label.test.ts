import { describe, expect, it } from "vitest";
import { countLabel, saveUnit } from "../lib/catalog";
import { empty, load } from "../lib/erp";

describe("countLabel", () => {
  const s = empty();

  it("says pc or pcs for every spelling of the Piece unit", () => {
    for (const unit of ["pcs", "Piece", "pieces", "pc", "PCS", undefined]) {
      expect(countLabel(s, 0, unit)).toBe("0 pcs");
      expect(countLabel(s, 1, unit)).toBe("1 pc");
      expect(countLabel(s, 2, unit)).toBe("2 pcs");
    }
  });

  it("leaves other units, and the quantity, exactly as saved", () => {
    expect(countLabel(s, 1, "kg")).toBe("1 kg");
    expect(countLabel(s, 1.5, "Litre")).toBe("1.5 Litre");
    expect(countLabel(s, 2, "Carton")).toBe("2 Carton");
    expect(countLabel(s, 1.5, "pcs")).toBe("1.5 pcs");
  });

  it("does not merge a shop's own unit that only sounds like it", () => {
    localStorage.removeItem("shopbook.erp");
    saveUnit({ name: "Pack", abbr: "pk", type: "quantity" });
    expect(countLabel(load(), 1, "Pack")).toBe("1 Pack");
    localStorage.removeItem("shopbook.erp");
  });
});
