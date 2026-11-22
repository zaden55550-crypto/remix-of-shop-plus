import { useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Store, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { SearchableCountryPicker, SearchableCurrencyPicker } from "@/components/shopbook/ui";
import { findByCountry } from "@/lib/world-data";
import { store, businessTypesOf, type Account } from "@/lib/shopbook";
import { useSettings, type Branch } from "@/lib/settings-config";
import { GENERAL_TRADE, INDUSTRIES, businessTypeByName, businessTypesForFamily, isIndustryFamilyId } from "@/lib/industry-config";
import { FeaturePanel, IndustrySelect, TypePicker } from "@/components/shopbook/type-picker";
import { currentFeatures, saveFeatures } from "@/lib/trade-features";
import { GlassPage } from "@/components/shopbook/glass-page";
import { ReadyToSell } from "@/components/shopbook/ready-to-sell";
import { useErp } from "@/components/shopbook/product-search";

type Tr = (x: string) => string;

function F({ label, children, wide, tr }: { label: string; children: ReactNode; wide?: boolean | undefined; tr: Tr }) { return <label className={`inventory-field${wide ? " bp-wide" : ""}`}><span>{tr(label)}</span>{children}</label>; }

/** Business Profile: logo, basic info, location, extra details, branches, currency. Saves to account + device settings only. */
export function BusinessProfile({ acct, tr, onAccount }: { acct: Account; tr: Tr; onAccount: (p: Partial<Account>) => void }) {
  const [cfg, save] = useSettings();
  const erpState = useErp(), [ready, setReady] = useState(false);
  const currentBusinessTypes = businessTypesOf(acct);
  const primaryType = currentBusinessTypes[0] ?? cfg.businessType;
  const knownBusinessType = businessTypeByName(primaryType);
  const industryFamilyId = isIndustryFamilyId(acct.industryFamilyId) ? acct.industryFamilyId : knownBusinessType?.familyId ?? "trade";
  const selectedIndustry = INDUSTRIES.find((industry) => industry.id === industryFamilyId);
  const [, refresh] = useState(0);
  const features = currentFeatures(currentBusinessTypes);
  const [logo, setLogo] = useState(acct.logo ?? ""), file = useRef<HTMLInputElement>(null);
  // Country and currency are the business's own (the same values Create Account sets), picked from the full world list.
  const [place, setPlace] = useState({ country: acct.country ?? "", currency: acct.currency ?? "" });
  const setCountry = (country: string, currency?: string) => {
    const next = { country, currency: currency || place.currency };
    setPlace(next); onAccount(next);
    const name = findByCountry(country)?.countryName; if (name) save({ country: name });
  };
  const setCurrency = (currency: string, country?: string) => { const next = { currency, country: country || place.country }; setPlace(next); onAccount(next); };
  const [br, setBr] = useState<Branch>({ name: "", location: "" });
  const txt = (k: "owner" | "phone" | "taxPin" | "country" | "city" | "location" | "website" | "hours", label: string, wide?: boolean) => <F tr={tr} label={label} wide={wide}><input className="inventory-input" value={cfg[k]} onChange={(e) => save({ [k]: e.target.value })} /></F>;
  const pickLogo = (f?: File) => { if (!f) return; if (f.size > 1_500_000) { toast.error(tr("Logo must be under 1.5 MB")); return; } const r = new FileReader(); r.onload = () => { const v = String(r.result); setLogo(v); onAccount({ logo: v }); }; r.readAsDataURL(f); };
  const addBranch = () => { if (!br.name.trim()) { toast.error(tr("Enter a branch name")); return; } save({ branches: [...cfg.branches, { name: br.name.trim(), location: br.location.trim() }] }); setBr({ name: "", location: "" }); toast.success(tr("Added")); };

  return <div className="bp-grid">
    {!acct.staff && <div className="bp-card bp-setup-card">
      <p className="money-heading">{tr("Business Setup")}</p>
      <p className="settings-note">{tr("Add or rename shops and warehouses, counters, phones and people on one page. Nothing already recorded changes.")}</p>
      <Link to="/setup" className="bp-setup-link">{tr("Open Business Setup")}</Link>
      <button type="button" className="bp-setup-link" onClick={() => setReady(true)}>{tr("Ready to sell")}</button>
      {ready && <GlassPage label={tr("Ready to sell")} onClose={() => setReady(false)}><ReadyToSell s={erpState} onClose={() => setReady(false)} /></GlassPage>}
    </div>}
    <div className="bp-card bp-logo-card">
      <p className="money-heading">{tr("Business Logo")}</p>
      <div className="bp-logo-row">
        <div className="settings-logo">{logo ? <img src={logo} alt={tr("Business Logo")} /> : <Store className="h-8 w-8" />}</div>
        <div className="bp-logo-actions">
          <input ref={file} hidden type="file" accept="image/*" onChange={(e) => pickLogo(e.target.files?.[0])} />
          <ShopButton className="inventory-save" onClick={() => file.current?.click()}><Upload className="h-4 w-4" />{tr(logo ? "Change logo" : "Upload logo")}</ShopButton>
          {logo && <ShopButton variant="outline" className="inventory-save" onClick={() => { setLogo(""); onAccount({ logo: undefined }); }}>{tr("Remove")}</ShopButton>}
          <p className="settings-note">PNG / JPG • {tr("max")} 1.5 MB</p>
        </div>
      </div>
    </div>

    <div className="bp-card">
      <p className="money-heading">{tr("Basic Information")}</p>
      <div className="bp-fields">
        <F tr={tr} label="Business Name" wide><input className="inventory-input" defaultValue={acct.shopName} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== store.get()?.shopName) onAccount({ shopName: v }); }} /></F>
        <F tr={tr} label="Industry"><IndustrySelect value={industryFamilyId} keep={industryFamilyId} onChange={(familyId) => { if (!isIndustryFamilyId(familyId) || familyId === industryFamilyId) return; const first = familyId === "trade" ? GENERAL_TRADE : businessTypesForFamily(familyId)[0]?.name; if (first) { save({ businessType: first }); onAccount({ businessTypes: [first], industryFamilyId: familyId }); } }} /></F>
        <div className="inventory-field bp-wide"><span>{tr("Business Type")}</span>
          <TypePicker industry={industryFamilyId} value={currentBusinessTypes} required={industryFamilyId !== "trade"} onChange={(types) => {
            const next = types.length ? types : industryFamilyId === "trade" ? [GENERAL_TRADE] : [];
            if (!next.length) { toast.error(tr("Choose the business type")); return; }
            save({ businessType: next[0]! }); onAccount({ businessTypes: next, industryFamilyId });
          }} />
        </div>
        {selectedIndustry?.implementationStatus === "configuration-only" && <p className="settings-note bp-wide">{tr("This records your industry and business type; its specialized operating modules are not available yet.")}</p>}
        {txt("owner", "Owner")}
        {txt("phone", "Phone")}
        <F tr={tr} label="Email"><input className="inventory-input" type="email" defaultValue={acct.email} onBlur={(e) => { const v = e.target.value.trim(); if (v && !/^\S+@\S+\.\S+$/.test(v)) { toast.error(tr("Enter a valid email")); return; } if (v !== acct.email) onAccount({ email: v }); }} /></F>
        {txt("taxPin", "KRA PIN / Tax ID")}
      </div>
    </div>

    {industryFamilyId === "trade" && <div className="bp-card">
      <p className="money-heading">{tr("Features")}</p>
      <p className="settings-note">{tr("Every feature works for every shop. Switch on what you use; anything switched off stays out of the way, and switching it off never deletes records.")}</p>
      <FeaturePanel value={features} types={currentBusinessTypes} onChange={(p) => { saveFeatures(p); refresh((n) => n + 1); }} />
    </div>}

    <div className="bp-card">
      <p className="money-heading">{tr("Location")}</p>
      <div className="bp-fields"><div className="inventory-field bp-picker"><SearchableCountryPicker value={place.country || "KEN"} onChange={setCountry} /></div>{txt("city", "City / Town")}{txt("location", "Street address", true)}</div>
    </div>

    <details className="bp-card">
      <summary className="money-heading cursor-pointer">{tr("Additional Details")}</summary>
      <div className="bp-fields">
        {txt("website", "Website")}
        <F tr={tr} label="Description" wide><textarea className="inventory-input bp-text" rows={2} value={cfg.description} onChange={(e) => save({ description: e.target.value })} /></F>
      </div>
    </details>

    <details className="bp-card">
      <summary className="money-heading cursor-pointer">{tr("Branches")}</summary>
      {!cfg.branches.length && <p className="settings-note">{tr("No branches yet")}</p>}
      {cfg.branches.map((b, i) => <div key={i} className="flex items-center gap-2 border-b border-border py-1.5"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{b.name}</p>{b.location && <p className="truncate text-[11px] text-muted-foreground">{b.location}</p>}</div><ShopButton variant="bare" className="inventory-icon-button text-destructive" aria-label={`${tr("Delete")} ${b.name}`} onClick={() => save({ branches: cfg.branches.filter((_, j) => j !== i) })}><Trash2 className="h-3.5 w-3.5" /></ShopButton></div>)}
      <div className="bp-branch-add"><input className="inventory-input" placeholder={tr("Branch name")} aria-label={tr("Branch name")} value={br.name} onChange={(e) => setBr({ ...br, name: e.target.value })} /><input className="inventory-input" placeholder={tr("Location")} aria-label={tr("Branch location")} value={br.location} onChange={(e) => setBr({ ...br, location: e.target.value })} /><ShopButton className="inventory-add-named" aria-label={tr("Add branch")} onClick={addBranch}><Plus className="h-4 w-4" /></ShopButton></div>
    </details>

    <div className="bp-card">
      <p className="money-heading">{tr("Currency & Number Format")}</p>
      <div className="bp-fields">
        <div className="inventory-field bp-picker"><SearchableCurrencyPicker value={place.currency || "KSH"} onChange={setCurrency} /></div>
        <F tr={tr} label="Number format"><select className="inventory-input" value={cfg.numberFormat} onChange={(e) => save({ numberFormat: e.target.value })}>{["1,000,000", "1.000.000", "1 000 000"].map((x) => <option key={x}>{x}</option>)}</select></F>
      </div>
      <p className="settings-note">{tr("Example")}: {acct.currency} {cfg.numberFormat.replace("000,000", "250,500").replace("000.000", "250.500").replace("000 000", "250 500")}</p>
    </div>
  </div>;
}
