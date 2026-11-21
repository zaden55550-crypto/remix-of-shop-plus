import { describe, expect, it } from "vitest";
import { cleanDialCode, countryForDial, dialCodeFor, phoneToSave, splitPhone, withDialCode } from "@/lib/dial-codes";
import { WORLD_COUNTRIES_CURRENCIES } from "@/lib/world-data";

describe("sign-up phone dialling codes", () => {
  it("knows a code for every picker country except the Eurozone entry", () => {
    const missing = WORLD_COUNTRIES_CURRENCIES.map((c) => c.countryCode).filter((c) => c !== "EUR" && !dialCodeFor(c));
    expect(missing).toEqual([]);
    expect(dialCodeFor("KEN")).toBe("+254");
    expect(dialCodeFor("SOM")).toBe("+252");
  });

  it("swaps the code when the country changes and keeps the typed number", () => {
    expect(withDialCode("+254 712 345 678", "+252")).toBe("+252 712 345 678");
    expect(withDialCode("+254 ", "+256")).toBe("+256 ");
    expect(withDialCode("0712345678", "+254")).toBe("+254 0712345678");
  });

  it("splits a code typed with or without a space", () => {
    expect(splitPhone("+254712345678")).toEqual({ code: "+254", local: "712345678" });
    expect(splitPhone("+252 61 234 5678")).toEqual({ code: "+252", local: "61 234 5678" });
    expect(splitPhone("+44 7700 900123")).toEqual({ code: "+44", local: "7700 900123" });
  });

  it("shows the short country code for the typed code, preferring the chosen country", () => {
    expect(countryForDial("+254", "KEN")).toBe("KEN");
    expect(countryForDial("+252", "KEN")).toBe("SOM");
    expect(countryForDial("+1", "CAN")).toBe("CAN");
    expect(countryForDial("+9999", "KEN")).toBe("");
  });

  it("keeps a typed code to + and up to four digits", () => {
    expect(cleanDialCode("254")).toBe("+254");
    expect(cleanDialCode("+2 5x4")).toBe("+254");
    expect(cleanDialCode("")).toBe("");
  });

  it("saves nothing for a code alone and drops the trunk 0 after a code", () => {
    expect(phoneToSave("+254 ")).toBe("");
    expect(phoneToSave("+254 0712 345 678")).toBe("+254 712 345 678");
    expect(phoneToSave("+39 06 1234 5678")).toBe("+39 06 1234 5678");
  });
});
