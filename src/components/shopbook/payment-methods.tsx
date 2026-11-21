// Settings › Finance › Payment Methods (also Float › Other Accounts › Manage accounts): the one place a business names its payment
// methods. Every money screen reads the same list (erp.paymentMethods) in the same order, so nothing is set up twice.
// Cash, M-Pesa and Bank keep their fixed ids when renamed or disabled, and every method keeps its records, so no history moves.
// Credit and Partial Payment are payment states, always offered where a workflow allows them; they are never methods here.
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import { ShopButton } from "@/components/ui/shop-button";
import { useBusinessErp } from "@/components/shopbook/product-search";
import { moneyFor } from "@/components/shopbook/selling";
import { store } from "@/lib/shopbook";
import * as erp from "@/lib/erp";
import * as fin from "@/lib/finance";
import { toast } from "sonner";

type Tr = (t: string) => string;

export function PaymentMethodsManager({ tr }: { tr: Tr }) {
  // The open business's methods and balances only (each business has its own payment settings).
  const s = useBusinessErp();
  const money = moneyFor(store.get()?.currency || "KSh");
  const list = erp.paymentMethods(s), balances = fin.floatBalances(s), inUse = list.filter((m) => m.active).length;
  const [name, setName] = useState(""), [cat, setCat] = useState<erp.PaymentCategory>("mobile"), [addError, setAddError] = useState("");
  const [edit, setEdit] = useState<{ id: string; name: string; error: string } | null>(null);
  // Every change goes through the ERP engine (validate-then-save); its message is shown where the change was asked for.
  const attempt = (f: () => unknown, ok: string, onError?: (m: string) => void) => {
    try { f(); toast.success(tr(ok)); return true; } catch (e) { const m = tr(e instanceof Error ? e.message : "Failed"); if (onError) onError(m); else toast.error(m); return false; }
  };
  const label = (m: erp.PaymentMethodInfo) => erp.methodLabel(m.id, s, tr);
  const add = (e: FormEvent) => { e.preventDefault(); if (attempt(() => fin.addMoneyAccount(name, cat), "Payment method added", setAddError)) { setName(""); setAddError(""); } };
  const rename = (e: FormEvent) => { e.preventDefault(); if (!edit) return; if (attempt(() => fin.renameMoneyAccount(edit.id, edit.name), "Saved", (m) => setEdit({ ...edit, error: m }))) setEdit(null); };

  return <div className="paym">
    <p className="settings-note">{tr("These are the payment methods every money screen offers — Sales, POS, Purchases, Expenses, supplier and customer payments, refunds and returns — in this order. Rename them to match your country (EVC, SAAD, Premier Wallet, Card…).")}</p>
    <p className="settings-note"><b>{tr("Credit")}</b> {tr("and")} <b>{tr("Partial Payment")}</b> {tr("are always offered separately where a sale or bill can be left unpaid. They are payment states, not methods.")} · {inUse} {tr("in use")}</p>
    <ol className="paym-list" aria-label={tr("Payment Methods")}>
      {list.map((m, i) => {
        const bal = fin.balanceOf(balances, m.id), editing = edit?.id === m.id, errId = `paym-err-${m.id}`;
        return <li key={m.id} className={m.active ? "paym-row" : "paym-row is-off"}>
          <span className="paym-pos" aria-hidden>{i + 1}</span>
          {editing
            ? <form className="paym-rename" onSubmit={rename}>
                <input autoFocus className="inventory-input" aria-label={`${tr("Name")} · ${label(m)}`} aria-invalid={!!edit.error} aria-describedby={edit.error ? errId : undefined} maxLength={40} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value, error: "" })} />
                <ShopButton type="submit" className="inventory-save h-9 px-3">{tr("Save")}</ShopButton>
                <ShopButton type="button" variant="outline" className="h-9 px-3" onClick={() => setEdit(null)}>{tr("Cancel")}</ShopButton>
                {edit.error && <p id={errId} role="alert" className="paym-error">{edit.error}</p>}
              </form>
            : <span className="paym-name"><b>{label(m)}</b>{!m.active && <small>{tr("Disabled")}</small>}<small>{money(bal)}</small></span>}
          <select className="inventory-input paym-cat" aria-label={`${tr("Category")} · ${label(m)}`} value={m.category} onChange={(e) => attempt(() => fin.setMoneyAccountCategory(m.id, e.target.value as erp.PaymentCategory), "Saved")}>
            {erp.PAYMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{tr(c.label)}</option>)}
          </select>
          <label className="paym-toggle" title={m.active ? tr("Shown on every money screen") : tr("Hidden from new payments; its history stays")}>
            <input type="checkbox" checked={m.active} onChange={(e) => attempt(() => fin.setMoneyAccountActive(m.id, e.target.checked), e.target.checked ? "Payment method enabled" : "Payment method disabled")} />
            <span>{tr(m.active ? "Enabled" : "Disabled")}</span>
          </label>
          <span className="paym-tools">
            <ShopButton variant="bare" className="paym-btn" aria-label={`${tr("Rename")} · ${label(m)}`} title={tr("Rename")} onClick={() => setEdit({ id: m.id, name: m.name, error: "" })}><Pencil aria-hidden /></ShopButton>
            <ShopButton variant="bare" className="paym-btn" disabled={i === 0} aria-label={`${tr("Move up")} · ${label(m)}`} title={tr("Move up")} onClick={() => attempt(() => fin.moveMoneyAccount(m.id, -1), "Saved")}><ArrowUp aria-hidden /></ShopButton>
            <ShopButton variant="bare" className="paym-btn" disabled={i === list.length - 1} aria-label={`${tr("Move down")} · ${label(m)}`} title={tr("Move down")} onClick={() => attempt(() => fin.moveMoneyAccount(m.id, 1), "Saved")}><ArrowDown aria-hidden /></ShopButton>
          </span>
        </li>;
      })}
    </ol>
    <form className="paym-add" onSubmit={add} noValidate>
      <label className="inventory-field"><span>{tr("New payment method")}</span>
        <input className="inventory-input" aria-invalid={!!addError} aria-describedby={addError ? "paym-add-err" : undefined} maxLength={40} placeholder={tr("e.g. EVC, SAAD, Card")} value={name} onChange={(e) => { setName(e.target.value); setAddError(""); }} />
      </label>
      <label className="inventory-field"><span>{tr("Category")}</span>
        <select className="inventory-input" value={cat} onChange={(e) => setCat(e.target.value as erp.PaymentCategory)}>{erp.PAYMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{tr(c.label)}</option>)}</select>
      </label>
      <ShopButton type="submit" className="inventory-save h-10 px-3" disabled={inUse >= erp.MONEY_ACCOUNT_LIMIT}><Plus className="h-4 w-4" aria-hidden />{tr("Add method")}</ShopButton>
      {addError && <p id="paym-add-err" role="alert" className="paym-error">{addError}</p>}
    </form>
    <p className="settings-note">{tr("A method holding money can't be disabled until the money is moved out (Float › Transfers). Disabling never deletes records.")}</p>
  </div>;
}
