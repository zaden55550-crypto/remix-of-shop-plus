// The business details form: create another business (with its first location) or edit a second business's own details.
// The business type list follows the chosen industry, so an incompatible pair can't be picked; the engine and the
// server check the same rule (business-rules.ts, drizzle/proposed/0019_sync_businesses.sql).
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { type IndustryFamilyId } from "@/lib/industry-config";
import { IndustrySelect, TypePicker } from "@/components/shopbook/type-picker";
import { businessProblem, locationProblem, typesFor, type BusinessDetails, type FirstLocation } from "@/lib/business-rules";
import { WORLD_COUNTRIES_CURRENCIES, findByCountry } from "@/lib/world-data";
import { useLanguage } from "@/hooks/use-language";
import { useErp } from "@/components/shopbook/product-search";
import { activeBusiness, listBusinesses, updateBusiness } from "@/lib/erp";

const COUNTRIES = [...WORLD_COUNTRIES_CURRENCIES].sort((a, b) => a.countryName.localeCompare(b.countryName));
const CURRENCIES = [...new Map(WORLD_COUNTRIES_CURRENCIES.map((c) => [c.currencyCode, c])).values()].sort((a, b) => a.currencyCode.localeCompare(b.currencyCode));

function Field({ label, htmlFor, children, wide }: { label: string; htmlFor: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "biz-field sm:col-span-2" : "biz-field"}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export type BusinessFormValues = { details: BusinessDetails; location: FirstLocation };

/** Settings › Business Profile while a second business is open: that business's own details, saved on its record. */
export function OpenBusinessProfile() {
  const { tr } = useLanguage();
  const s = useErp();
  const [version, setVersion] = useState(0);
  const id = activeBusiness(s), b = s.businesses.find((x) => x.id === id);
  if (!b) return null;
  const initial: BusinessDetails = { name: b.name, industryFamilyId: b.industryFamilyId ?? "", businessType: b.businessType ?? "", businessTypes: b.businessTypes ?? (b.businessType ? [b.businessType] : []), phone: b.phone ?? "", email: b.email ?? "", country: b.country ?? "", currency: b.currency };
  return (
    <div className="glass-card rounded-2xl p-4">
      <p className="mb-3 text-xs text-muted-foreground">{tr("These details belong to this business only. Your account and your other businesses are not changed.")}</p>
      <BusinessForm
        key={`${b.id}:${version}`}
        initial={initial}
        withLocation={false}
        taken={listBusinesses(s).filter((x) => x.id !== b.id).map((x) => x.name)}
        submitLabel={tr("Save")}
        onCancel={() => setVersion((v) => v + 1)}
        onSubmit={({ details }) => {
          try { updateBusiness(b.id, details); toast.success(tr("Saved")); } catch (e) { toast.error(tr((e as Error).message)); }
        }}
      />
    </div>
  );
}

/** `withLocation`: a new business also names its first location. `taken`: the owner's other business names. */
export function BusinessForm({ initial, withLocation, taken, submitLabel, usage, onSubmit, onCancel }: {
  initial: BusinessDetails;
  withLocation: boolean;
  taken: readonly string[];
  submitLabel: string;
  /** The plan's shared location allowance, shown so the owner sees what a new business will use. */
  usage?: { active: number; max: number } | undefined;
  onSubmit: (v: BusinessFormValues) => void;
  onCancel: () => void;
}) {
  const { tr } = useLanguage();
  const [d, setD] = useState<BusinessDetails>(initial);
  const [loc, setLoc] = useState<FirstLocation>({ name: "", type: "shop", address: "" });
  const [busy, setBusy] = useState(false);
  const types = useMemo(() => typesFor(d.industryFamilyId), [d.industryFamilyId]);
  const set = (patch: Partial<BusinessDetails>) => setD((x) => ({ ...x, ...patch }));
  const full = usage ? usage.active >= usage.max : false;

  const submit = () => {
    const problem = businessProblem(d, taken) ?? (withLocation ? locationProblem(loc) : null);
    if (problem) { toast.error(tr(problem)); return; }
    setBusy(true);
    try { onSubmit({ details: d, location: loc }); } finally { setBusy(false); }
  };

  return (
    <form className="biz-form space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={tr("Business name")} htmlFor="biz-name" wide>
          <input id="biz-name" className="inventory-input" autoComplete="organization" maxLength={80} value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={tr("Industry")} htmlFor="biz-industry">
          <IndustrySelect id="biz-industry" allowEmpty value={d.industryFamilyId} keep={initial.industryFamilyId || undefined}
            // A new industry clears the type, so a type from another industry can never be kept.
            onChange={(id) => set({ industryFamilyId: id, businessType: "", businessTypes: [] })} />
        </Field>
        <div className="biz-field">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{tr("Business Type")}{d.industryFamilyId === "trade" ? ` (${tr("Optional")})` : ""}</span>
          {types.length ? <TypePicker id="biz-type" industry={d.industryFamilyId as IndustryFamilyId} value={d.businessTypes?.length ? d.businessTypes : d.businessType ? [d.businessType] : []} required={d.industryFamilyId !== "trade"}
            onChange={(t) => set({ businessType: t[0] ?? "", businessTypes: t })} />
            : <button id="biz-type" type="button" className="inventory-input" disabled>{tr("Choose an industry first")}</button>}
        </div>
        <Field label={tr("Business phone number")} htmlFor="biz-phone">
          <input id="biz-phone" className="inventory-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={d.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label={tr("Email (optional)")} htmlFor="biz-email">
          <input id="biz-email" className="inventory-input" type="email" autoComplete="email" maxLength={120} value={d.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label={tr("Country")} htmlFor="biz-country">
          <select id="biz-country" className="inventory-input" value={d.country}
            // Choosing a country suggests its currency; the currency can still be changed.
            onChange={(e) => { const c = findByCountry(e.target.value); set({ country: e.target.value, ...(c ? { currency: c.currencyCode } : {}) }); }}>
            <option value="">{tr("Choose a country")}</option>
            {COUNTRIES.map((c) => <option key={c.countryCode} value={c.countryCode}>{c.countryName}</option>)}
          </select>
        </Field>
        <Field label={tr("Currency")} htmlFor="biz-currency">
          <select id="biz-currency" className="inventory-input" value={d.currency} onChange={(e) => set({ currency: e.target.value })}>
            <option value="">{tr("Choose a currency")}</option>
            {CURRENCIES.map((c) => <option key={c.currencyCode} value={c.currencyCode}>{c.currencyCode} · {c.currencyName}</option>)}
          </select>
        </Field>
      </div>

      {withLocation && (
        <fieldset className="rounded-xl border border-border/70 p-3">
          <legend className="px-1 text-sm font-bold text-foreground">{tr("First location")}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr("Location name")} htmlFor="biz-loc-name">
              <input id="biz-loc-name" className="inventory-input" maxLength={60} value={loc.name} onChange={(e) => setLoc({ ...loc, name: e.target.value })} />
            </Field>
            <Field label={tr("Type")} htmlFor="biz-loc-type">
              <select id="biz-loc-type" className="inventory-input" value={loc.type} onChange={(e) => setLoc({ ...loc, type: e.target.value as FirstLocation["type"] })}>
                <option value="shop">{tr("Shop")}</option>
                <option value="warehouse">{tr("Warehouse")}</option>
              </select>
            </Field>
            <Field label={tr("Address (optional)")} htmlFor="biz-loc-address" wide>
              <input id="biz-loc-address" className="inventory-input" maxLength={160} value={loc.address ?? ""} onChange={(e) => setLoc({ ...loc, address: e.target.value })} />
            </Field>
          </div>
          {usage && (
            <p className={full ? "mt-2 text-xs font-semibold text-destructive" : "mt-2 text-xs text-muted-foreground"} role={full ? "alert" : undefined}>
              {tr("Locations used")}: {usage.active} / {usage.max} · {tr("Shared by all your businesses")}
            </p>
          )}
        </fieldset>
      )}

      <div className="flex items-center justify-between gap-3">
        <ShopButton type="button" variant="ghost" className="w-auto px-5" onClick={onCancel}>{tr("Cancel")}</ShopButton>
        <ShopButton type="submit" variant="success" className="w-auto px-5" disabled={busy}>{submitLabel}</ShopButton>
      </div>
    </form>
  );
}
