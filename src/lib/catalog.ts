// Inventory › Configuration › Product Setup: categories, brands, units and attributes. Everything saves through the ERP
// engine, so it is audited, per business and synced like any other record. Products keep their unit as a name, and stock
// is always counted in that unit: conversions only turn a bought quantity into stock.
import { commit, ErpError, roundQty, uid, type Attribute, type AttributeValue, type CatalogItem, type ErpState, type Product, type Unit, type UnitType } from "@/lib/erp";

export type CatalogKind = "categories" | "brands";
export const UNIT_TYPES: { key: UnitType; label: string }[] = [
  { key: "quantity", label: "Quantity" }, { key: "weight", label: "Weight" }, { key: "volume", label: "Volume" }, { key: "length", label: "Length" },
];

/** Built in, with fixed ids, so nothing is written until a shop edits one and two devices can never seed duplicates. */
export const DEFAULT_UNITS: Unit[] = [
  { id: "unit-piece", name: "Piece", abbr: "pcs", type: "quantity" },
  { id: "unit-kg", name: "Kg", abbr: "kg", type: "weight", baseId: "unit-gram", factor: 1000 },
  { id: "unit-gram", name: "Gram", abbr: "g", type: "weight" },
  { id: "unit-litre", name: "Litre", abbr: "L", type: "volume", baseId: "unit-ml", factor: 1000 },
  { id: "unit-ml", name: "Millilitre", abbr: "ml", type: "volume" },
  { id: "unit-box", name: "Box", abbr: "box", type: "quantity" },
  { id: "unit-carton", name: "Carton", abbr: "ctn", type: "quantity" },
  { id: "unit-packet", name: "Packet", abbr: "pkt", type: "quantity" },
  { id: "unit-metre", name: "Metre", abbr: "m", type: "length" },
  { id: "unit-yard", name: "Yard", abbr: "yd", type: "length" },
];
// Older products say "pcs" or "pieces"; they are still the Piece unit.
const PIECE_WORDS = new Set(["pc", "pieces"]);
const key = (t: string) => t.trim().toLowerCase();
const isActive = (x: { active?: boolean | undefined }) => x.active !== false;

// ---------- Categories and brands ----------
const word = (kind: CatalogKind) => (kind === "brands" ? "BRAND" : "CATEGORY");
const refKey = (kind: CatalogKind) => (kind === "brands" ? "brandId" : "categoryId");
export const catalogUse = (s: ErpState, kind: CatalogKind, id: string) => s.products.filter((p) => p[refKey(kind)] === id).length;

export type CatalogInput = { id?: string | undefined; name: string; description?: string | undefined; icon?: string | undefined; logo?: string | undefined };
export const saveCatalogItem = (kind: CatalogKind, input: CatalogInput) => commit((s, c) => {
  const name = input.name.trim();
  if (!name) throw new ErpError(kind === "brands" ? "Enter a brand name" : "Enter a category name");
  if (s[kind].some((x) => x.id !== input.id && key(x.name) === key(name))) throw new ErpError("Already exists");
  const details = { name, description: input.description?.trim() || undefined, icon: input.icon || undefined, logo: input.logo || undefined };
  const old = input.id ? s[kind].find((x) => x.id === input.id) : undefined;
  if (input.id && !old) throw new ErpError("Not found");
  if (old) { c.audit(`${word(kind)} EDITED`, old.name === name ? name : `${old.name} → ${name}`); Object.assign(old, details); return old; }
  const item: CatalogItem = { id: uid(), ...details }; s[kind].push(item);
  c.audit(`${word(kind)} CREATED`, name);
  return item;
});
export const setCatalogActive = (kind: CatalogKind, id: string, active: boolean) => commit((s, c) => {
  const x = s[kind].find((v) => v.id === id); if (!x) throw new ErpError("Not found");
  if (active) delete x.active; else x.active = false;
  c.audit(`${word(kind)} ${active ? "ACTIVATED" : "DEACTIVATED"}`, x.name);
});
/** What a product form may offer: active records, plus the one the product already has. */
export const activeCatalog = (s: ErpState, kind: CatalogKind, current?: string) => s[kind].filter((x) => isActive(x) || x.id === current);

// ---------- Units ----------
/** The built-in units as this shop has them, then its own. */
export function listUnits(s: ErpState): Unit[] {
  const saved = new Map(s.units.map((u) => [u.id, u]));
  return [...DEFAULT_UNITS.map((u) => saved.get(u.id) ?? u), ...s.units.filter((u) => !DEFAULT_UNITS.some((d) => d.id === u.id))];
}
export function findUnit(s: ErpState, text?: string): Unit | undefined {
  const t = key(text || "pcs"), units = listUnits(s);
  return units.find((u) => key(u.name) === t || key(u.abbr) === t) ?? (PIECE_WORDS.has(t) ? units.find((u) => u.id === "unit-piece") : undefined);
}
/** "1 pc", "2 pcs", "0 pcs": one wording for the Piece unit however it was saved. Display only; every other unit keeps its saved name. */
export function countLabel(s: ErpState, qty: number, unit?: string) {
  const piece = !unit || (["pc", "pcs", "piece", "pieces"].includes(key(unit)) && findUnit(s, unit)?.id === "unit-piece");
  return `${qty} ${piece ? (qty === 1 ? "pc" : "pcs") : unit}`;
}
/** Unit names to offer on a product form. A unit the product already has stays listed, even if no longer active. */
export function unitNames(s: ErpState, current?: string) {
  const names = listUnits(s).filter(isActive).map((u) => u.name);
  return current && !names.some((n) => key(n) === key(current)) ? [...names, current] : names;
}
function toRoot(units: Unit[], unit: Unit) {
  let at = unit, factor = 1;
  for (let i = 0; at.baseId && i < 32; i++) {
    const next = units.find((u) => u.id === at.baseId);
    if (!next) break;
    factor *= at.factor ?? 1; at = next;
  }
  return { root: at.id, factor };
}
/** How many `to` make one `from`, or null when the two aren't linked by a conversion. */
export function conversionFactor(s: ErpState, from?: string, to?: string): number | null {
  const a = findUnit(s, from), b = findUnit(s, to);
  if (!a || !b) return from && to && key(from) === key(to) ? 1 : null;
  if (a.id === b.id) return 1;
  if (a.type !== b.type) return null;
  const units = listUnits(s), x = toRoot(units, a), y = toRoot(units, b);
  return x.root === y.root ? x.factor / y.factor : null;
}
export const convertQty = (s: ErpState, qty: number, from?: string, to?: string) => {
  const f = conversionFactor(s, from, to);
  return f === null ? null : roundQty(qty * f);
};
/** Units a product can be bought in: its own, then any active unit with a conversion to it. */
export function buyingUnits(s: ErpState, p: Product): string[] {
  const own = findUnit(s, p.unit)?.name ?? p.unit ?? "Piece";
  return [own, ...listUnits(s).filter((u) => isActive(u) && u.name !== own && conversionFactor(s, u.name, own) !== null).map((u) => u.name)];
}
export function conversionText(s: ErpState, u: Unit) {
  if (!u.baseId) return "";
  const base = listUnits(s).find((x) => x.id === u.baseId);
  return base ? `1 ${u.name} = ${u.factor} ${base.name}` : "";
}

export type UnitInput = { id?: string | undefined; name: string; abbr: string; type: UnitType; baseId?: string | undefined; factor?: number | undefined };
export const saveUnit = (input: UnitInput) => commit((s, c) => {
  const name = input.name.trim(), abbr = input.abbr.trim();
  if (!name) throw new ErpError("Enter a unit name");
  if (!abbr) throw new ErpError("Enter an abbreviation");
  if (!UNIT_TYPES.some((t) => t.key === input.type)) throw new ErpError("Choose a unit type");
  const units = listUnits(s), old = input.id ? units.find((u) => u.id === input.id) : undefined;
  if (input.id && !old) throw new ErpError("Not found");
  const others = units.filter((u) => u.id !== input.id);
  if (others.some((u) => [key(u.name), key(u.abbr)].some((t) => t === key(name) || t === key(abbr)))) throw new ErpError("This unit already exists");
  const id = old?.id ?? uid();
  if (old && old.type !== input.type && others.some((u) => u.baseId === id)) throw new ErpError("Other units convert to this one. Remove those conversions before changing its type");
  const unit: Unit = { id, name, abbr, type: input.type };
  if (old?.active === false) unit.active = false;
  if (input.baseId) {
    const base = others.find((u) => u.id === input.baseId);
    if (!base) throw new ErpError("Choose the unit it converts to");
    if (base.type !== input.type) throw new ErpError("Only units of the same type can convert");
    if (!(Number(input.factor) > 0) || !Number.isFinite(input.factor)) throw new ErpError("Enter how many are in one unit");
    if (toRoot([...others, unit], base).root === id) throw new ErpError("These conversions would go in a circle");
    unit.baseId = base.id; unit.factor = input.factor;
  }
  const i = s.units.findIndex((u) => u.id === id);
  if (i >= 0) s.units[i] = unit; else s.units.push(unit);
  // Products keep the unit by name, so a renamed unit stays theirs.
  if (old && old.name !== name) s.products.forEach((p) => { if (key(p.unit || "") === key(old.name)) p.unit = name; });
  c.audit(old ? "UNIT EDITED" : "UNIT CREATED", [name, conversionText(s, unit)].filter(Boolean).join(" · "));
  return unit;
});
export const setUnitActive = (id: string, active: boolean) => commit((s, c) => {
  const u = listUnits(s).find((x) => x.id === id); if (!u) throw new ErpError("Not found");
  const next: Unit = { ...u }; if (active) delete next.active; else next.active = false;
  const i = s.units.findIndex((x) => x.id === id);
  if (i >= 0) s.units[i] = next; else s.units.push(next);
  c.audit(active ? "UNIT ACTIVATED" : "UNIT DEACTIVATED", u.name);
});

// ---------- Attributes ----------
export const attributeUse = (s: ErpState, id: string) => s.products.filter((p) => p.attributes?.[id]?.length).length;
export const valueUse = (s: ErpState, attributeId: string, valueId: string) => s.products.filter((p) => p.attributes?.[attributeId]?.includes(valueId)).length;
export const activeAttributes = (s: ErpState) => s.attributes.filter(isActive);

export type AttributeInput = { id?: string | undefined; name: string; values: { id?: string | undefined; name: string; active?: boolean | undefined }[] };
export const saveAttribute = (input: AttributeInput) => commit((s, c) => {
  const name = input.name.trim();
  if (!name) throw new ErpError("Enter an attribute name");
  if (s.attributes.some((a) => a.id !== input.id && key(a.name) === key(name))) throw new ErpError("Already exists");
  const rows = input.values.map((v) => ({ ...v, name: v.name.trim() })).filter((v) => v.name);
  if (!rows.length) throw new ErpError("Add at least one value");
  if (new Set(rows.map((v) => key(v.name))).size !== rows.length) throw new ErpError("A value is listed twice");
  const values: AttributeValue[] = rows.map((v) => { const x: AttributeValue = { id: v.id ?? uid(), name: v.name }; if (v.active === false) x.active = false; return x; });
  const old = input.id ? s.attributes.find((a) => a.id === input.id) : undefined;
  if (input.id && !old) throw new ErpError("Not found");
  if (old) {
    const gone = old.values.find((v) => !values.some((x) => x.id === v.id) && valueUse(s, old.id, v.id));
    if (gone) throw new ErpError(`${gone.name} is used by products. Deactivate it instead`);
    c.audit("ATTRIBUTE EDITED", `${name}: ${values.map((v) => v.name).join(", ")}`);
    old.name = name; old.values = values;
    return old;
  }
  const attribute: Attribute = { id: uid(), name, values }; s.attributes.push(attribute);
  c.audit("ATTRIBUTE CREATED", `${name}: ${values.map((v) => v.name).join(", ")}`);
  return attribute;
});
export const setAttributeActive = (id: string, active: boolean) => commit((s, c) => {
  const a = s.attributes.find((x) => x.id === id); if (!a) throw new ErpError("Not found");
  if (active) delete a.active; else a.active = false;
  c.audit(active ? "ATTRIBUTE ACTIVATED" : "ATTRIBUTE DEACTIVATED", a.name);
});
export const deleteAttribute = (id: string) => commit((s, c) => {
  const a = s.attributes.find((x) => x.id === id); if (!a) return;
  const used = attributeUse(s, id);
  if (used) throw new ErpError(`${a.name} is used by ${used} product${used === 1 ? "" : "s"}. Deactivate it instead`);
  s.attributes = s.attributes.filter((x) => x.id !== id);
  c.audit("ATTRIBUTE DELETED", a.name);
});
/** "Size: S, M · Colour: Red" for a product's details. */
export function attributeText(s: ErpState, p: Product) {
  return s.attributes.flatMap((a) => {
    const picked = a.values.filter((v) => p.attributes?.[a.id]?.includes(v.id)).map((v) => v.name);
    return picked.length ? [`${a.name}: ${picked.join(", ")}`] : [];
  }).join(" · ");
}
