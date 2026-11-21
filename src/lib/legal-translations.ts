// Terms & Conditions and Privacy Policy in every app language (owner's request, 2026-11-21).
// legal-i18n/en.json lists every English sentence of legal-text.ts in page order; each other file holds the same sentences, in the
// same order, in one language. A sentence is shown translated only when the English it was made from is unchanged, so editing the
// English never shows an out-of-date translation: that sentence falls back to English until its translation is updated
// (legal-translations.test.ts lists what is missing). Like the English draft, the translations must be reviewed by a qualified,
// fluent reader before customers rely on them.
import type { Lang } from "@/lib/i18n";
import type { LegalDoc } from "@/lib/legal-text";
import en from "@/lib/legal-i18n/en.json";
import sw from "@/lib/legal-i18n/sw.json";
import fr from "@/lib/legal-i18n/fr.json";
import ar from "@/lib/legal-i18n/ar.json";
import es from "@/lib/legal-i18n/es.json";
import pt from "@/lib/legal-i18n/pt.json";
import de from "@/lib/legal-i18n/de.json";
import it from "@/lib/legal-i18n/it.json";
import zh from "@/lib/legal-i18n/zh.json";
import hi from "@/lib/legal-i18n/hi.json";
import so from "@/lib/legal-i18n/so.json";

export const LEGAL_ENGLISH: readonly string[] = en;
export const LEGAL_LANGUAGES: Partial<Record<Lang, readonly string[]>> = {
  Swahili: sw, French: fr, Arabic: ar, Spanish: es, Portuguese: pt, German: de, Italian: it, Chinese: zh, Hindi: hi, Somali: so,
};

/** One language's sentence for an English sentence, or the English when there is none. */
export function legalSentence(language: Lang | string, english: string): string {
  const list = LEGAL_LANGUAGES[language as Lang];
  if (!list) return english;
  const at = LEGAL_ENGLISH.indexOf(english);
  return (at >= 0 && list[at]) || english;
}

/** The whole document in one language (headings, paragraphs and lists). */
export function localizeLegal(doc: LegalDoc, language: Lang | string): LegalDoc {
  const t = (x: string) => legalSentence(language, x);
  return {
    ...doc,
    intro: doc.intro.map(t),
    sections: doc.sections.map((s) => ({ ...s, heading: t(s.heading), paragraphs: s.paragraphs.map(t), ...(s.list ? { list: s.list.map(t) } : {}) })),
  };
}
