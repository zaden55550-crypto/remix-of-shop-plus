// First Google or Apple sign-in (owner, 2026-11-25): before the business is created, one short window asks for the business name and
// phone, with country and currency filled in from the device's region (changeable). Then the business is created and linked online
// with those details, so it never starts as "Amina's Business" and invitations show the real name. Closing it signs out again.
import { createPortal } from "react-dom";
import { useState } from "react";
import { Store } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { ShopButton } from "@/components/ui/shop-button";
import { SearchableCountryPicker, SearchableCurrencyPicker } from "@/components/shopbook/ui";
import { dialCodeFor, kenyaPhoneHint, phoneToSave } from "@/lib/dial-codes";
import { detectUserCountry } from "@/lib/world-data";

export type BusinessDetails = { shopName: string; phone: string; country: string; currency: string };

export function FinishBusiness({ email, onDone, onCancel }: { email: string; onDone: (d: BusinessDetails) => Promise<void>; onCancel: () => void }) {
  const { tr } = useLanguage();
  const [f, setF] = useState(() => { const r = detectUserCountry(); return { name: "", phone: "", country: r.countryCode, currency: r.currencyCode, dial: dialCodeFor(r.countryCode) || "+254" }; });
  const [err, setErr] = useState<{ name?: string; phone?: string }>({});
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = f.name.trim();
    const phone = f.phone.trim().startsWith("+") ? phoneToSave(f.phone) : phoneToSave(`${f.dial} ${f.phone}`);
    const digits = phone.replace(/\D/g, "");
    const next = { ...(name.length < 2 ? { name: tr("Enter your business name") } : {}), ...(digits.length < 9 || digits.length > 15 ? { phone: tr("Enter a valid phone number") } : {}) };
    setErr(next);
    if (next.name || next.phone) return;
    setBusy(true);
    try { await onDone({ shopName: name.slice(0, 80), phone, country: f.country, currency: f.currency }); }
    finally { setBusy(false); }
  };
  const hint = kenyaPhoneHint(f.dial, f.phone);
  return createPortal(<div className="glass-scrim finish-biz-scrim" role="presentation">
    <form className="glass-card finish-biz" role="dialog" aria-modal="true" aria-labelledby="finish-biz-title" onSubmit={(e) => void submit(e)}>
      <div className="finish-biz-head"><Store aria-hidden /><div><h2 id="finish-biz-title">{tr("Finish your business")}</h2><p>{tr("Signed in as")} {email}. {tr("Two details and you're in.")}</p></div></div>
      <label className="finish-biz-field"><span>{tr("Business Name")} <i>*</i></span>
        <input autoFocus className="inventory-input" value={f.name} maxLength={80} placeholder={tr("e.g. Mama Njeri Supermarket")} aria-invalid={!!err.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        {err.name && <small role="alert">{err.name}</small>}
      </label>
      <label className="finish-biz-field"><span>{tr("Phone Number")} <i>*</i></span>
        <span className="finish-biz-phone"><input className="inventory-input finish-biz-dial" value={f.dial} aria-label={tr("Country code")} onChange={(e) => setF({ ...f, dial: e.target.value })} /><input className="inventory-input" inputMode="tel" value={f.phone} placeholder="0712 345 678" aria-invalid={!!err.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></span>
        {err.phone ? <small role="alert">{err.phone}</small> : hint ? <small>{tr(hint)}</small> : null}
      </label>
      <div className="finish-biz-two">
        <div className="finish-biz-field"><span>{tr("Country")}</span><SearchableCountryPicker value={f.country} onChange={(country, currency) => setF({ ...f, country, currency: currency || f.currency, dial: dialCodeFor(country) || f.dial })} /></div>
        <div className="finish-biz-field"><span>{tr("Currency")}</span><SearchableCurrencyPicker value={f.currency} onChange={(currency, country) => setF({ ...f, currency, country: country || f.country })} /></div>
      </div>
      <div className="finish-biz-foot">
        <ShopButton type="button" variant="outline" disabled={busy} onClick={onCancel}>{tr("Cancel")}</ShopButton>
        <ShopButton type="submit" disabled={busy} aria-busy={busy}>{tr(busy ? "Creating your business…" : "Continue")}</ShopButton>
      </div>
    </form>
  </div>, document.body);
}
