import { useState, type ReactNode } from "react";
import { ShopButton } from "@/components/ui/shop-button";
import { PayPicker, emptyPay, payInvalid, payRecord, paidOf } from "@/components/shopbook/pay-picker";
import { run } from "@/components/shopbook/selling";
import { settlePeople } from "@/lib/people";
/** `group` renders a div so searchable pickers inside are not re-clicked by a wrapping label. */
export function Field({ label, children, group }: { label: string; children: ReactNode; group?: boolean }) { return group ? <div role="group" aria-label={label} className="inventory-field"><span>{label}</span>{children}</div> : <label className="inventory-field"><span>{label}</span>{children}</label>; }
export function PaymentForm({ kind, id, balance, money, tr, onDone }: { kind: "customer" | "supplier" | "payroll"; id: string; balance: number; money: (n: number) => string; tr: (s: string) => string; onDone: () => void }) {
 const [amount, setAmount] = useState(String(balance)); const [pay, setPay] = useState(emptyPay(kind === "customer" ? "cash" : "mpesa"));
 const total = +amount, parts = payRecord(pay, total);
 return <div className="inventory-form mt-2"><Field label={tr("Amount")}><input aria-label={tr("Amount")} className="inventory-input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><PayPicker value={pay} onChange={setPay} total={total || 0} money={money} tr={tr} allowCredit={false} allowPartial /><ShopButton className="inventory-save" disabled={!Number.isFinite(total) || total <= 0 || total > balance || paidOf(parts) <= 0 || payInvalid(pay, total)} onClick={() => { if (run(() => settlePeople(kind, id, parts), tr("Payment recorded"))) onDone(); }}>{tr(kind === "customer" ? "Receive payment" : "Make payment")}</ShopButton></div>;
}
