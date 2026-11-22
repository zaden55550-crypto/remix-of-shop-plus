// The weight keypad (Settings › Features › Selling by weight). At the till, tapping a weighed product (kg, g, or a shop unit of
// type Weight) opens this instead of adding 1: type the weight, or the money the customer wants ("KSh 100 worth"), or tap a
// quick amount. It shows the price per kg and the line total as you type, never allows more than is in stock, and sets the
// product's line in the cart (a product already in the cart opens with its weight, so the keypad changes it).
// The money → weight rule is the cart's own (lineForAmount): an amount that doesn't divide evenly becomes an audited
// one-sale price, exactly as when an amount is typed in the cart.
import { useEffect, useRef, useState } from "react";
import { Delete, Scale } from "lucide-react";
import { GlassPage } from "@/components/shopbook/glass-page";
import { lineForAmount } from "@/components/shopbook/cart-sheet";
import { ShopButton } from "@/components/ui/shop-button";
import * as erp from "@/lib/erp";
import { parseQty } from "@/lib/qty-parse";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";

type Mode = "weight" | "money";

const QUICK_WEIGHTS = [0.25, 0.5, 1, 2] as const;
const QUICK_MONEY = [50, 100, 200, 500] as const;
const fmtQty = (n: number) => String(erp.roundQty(n));

export function WeightPad({ s, p, line, money, onSet, onClose }: {
  s: erp.ErpState; p: erp.Product; line: erp.CartLine | undefined; money: (n: number) => string;
  onSet: (line: erp.CartLine) => void; onClose: () => void;
}) {
  const { tr } = useLanguage();
  const unit = p.unit || "kg";
  const price = line ? erp.linePrice(s, line) : p.sell;
  const [mode, setMode] = useState<Mode>("weight");
  const [raw, setRaw] = useState(line ? fmtQty(line.qty) : "");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, [mode]);

  // What the typed value makes: the cart line it would set, or why it can't.
  const value = parseQty(raw);
  const base: erp.CartLine = line ?? { productId: p.id, qty: 1 };
  let next: erp.CartLine | null = null, problem = "";
  if (raw.trim()) {
    if (value === null || !(value > 0)) problem = tr(mode === "weight" ? "Enter a weight above zero" : "Enter an amount above zero");
    else if (mode === "weight") next = { ...base, qty: erp.roundQty(value) };
    else next = lineForAmount(s, base, value);
    if (next && next.qty > p.qty + 1e-9) { problem = `${tr("Insufficient stock")} (${tr("Available")} ${fmtQty(p.qty)} ${unit})`; next = null; }
    else if (!next && !problem) problem = `${tr("Insufficient stock")} (${tr("Available")} ${fmtQty(p.qty)} ${unit})`;
  }
  const total = next ? erp.lineAmount(s, next) : 0;

  const press = (k: string) => setRaw((r) => (k === "⌫" ? r.slice(0, -1) : k === "." && r.includes(".") ? r : `${r}${k}`));
  const switchMode = (m: Mode) => { if (m === mode) return; setMode(m); setRaw(""); };
  const submit = () => { if (next) { onSet(next); onClose(); } };

  return <GlassPage narrow label={tr("Weigh {x}", p.name)} onClose={onClose}>
    <form className="weight-pad" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="weight-pad-head">
        <Scale aria-hidden />
        <div className="min-w-0">
          <p className="weight-pad-name" translate="no">{p.name}</p>
          <p className="weight-pad-price">{money(price)} / {unit} · {tr("In stock")}: {fmtQty(p.qty)} {unit}</p>
        </div>
      </div>

      <div className="weight-pad-modes" role="tablist" aria-label={tr("Sell by")}>
        <button type="button" role="tab" aria-selected={mode === "weight"} className={cn(mode === "weight" && "is-on")} onClick={() => switchMode("weight")}>{unit}</button>
        <button type="button" role="tab" aria-selected={mode === "money"} className={cn(mode === "money" && "is-on")} onClick={() => switchMode("money")}>{tr("Amount")}</button>
      </div>

      <div className="weight-pad-entry">
        <input ref={input} inputMode="decimal" autoComplete="off" value={raw} aria-invalid={!!problem} aria-label={tr(mode === "weight" ? "Weight" : "Amount")}
          placeholder={mode === "weight" ? `0.000 ${unit}` : money(0)} onChange={(e) => setRaw(e.target.value)} />
        <b>{mode === "weight" ? unit : ""}</b>
      </div>

      <div className="weight-pad-quick">
        {(mode === "weight" ? QUICK_WEIGHTS : QUICK_MONEY).map((q) => <button key={q} type="button" onClick={() => setRaw(String(q))}>
          {mode === "weight" ? `${q === 0.25 ? "¼" : q === 0.5 ? "½" : q} ${unit}` : money(q)}
        </button>)}
      </div>

      <div className="weight-pad-keys" aria-hidden="true">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => <button key={k} type="button" tabIndex={-1} onClick={() => press(k)}>
          {k === "⌫" ? <Delete /> : k}
        </button>)}
      </div>

      <p className={cn("weight-pad-result", problem && "is-bad")} role="status" aria-live="polite">
        {problem || (next ? `${fmtQty(next.qty)} ${unit} × ${money(erp.linePrice(s, next))}/${unit} = ${money(total)}` : tr("Type the weight, or the amount the customer wants"))}
      </p>

      <div className="weight-pad-actions">
        <ShopButton type="button" variant="outline" onClick={onClose}>{tr("Cancel")}</ShopButton>
        <ShopButton type="submit" disabled={!next}>{line ? tr("Update cart") : tr("Add to cart")}</ShopButton>
      </div>
    </form>
  </GlassPage>;
}
