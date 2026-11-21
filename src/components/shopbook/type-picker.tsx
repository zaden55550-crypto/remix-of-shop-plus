// The business type choice shared by Business Setup, Settings › Business Profile and Create Business: tick one or more types
// of the industry, the first is the main type (★, tap ★ on another to make it the main one). For Trade nothing has to be ticked:
// the business is then General Trade. Types are labels and starting settings only; every Trade type opens every Trade app.
// IndustrySelect lists the eight industries with the ones not built yet as "Coming soon"; a saved business keeps its own.
import { useState } from "react";
import { Check, ChevronDown, Star } from "lucide-react";
import { GlassNotice } from "@/components/shopbook/plan-loss";
import { useLanguage } from "@/hooks/use-language";
import { GENERAL_TRADE, INDUSTRIES, businessTypesForFamily, industryIsOpen, type IndustryFamilyId } from "@/lib/industry-config";
import { FEATURE_IDS, FEATURE_INFO, type Features } from "@/lib/trade-features";
import { cn } from "@/lib/utils";

export function IndustrySelect({ id, value, onChange, keep, className, allowEmpty }: { id?: string; value: string; onChange: (id: IndustryFamilyId) => void; keep?: string | undefined; className?: string; allowEmpty?: boolean }) {
  const { tr } = useLanguage();
  return <select id={id} className={cn("inventory-input", className)} value={value} onChange={(e) => onChange(e.target.value as IndustryFamilyId)}>
    {allowEmpty && <option value="">{tr("Choose an industry")}</option>}
    {INDUSTRIES.map((i) => {
      const open = industryIsOpen(i.id) || i.id === keep;
      return <option key={i.id} value={i.id} disabled={!open}>{open ? tr(i.name) : `${tr(i.name)} · ${tr("Coming soon")}`}</option>;
    })}
  </select>;
}

/** The feature switches (trade-features.ts) as one compact row of ticks, used under the type on Business Setup and in Settings. */
export function FeatureChecks({ value, onChange, className }: { value: Features; onChange: (patch: Partial<Features>) => void; className?: string }) {
  const { tr } = useLanguage();
  return <div className={cn("feature-checks", className)} role="group" aria-label={tr("Settings for this business")}>
    {FEATURE_IDS.map((f) => <label key={f} className={cn("feature-check", value[f] && "is-on")} title={tr(FEATURE_INFO[f].hint)}>
      <input type="checkbox" checked={value[f]} onChange={(e) => onChange({ [f]: e.target.checked })} />
      <span>{tr(FEATURE_INFO[f].name)}</span>
    </label>)}
  </div>;
}

/** `value` holds the chosen types, main first. */
export function TypePicker({ id, industry, value, onChange, invalid, required }: { id?: string; industry: IndustryFamilyId; value: readonly string[]; onChange: (types: string[]) => void; invalid?: boolean; required?: boolean }) {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const types = businessTypesForFamily(industry).map((t) => t.name);
  const chosen = value.filter(Boolean);
  const legacy = chosen.filter((t) => !types.includes(t));
  const main = chosen[0];
  const empty = industry === "trade" ? GENERAL_TRADE : tr("Choose business type");
  const label = main ? `${tr(main)}${chosen.length > 1 ? ` +${chosen.length - 1}` : ""}` : empty;
  // General Trade means "no particular type", so ticking a real type takes it off.
  const toggle = (t: string) => onChange(chosen.includes(t) ? chosen.filter((x) => x !== t) : [...chosen.filter((x) => t === GENERAL_TRADE || x !== GENERAL_TRADE), t]);
  const makeMain = (t: string) => onChange([t, ...chosen.filter((x) => x !== t)]);

  return <>
    <button id={id} type="button" className={cn("inventory-input type-picker-button", !main && "is-empty")} aria-invalid={invalid || undefined} aria-haspopup="dialog" title={chosen.map((t) => tr(t)).join(", ") || undefined} onClick={() => setOpen(true)}>
      <span>{label}</span><ChevronDown aria-hidden />
    </button>
    {open && <GlassNotice title={tr("Business Type")} onClose={() => setOpen(false)} className="type-picker-dialog">
      <p className="type-picker-hint">{tr(required || industry !== "trade" ? "Tick one or more. ★ is the main type." : "Tick one or more, or none for General Trade. ★ is the main type. Every type gets every Trade feature.")}</p>
      <ul className="type-picker-list">
        {[...legacy, ...types].map((t) => {
          const on = chosen.includes(t), isMain = t === main;
          return <li key={t} className={cn(on && "is-on")}>
            <label><input type="checkbox" checked={on} onChange={() => toggle(t)} /><span>{tr(t)}</span></label>
            {on && <button type="button" className={cn("type-picker-star", isMain && "is-main")} aria-pressed={isMain} aria-label={isMain ? tr("Main type") : `${tr("Make main type")}: ${tr(t)}`} title={isMain ? tr("Main type") : tr("Make main type")} onClick={() => makeMain(t)}><Star aria-hidden /></button>}
          </li>;
        })}
      </ul>
      <div className="type-picker-foot">
        {chosen.length > 0 && <button type="button" className="type-picker-clear" onClick={() => onChange([])}>{tr("Clear")}</button>}
        <button type="button" className="type-picker-done" onClick={() => setOpen(false)}><Check aria-hidden /> {tr("Done")}</button>
      </div>
    </GlassNotice>}
  </>;
}
