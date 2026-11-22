import { describe, expect, it } from "vitest";
import { LANGS } from "@/lib/i18n";
import { businessTypesForFamily } from "@/lib/industry-config";
import { translateText } from "@/lib/interface-translations";
import { FEATURE_GROUPS, FEATURE_IDS, featureEntry, isSuggested, type AnyFeatureId } from "@/lib/trade-features";

const all = FEATURE_GROUPS.flatMap((g) => g.features) as AnyFeatureId[];
const tradeTypes = businessTypesForFamily("trade").map((t) => t.name);

describe("the full feature list", () => {
  it("lists every built feature exactly once, in a group", () => {
    for (const id of FEATURE_IDS) expect(all.filter((x) => x === id)).toHaveLength(1);
    expect(new Set(all).size).toBe(all.length);
  });
  it("marks only built features as switchable", () => {
    for (const id of all) expect(featureEntry(id).built).toBe((FEATURE_IDS as readonly string[]).includes(id));
  });
  it("suggests features only for business types that exist", () => {
    for (const id of all) { const s = featureEntry(id).suggestedFor; if (s !== "all") for (const t of s) expect(tradeTypes, `${id}: ${t}`).toContain(t); }
  });
  it("suggests what each kind of shop usually needs", () => {
    expect(isSuggested("gas", ["Gas / LPG Dealer"])).toBe(true);
    expect(isSuggested("serials", ["Mobile Phones & Accessories"])).toBe(true);
    expect(isSuggested("weight", ["Butchery"])).toBe(true);
    expect(isSuggested("breakdown", ["Mitumba (Second-hand Clothes)"])).toBe(true);
    expect(isSuggested("prescriptions", ["Pharmacy"])).toBe(true);
    expect(isSuggested("gas", ["Pharmacy"])).toBe(false);
    expect(isSuggested("barcodes", [])).toBe(true);
    expect(isSuggested("expiry", ["Hardware Shop", "Butchery"])).toBe(true);
  });
  it.each(all)("names and explains %s in every app language", (id) => {
    const e = featureEntry(id);
    for (const language of LANGS.slice(1)) {
      expect(translateText(language, e.hint), `${id} hint in ${language}`).not.toBe(e.hint);
    }
  });
});
