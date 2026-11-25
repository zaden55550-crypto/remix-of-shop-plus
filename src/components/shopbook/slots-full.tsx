// All user places used (owner, 2026-11-24): every plan has a fixed number of logins (Basic 2, Growth 12, Business 24, the owner
// included; see loginAllowance in shopbook.ts). Staff choose any counter or role freely within those places; once they are all taken,
// nobody else can be added and the owner is told to contact us. More places are added only by agreement with DataQuill Solutions, for an
// agreed charge; Basic and Growth can also move to a bigger plan.
import { Link } from "@tanstack/react-router";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { SUPPORT } from "@/lib/i18n";
import { PLANS, type PlanId } from "@/lib/shopbook";

type Tr = (text: string, x?: string) => string;

/** The places a plan's logins are split into, from PLANS (never typed in). */
export function slotParts(planId: PlanId) {
  const p = PLANS.find((x) => x.id === planId) ?? PLANS[0]!;
  const total = p.maxUsers ?? 2;
  return { name: p.name, total, managers: p.maxManagers, staff: total - 1 - p.maxManagers, top: p.id === PLANS[PLANS.length - 1]!.id };
}

/** One-line refusal for toasts and tooltips. */
export const SLOTS_FULL = "You have used all your user places. To add more, contact us.";

export function SlotsFull({ tr, planId, staffOnly = false, onClose }: { tr: Tr; planId: PlanId; staffOnly?: boolean; onClose?: () => void }) {
  const s = slotParts(planId);
  const message = `${tr("Hello DataQuill Solutions, I have used all the user places on my {x} plan and would like more.", s.name)}`;
  return <div className="slots-full" role="alert">
    <p className="slots-full-title"><b>{tr(staffOnly ? "All staff places are used" : "All user places are used")}</b> · {tr("0 left")}</p>
    <p>{tr("Your {x} plan has", s.name)} <b>{s.total}</b> {tr("places")}: {tr("1 owner")}{s.managers ? ` · ${s.managers} ${tr(s.managers === 1 ? "manager" : "managers")}` : ""} · {s.staff} {tr("staff")}.
      {" "}{tr("Staff can work at any counter, shop or warehouse.")}</p>
    <p>{tr("To add more people, contact us. Extra places are added at an agreed extra charge.")}{!s.top && <> {tr("Or move to a bigger plan.")} <Link to="/plans" className="dash-link">{tr("View plans")}</Link></>}</p>
    <div className="slots-full-actions">
      <a className="slots-full-btn is-whatsapp" href={`https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden /> WhatsApp</a>
      <a className="slots-full-btn" href={`mailto:${SUPPORT.email}?subject=${encodeURIComponent(tr("More user places"))}&body=${encodeURIComponent(message)}`}><Mail aria-hidden /> {tr("Email")}</a>
      <a className="slots-full-btn" href={`tel:${SUPPORT.phone}`}><Phone aria-hidden /> {SUPPORT.phone}</a>
      {onClose && <button type="button" className="slots-full-btn is-close" onClick={onClose}>{tr("Close")}</button>}
    </div>
  </div>;
}
