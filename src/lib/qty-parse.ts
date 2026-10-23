// Reads quantities the way shop staff type them: "0.5", "1/2", "1 3/4", "1 and 3/4", "1¾", "2.25 yard".
const VULGAR: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125 };

export function parseQty(raw: string): number | null {
  let t = raw.trim().toLowerCase().replace(/,/g, ".");
  t = t.replace(/[a-z]+\s*$/g, (m) => (m.trim() === "and" ? m : "")).trim(); // drop a trailing unit word
  t = t.replace(/\s+and\s+/g, " ").replace(/-/g, " ");
  for (const [k, v] of Object.entries(VULGAR)) if (t.includes(k)) { const whole = t.replace(k, "").trim(); const w = whole === "" ? 0 : Number(whole); return Number.isFinite(w) && w >= 0 ? w + v : null; }
  let m = /^(\d+(?:\.\d+)?)$/.exec(t); if (m) return Number(m[1]);
  m = /^(\d+)\/(\d+)$/.exec(t); if (m) return +m[2]! > 0 ? +m[1]! / +m[2]! : null;
  m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(t); if (m) return +m[3]! > 0 ? +m[1]! + +m[2]! / +m[3]! : null;
  return null;
}
