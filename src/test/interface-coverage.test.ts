import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LANGS } from "../lib/i18n";
import { translateText } from "../lib/interface-translations";

// Every literal passed to tr("…") on a screen must have a row in all 11 languages, so no screen falls back to English.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "test" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.|routeTree/.test(name) ? [path] : [];
  });
}
const literals = new Set<string>();
for (const file of sourceFiles(join(__dirname, ".."))) {
  for (const m of readFileSync(file, "utf8").matchAll(/\btr\(\s*(["'])((?:\\.|(?!\1).)*?)\1/g)) {
    const quote = m[1]!;
    const body = m[2]!;
    literals.add(quote === '"' ? JSON.parse(`"${body}"`) : body.replace(/\\'/g, "'"));
  }
}
const SAME_EVERYWHERE = /^(Excel|PDF|CSV|WhatsApp|POS|VAT|M-Pesa|SKU|Change >|\{x\} .*)$/;

describe("interface translation coverage", () => {
  it("finds the screens' phrases", () => {
    expect(literals.size).toBeGreaterThan(1000);
  });
  it("translates every tr() phrase into every language", () => {
    const missing: string[] = [];
    for (const text of literals) {
      if (SAME_EVERYWHERE.test(text)) continue;
      const untranslated = LANGS.filter((l) => l !== "English" && translateText(l, text) === text);
      if (untranslated.length === LANGS.length - 1) missing.push(text);
    }
    expect(missing).toEqual([]);
  });
  it("keeps a noun label and a verb button apart, and all-caps labels in capitals", () => {
    expect(translateText("Swahili", "RETURN")).toBe("MAREJESHO");
    expect(translateText("Swahili", "Return")).toBe("Rudisha");
    expect(translateText("French", "COMPLETE SALE")).toBe("FINALISER LA VENTE");
  });
});
