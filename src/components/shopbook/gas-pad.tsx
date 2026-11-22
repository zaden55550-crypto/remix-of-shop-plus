// The gas window at the till (Gas cylinder exchange). Tapping a full cylinder asks: Refill (the customer brings an empty of
// the same size, any brand: it comes into the empties) or New cylinder (the deposit is added to the price and held for the
// customer). It sets the product's cart line, which recordSale checks again (erp.ts).
import { useState } from "react";
import { Flame } from "lucide-react";
import { GlassPage } from "@/components/shopbook/glass-page";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { emptiesOfSize } from "@/lib/gas";
import { cn } from "@/lib/utils";

/** Why a new cylinder's line costs more: the reason recorded with its price. */
export const DEPOSIT_REASON = "Includes cylinder deposit";

export function GasPad({ s, p, line, money, onSet, onClose }: {
  s: erp.ErpState; p: erp.Product; line: erp.CartLine | undefined; money: (n: number) => string;
  onSet: (line: erp.CartLine) => void; onClose: () => void;
}) {
  const { tr } = useLanguage();
  const g = p.gas!;
  const empties = emptiesOfSize(s, g.size);
  const was = line?.gas;
  const [mode, setMode] = useState<"refill" | "new">(was?.mode ?? "refill");
  const [emptyId, setEmptyId] = useState(was?.mode === "refill" ? was.emptyId : g.pairId);
  const [qty, setQty] = useState(String(line ? Math.round(line.qty) : 1));
  const deposit = Math.max(0, g.deposit ?? 0);
  const each = mode === "new" ? p.sell + deposit : p.sell;
  const n = Number(qty);
  const problem = !(Number.isInteger(n) && n >= 1) ? tr("Enter a whole number of cylinders")
    : n > p.qty ? `${tr("Insufficient stock")} (${tr("Available")} ${p.qty})`
    : mode === "refill" && !empties.some((e) => e.id === emptyId) ? tr("Choose the empty cylinder the customer brought") : "";
  const submit = () => {
    if (problem) return;
    const base = { productId: p.id, qty: n };
    onSet(mode === "new" ? { ...base, price: each, priceReason: DEPOSIT_REASON, gas: { mode: "new" } } : { ...base, gas: { mode: "refill", emptyId } });
    onClose();
  };
  return <GlassPage narrow label={p.name} onClose={onClose}>
    <form className="gas-pad" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="weight-pad-head"><Flame aria-hidden /><div className="min-w-0">
        <p className="weight-pad-name" translate="no">{g.brand} {g.size} kg</p>
        <p className="weight-pad-price">{tr("Full in stock")}: {p.qty} · {tr("Refill")} {money(p.sell)} · {tr("Deposit")} {money(deposit)}</p>
      </div></div>
      <div className="gas-pad-modes" role="radiogroup" aria-label={tr("Sale type")}>
        <button type="button" role="radio" aria-checked={mode === "refill"} className={cn(mode === "refill" && "is-on")} onClick={() => setMode("refill")}>
          <b>{tr("Refill / exchange")}</b><small>{tr("The customer brings an empty cylinder")}</small></button>
        <button type="button" role="radio" aria-checked={mode === "new"} className={cn(mode === "new" && "is-on")} onClick={() => setMode("new")}>
          <b>{tr("New cylinder")}</b><small>{tr("Refill price + deposit")}</small></button>
      </div>
      {mode === "refill" && <label className="gas-pad-field"><span>{tr("Empty cylinder brought")}</span>
        <select className="inventory-input" value={emptyId} onChange={(e) => setEmptyId(e.target.value)}>
          {empties.map((e) => <option key={e.id} value={e.id}>{e.gas!.brand} {e.gas!.size} kg{e.id === g.pairId ? ` (${tr("same brand")})` : ""}</option>)}
        </select></label>}
      <label className="gas-pad-field"><span>{tr("Cylinders")}</span>
        <input className="inventory-input" type="number" min="1" step="1" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      <p className={cn("weight-pad-result", problem && "is-bad")} role="status">
        {problem || `${n} × ${money(each)}${mode === "new" && deposit ? ` (${money(p.sell)} + ${tr("deposit")} ${money(deposit)})` : ""} = ${money(Math.round(n * each * 100) / 100)}`}
      </p>
      <div className="weight-pad-actions">
        <ShopButton type="button" variant="outline" onClick={onClose}>{tr("Cancel")}</ShopButton>
        <ShopButton type="submit" disabled={!!problem}>{line ? tr("Update cart") : tr("Add to cart")}</ShopButton>
      </div>
    </form>
  </GlassPage>;
}
