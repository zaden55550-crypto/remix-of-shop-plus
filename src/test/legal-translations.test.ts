import { describe, expect, it } from "vitest";
import { LANGS } from "@/lib/i18n";
import { PRIVACY, TERMS } from "@/lib/legal-text";
import { LEGAL_ENGLISH, LEGAL_LANGUAGES, legalSentence, localizeLegal } from "@/lib/legal-translations";

const englishNow = () => {
  const out: string[] = [];
  for (const d of [TERMS, PRIVACY]) { out.push(...d.intro); for (const s of d.sections) out.push(s.heading, ...s.paragraphs, ...(s.list ?? [])); }
  return [...new Set(out)];
};

describe("Terms & Privacy translations", () => {
  it("cover exactly the English sentences on the pages, in order (update legal-i18n/*.json when the English changes)", () => {
    expect(LEGAL_ENGLISH).toEqual(englishNow());
  });
  it.each(LANGS.slice(1))("%s has every sentence, none left blank or in English", (language) => {
    const list = LEGAL_LANGUAGES[language]!;
    expect(list, language).toBeDefined();
    expect(list.length).toBe(LEGAL_ENGLISH.length);
    list.forEach((x, i) => { expect(x.trim(), `${language} #${i}`).not.toBe(""); });
    // Headings keep their numbers, so a shifted line (wrong order) shows up here.
    LEGAL_ENGLISH.forEach((x, i) => { const n = /^(\d+)\. /.exec(x)?.[1]; if (n) expect(list[i]!.startsWith(`${n}.`), `${language} heading #${i}`).toBe(true); });
  });
  it("shows a changed English sentence in English rather than an old translation", () => {
    expect(legalSentence("Swahili", "1. The Service")).toBe("1. Huduma");
    expect(legalSentence("Swahili", "A sentence that was edited later.")).toBe("A sentence that was edited later.");
    expect(localizeLegal(TERMS, "English")).toEqual(TERMS);
  });
});
