// First-sale walkthrough (owner, 2026-11-23): straight after Activate, two screens — add one product, then sell one — so a new owner
// sees the whole loop work before opening the apps. Both are real records (the sale can be returned later); either screen can be skipped.
import { useState } from "react";
import { CircleCheck, Package, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import * as erp from "@/lib/erp";

type Tr = (x: string) => string;

export function FirstSale({ tr, money, onFinish }: { tr: Tr; money: (n: number) => string; onFinish: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [p, setP] = useState({ name: "", sell: "", buy: "", qty: "10" });
  const [product, setProduct] = useState<erp.Product | null>(null);
  const [method, setMethod] = useState<erp.MoneyMethod>(() => erp.defaultMethod(erp.load()));
  const [sale, setSale] = useState<erp.Sale | null>(null);
  const s = erp.load();

  const addIt = () => {
    try {
      const sell = Number(p.sell), buy = Number(p.buy || 0), qty = Number(p.qty || 0);
      if (!p.name.trim()) throw new erp.ErpError("Enter the product name");
      if (!(sell > 0)) throw new erp.ErpError("Enter the selling price");
      if (!(qty >= 1)) throw new erp.ErpError("Enter how many you have");
      setProduct(erp.addProduct({ name: p.name.trim(), sell, buy, qty, unit: "pcs" }));
      setStep(2);
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Could not add the product")); }
  };
  const sellIt = () => {
    if (!product) return;
    try {
      const pay = { cash: 0, mpesa: 0, bank: 0, credit: 0, [method]: product.sell } as erp.PayRecord;
      setSale(erp.confirmSale({ cart: [{ productId: product.id, qty: 1 }], discount: 0, pay, channel: "POS" }));
      setStep(3);
    } catch (e) { toast.error(tr(e instanceof Error ? e.message : "Could not record the sale")); }
  };

  return <div className="inventory-box dash-panel first-sale">
    <ol className="first-sale-steps" aria-label={tr("Your first sale")}>
      <li className={step >= 1 ? "is-on" : undefined}><Package aria-hidden /> {tr("Add a product")}</li>
      <li className={step >= 2 ? "is-on" : undefined}><ShoppingCart aria-hidden /> {tr("Sell it")}</li>
    </ol>
    {step === 1 && <>
      <h3>{tr("Add your first product")}</h3>
      <p className="settings-note">{tr("One product you sell every day. You can add the rest later or import them.")}</p>
      <div className="first-sale-grid">
        <label className="inventory-field"><span>{tr("Product name")}</span><input className="inventory-input" autoFocus value={p.name} placeholder={tr("e.g. Sugar 1kg")} onChange={(e) => setP({ ...p, name: e.target.value })} /></label>
        <label className="inventory-field"><span>{tr("Selling price")}</span><input className="inventory-input" inputMode="decimal" value={p.sell} placeholder="0" onChange={(e) => setP({ ...p, sell: e.target.value })} /></label>
        <label className="inventory-field"><span>{tr("Buying price")} <small>({tr("Optional")})</small></span><input className="inventory-input" inputMode="decimal" value={p.buy} placeholder="0" onChange={(e) => setP({ ...p, buy: e.target.value })} /></label>
        <label className="inventory-field"><span>{tr("How many you have")}</span><input className="inventory-input" inputMode="numeric" value={p.qty} onChange={(e) => setP({ ...p, qty: e.target.value })} /></label>
      </div>
      <div className="first-sale-foot"><button type="button" className="bsetup-link-btn" onClick={onFinish}>{tr("Skip for now")}</button><ShopButton onClick={addIt}>{tr("Add product")}</ShopButton></div>
    </>}
    {step === 2 && product && <>
      <h3>{tr("Now sell one")}</h3>
      <p className="settings-note">{tr("This records a real sale of one item, as at the till. You can return it later from Sales if it was only a test.")}</p>
      <div className="first-sale-item"><b>{product.name}</b><span>1 × {money(product.sell)}</span></div>
      <label className="inventory-field"><span>{tr("Paid by")}</span><select className="inventory-input" value={method} onChange={(e) => setMethod(e.target.value as erp.MoneyMethod)}>{erp.moneyMethods(s).map((m) => <option key={m} value={m}>{erp.methodLabel(m, s, tr)}</option>)}</select></label>
      <div className="first-sale-foot"><button type="button" className="bsetup-link-btn" onClick={onFinish}>{tr("Skip for now")}</button><ShopButton onClick={sellIt}>{tr("Sell")} · {money(product.sell)}</ShopButton></div>
    </>}
    {step === 3 && sale && <>
      <h3><CircleCheck aria-hidden className="first-sale-done" /> {tr("Your first sale is done")}</h3>
      <p className="settings-note">{tr("Receipt")} {sale.ref} · {money(sale.total)}. {tr("Stock went down by one and the money is in your accounts. Everything else works the same way.")}</p>
      <div className="first-sale-foot"><span /><ShopButton onClick={onFinish}>{tr("Open my apps")}</ShopButton></div>
    </>}
  </div>;
}
