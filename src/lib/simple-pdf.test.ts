import { describe, expect, it } from "vitest";
import { textPdf } from "@/lib/simple-pdf";

describe("textPdf", () => {
  it("creates a readable single-page PDF document", () => {
    const pdf = new TextDecoder("latin1").decode(textPdf("Purchase receipt", "Shop Plus+\nRef P-104\nRice 2 x 50\nTotal 100"));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("Purchase receipt");
    expect(pdf).toContain("Ref P-104");
    expect(pdf).toContain("Page 1 of 1");
    expect(pdf).toContain("%%EOF");
  });

  it("wraps long text and paginates without losing later lines", () => {
    const body = Array.from({ length: 120 }, (_, i) => `Item ${i + 1}: ${"long description ".repeat(8)}`).join("\n");
    const pdf = new TextDecoder("latin1").decode(textPdf("Long report", body));
    expect(pdf).toContain("Page 1 of 5");
    expect(pdf).toContain("Page 5 of 5");
    expect(pdf).toContain("Item 120:");
  });
});
