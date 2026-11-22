// The wholesale price on a product (Wholesale & retail prices, Settings › Features): "from 6 at KSh 50 each". Shared by Add
// Product and Edit Product; shown only while the feature is on. Both boxes empty means no wholesale price.
import { useLanguage } from "@/hooks/use-language";
import { isWholeUnit, type Product, type Unit } from "@/lib/erp";

export type WholesaleDraft = { price: string; from: string };
export const wholesaleDraft = (p?: Pick<Product, "wholesale">): WholesaleDraft =>
  p?.wholesale ? { price: String(p.wholesale.price), from: String(p.wholesale.from) } : { price: "", from: "" };

/** The product's wholesale setting from the two boxes, or why it can't be saved. */
export function readWholesale(d: WholesaleDraft, unit: string | undefined, units?: Unit[]):
  { ok: true; value: Product["wholesale"] } | { ok: false; message: string } {
  const price = d.price.trim(), from = d.from.trim();
  if (!price && !from) return { ok: true, value: undefined };
  if (!price || !(Number(price) > 0)) return { ok: false, message: "Enter a wholesale price above zero" };
  if (!from || !(Number(from) >= 1)) return { ok: false, message: "Enter the quantity the wholesale price starts from (1 or more)" };
  if (isWholeUnit(unit, units) && !Number.isInteger(Number(from))) return { ok: false, message: "The wholesale quantity must be a whole number for this unit" };
  return { ok: true, value: { price: Number(price), from: Number(from) } };
}

export function WholesaleFields({ value, onChange, sell, Field }: {
  value: WholesaleDraft; onChange: (v: WholesaleDraft) => void; sell: string;
  /** The form's own labelled field wrapper, so the boxes look like the rest of the form. */
  Field: (props: { label: string; children: React.ReactNode }) => React.ReactNode;
}) {
  const { tr } = useLanguage();
  const below = Number(value.price) > 0 && Number(sell) > 0 && Number(value.price) >= Number(sell);
  return <>
    <Field label={tr("Wholesale price")}>
      <input type="number" min="0" step="any" className="inventory-input" placeholder={tr("Optional")} value={value.price} onChange={(e) => onChange({ ...value, price: e.target.value })} />
    </Field>
    <Field label={tr("Wholesale from (qty)")}>
      <input type="number" min="1" step="any" className="inventory-input" placeholder={tr("e.g. 6")} value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
    </Field>
    {below && <p className="pw-note wholesale-warn" role="status">{tr("The wholesale price is usually lower than the selling price.")}</p>}
  </>;
}
