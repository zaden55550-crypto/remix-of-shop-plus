// Inventory › Products & Stock › Gas Cylinders (Gas cylinder exchange). Every brand and size with its full and empty
// cylinders, refill price and deposit; adding a brand and size; a customer returning a cylinder for the deposit; sending
// empties to the supplier. The full ones come back in through a normal purchase of the "… Full" product.
import { useState } from "react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { useLanguage } from "@/hooks/use-language";
import * as erp from "@/lib/erp";
import { GAS_BRANDS, GAS_SIZES, addGasCylinder, gasPairs, refundCylinderDeposit, sendEmpties, updateGasPrices, type GasPair } from "@/lib/gas";
import { translateCurrent } from "@/lib/interface-translations";
import { cn } from "@/lib/utils";

const attempt = <T,>(fn: () => T): T | undefined => {
  try { return fn(); } catch (e) { toast.error(translateCurrent(e instanceof Error ? e.message : "Something went wrong")); return undefined; }
};
type Panel = null | "add" | { k: "return" | "send" | "prices"; pair: GasPair };

export function GasCylinders({ s, money }: { s: erp.ErpState; money: (n: number) => string }) {
  const { tr } = useLanguage();
  const pairs = gasPairs(s);
  const [panel, setPanel] = useState<Panel>(null);
  const heldDeposits = Math.round(s.sales.reduce((a, x) => a + x.items.reduce((b, i) => b + (i.gas?.mode === "new" ? i.gas.deposit * (i.qty - i.returned) : 0), 0), 0) * 100) / 100
    - Math.round(s.payments.filter((p) => p.kind === "REFUND" && p.source.startsWith("CYL")).reduce((a, p) => a + Math.abs(p.amount), 0) * 100) / 100;
  return <div className="gas-page">
    <div className="gas-toolbar">
      <p className="gas-held">{tr("Cylinder deposits held")}: <b>{money(Math.max(0, heldDeposits))}</b></p>
      <ShopButton onClick={() => setPanel("add")}>+ {tr("Add brand & size")}</ShopButton>
    </div>
    {pairs.length === 0 ? <p className="settings-note">{tr("No gas cylinders yet. Add each brand and size you sell (for example K-Gas 13 kg) with its refill price and deposit.")}</p>
      : <div className="gas-table" role="table" aria-label={tr("Gas Cylinders")}>
        <div className="gas-row gas-head" role="row"><span role="columnheader">{tr("Cylinder")}</span><span role="columnheader">{tr("Full")}</span><span role="columnheader">{tr("Empty")}</span><span role="columnheader">{tr("Refill")}</span><span role="columnheader">{tr("Deposit")}</span><span role="columnheader">{tr("Actions")}</span></div>
        {pairs.map((x) => <div key={x.full.id} className="gas-row" role="row">
          <span role="cell" translate="no"><b>{x.brand}</b> {x.size} kg</span>
          <span role="cell" className={cn(x.full.qty <= 0 && "is-zero")}>{x.full.qty}</span>
          <span role="cell">{x.empty.qty}</span>
          <span role="cell">{money(x.full.sell)}</span>
          <span role="cell">{money(x.deposit)}</span>
          <span role="cell" className="gas-actions">
            <button type="button" onClick={() => setPanel({ k: "return", pair: x })}>{tr("Cylinder returned")}</button>
            <button type="button" onClick={() => setPanel({ k: "send", pair: x })}>{tr("Send empties")}</button>
            <button type="button" onClick={() => setPanel({ k: "prices", pair: x })}>{tr("Prices")}</button>
          </span>
        </div>)}
      </div>}
    <p className="settings-note">{tr("Refills come in through Purchases: buy the \"… Full\" product from your supplier. Sell from POS: each full cylinder asks Refill or New cylinder.")}</p>
    {panel === "add" && <AddForm tr={tr} onDone={() => setPanel(null)} />}
    {panel && panel !== "add" && panel.k === "return" && <ReturnForm s={s} pair={panel.pair} money={money} tr={tr} onDone={() => setPanel(null)} />}
    {panel && panel !== "add" && panel.k === "send" && <SendForm pair={panel.pair} tr={tr} onDone={() => setPanel(null)} />}
    {panel && panel !== "add" && panel.k === "prices" && <PricesForm pair={panel.pair} tr={tr} onDone={() => setPanel(null)} />}
  </div>;
}

type Tr = (x: string) => string;
const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

function AddForm({ tr, onDone }: { tr: Tr; onDone: () => void }) {
  const [brand, setBrand] = useState<string>(GAS_BRANDS[0]);
  const [other, setOther] = useState("");
  const [size, setSize] = useState("13");
  const [f, setF] = useState({ refill: "", deposit: "", cost: "", full: "", empty: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    const r = attempt(() => addGasCylinder({ brand: brand === "other" ? other : brand, size: num(size), refillPrice: num(f.refill), deposit: f.deposit.trim() ? num(f.deposit) : 0,
      refillCost: f.cost.trim() ? num(f.cost) : 0, full: f.full.trim() ? num(f.full) : 0, empty: f.empty.trim() ? num(f.empty) : 0 }));
    if (r) { toast.success(tr("Gas cylinder added")); onDone(); }
  };
  return <div className="gas-form" role="group" aria-label={tr("Add brand & size")}>
    <h4>{tr("Add brand & size")}</h4>
    <div className="gas-form-grid">
      <label><span>{tr("Brand")}</span><select className="inventory-input" value={brand} onChange={(e) => setBrand(e.target.value)}>
        {GAS_BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}<option value="other">{tr("Other brand…")}</option></select></label>
      {brand === "other" && <label><span>{tr("Brand name")}</span><input className="inventory-input" value={other} onChange={(e) => setOther(e.target.value)} /></label>}
      <label><span>{tr("Size (kg)")}</span><input className="inventory-input" type="number" min="1" step="any" list="gas-sizes" value={size} onChange={(e) => setSize(e.target.value)} />
        <datalist id="gas-sizes">{GAS_SIZES.map((x) => <option key={x} value={x} />)}</datalist></label>
      <label><span>{tr("Refill price")} *</span><input className="inventory-input" type="number" min="0" step="any" value={f.refill} onChange={set("refill")} /></label>
      <label><span>{tr("Deposit (new cylinder)")}</span><input className="inventory-input" type="number" min="0" step="any" value={f.deposit} onChange={set("deposit")} /></label>
      <label><span>{tr("Cost per refill")}</span><input className="inventory-input" type="number" min="0" step="any" value={f.cost} onChange={set("cost")} /></label>
      <label><span>{tr("Full cylinders now")}</span><input className="inventory-input" type="number" min="0" step="1" value={f.full} onChange={set("full")} /></label>
      <label><span>{tr("Empty cylinders now")}</span><input className="inventory-input" type="number" min="0" step="1" value={f.empty} onChange={set("empty")} /></label>
    </div>
    <div className="gas-form-foot"><ShopButton variant="outline" onClick={onDone}>{tr("Cancel")}</ShopButton><ShopButton onClick={save}>{tr("Save")}</ShopButton></div>
  </div>;
}

function ReturnForm({ s, pair, money, tr, onDone }: { s: erp.ErpState; pair: GasPair; money: (n: number) => string; tr: Tr; onDone: () => void }) {
  const [qty, setQty] = useState("1");
  const [method, setMethod] = useState<erp.Method>(erp.defaultMethod(s));
  const [customer, setCustomer] = useState("");
  const n = Number(qty) || 0;
  const save = () => {
    const r = attempt(() => refundCylinderDeposit(pair.empty.id, n, method, customer || undefined));
    if (r) { toast.success(`${r.ref} · ${tr("Deposit paid back")} ${money(r.amount)}`); onDone(); }
  };
  return <div className="gas-form" role="group" aria-label={tr("Cylinder returned")}>
    <h4>{tr("Cylinder returned")} · {pair.brand} {pair.size} kg</h4>
    <p className="settings-note">{tr("The customer gives the cylinder back and gets the deposit. The cylinder joins the empties.")}</p>
    <div className="gas-form-grid">
      <label><span>{tr("Cylinders")}</span><input className="inventory-input" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      <label><span>{tr("Pay back from")}</span><select className="inventory-input" value={method} onChange={(e) => setMethod(e.target.value as erp.Method)}>
        {erp.moneyMethods(s).map((m) => <option key={m} value={m}>{erp.methodLabel(m, s, tr)}</option>)}</select></label>
      <label><span>{tr("Customer (optional)")}</span><select className="inventory-input" value={customer} onChange={(e) => setCustomer(e.target.value)}>
        <option value="">{tr("No Customer")}</option>{s.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    </div>
    <p className="weight-pad-result">{n > 0 ? `${n} × ${money(pair.deposit)} = ${money(Math.round(n * pair.deposit * 100) / 100)}` : tr("Enter a whole number of cylinders")}</p>
    <div className="gas-form-foot"><ShopButton variant="outline" onClick={onDone}>{tr("Cancel")}</ShopButton><ShopButton disabled={!(n > 0) || !(pair.deposit > 0)} onClick={save}>{tr("Pay deposit back")}</ShopButton></div>
  </div>;
}

function SendForm({ pair, tr, onDone }: { pair: GasPair; tr: Tr; onDone: () => void }) {
  const [qty, setQty] = useState(String(Math.max(1, Math.floor(pair.empty.qty))));
  const [supplier, setSupplier] = useState("");
  const save = () => { if (attempt(() => sendEmpties(pair.empty.id, Number(qty), supplier)) !== undefined) { toast.success(tr("Empties sent")); onDone(); } };
  return <div className="gas-form" role="group" aria-label={tr("Send empties")}>
    <h4>{tr("Send empties")} · {pair.brand} {pair.size} kg</h4>
    <p className="settings-note">{tr("Empties leave for refilling. When the full ones arrive, record them in Purchases.")}</p>
    <div className="gas-form-grid">
      <label><span>{tr("Empty cylinders")} ({tr("in stock")}: {pair.empty.qty})</span><input className="inventory-input" type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} /></label>
      <label><span>{tr("Supplier (optional)")}</span><input className="inventory-input" value={supplier} onChange={(e) => setSupplier(e.target.value)} /></label>
    </div>
    <div className="gas-form-foot"><ShopButton variant="outline" onClick={onDone}>{tr("Cancel")}</ShopButton><ShopButton onClick={save}>{tr("Send empties")}</ShopButton></div>
  </div>;
}

function PricesForm({ pair, tr, onDone }: { pair: GasPair; tr: Tr; onDone: () => void }) {
  const [refill, setRefill] = useState(String(pair.full.sell));
  const [deposit, setDeposit] = useState(String(pair.deposit));
  const save = () => { if (attempt(() => updateGasPrices(pair.full.id, num(refill), num(deposit))) !== undefined) { toast.success(tr("Prices saved")); onDone(); } };
  return <div className="gas-form" role="group" aria-label={tr("Prices")}>
    <h4>{tr("Prices")} · {pair.brand} {pair.size} kg</h4>
    <div className="gas-form-grid">
      <label><span>{tr("Refill price")}</span><input className="inventory-input" type="number" min="0" step="any" value={refill} onChange={(e) => setRefill(e.target.value)} /></label>
      <label><span>{tr("Deposit (new cylinder)")}</span><input className="inventory-input" type="number" min="0" step="any" value={deposit} onChange={(e) => setDeposit(e.target.value)} /></label>
    </div>
    <p className="settings-note">{tr("Sales already made keep the deposit they charged.")}</p>
    <div className="gas-form-foot"><ShopButton variant="outline" onClick={onDone}>{tr("Cancel")}</ShopButton><ShopButton onClick={save}>{tr("Save")}</ShopButton></div>
  </div>;
}
