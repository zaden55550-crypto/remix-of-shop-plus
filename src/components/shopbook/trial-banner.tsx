import { useLayoutEffect, useRef } from "react";
import { Crown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { TrialEndingNotice } from "@/components/shopbook/plan-loss";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

/** Free-trial banner shared by Apps and Dashboard: [N DAYS LEFT]  YOUR FREE TRIAL  [EXPLORE PLANS →] in one
 *  row on every screen. Sizes follow the banner's width; longer translations shrink the text until the
 *  whole row fits, so nothing wraps or truncates. Only Explore plans is interactive; it opens Plans.
 *  Callers pass their own background/border so each screen keeps its look. */
export function TrialBanner({ days, className, variant }: { days: number; className?: string; variant?: "dashboard" }) {
  const { tr, dir, language } = useLanguage();
  const rowRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let width = -1;
    const fits = () => [...row.children].every((c) => c.scrollWidth <= c.clientWidth) && row.scrollWidth <= row.clientWidth;
    const fit = () => {
      if (row.clientWidth === width) return;
      width = row.clientWidth;
      row.style.fontSize = "";
      let size = parseFloat(getComputedStyle(row).fontSize);
      for (let i = 0; i < 12 && size > 7 && !fits(); i++) {
        size = Math.max(7, size * 0.93);
        row.style.fontSize = `${size}px`;
      }
    };
    fit();
    void document.fonts?.ready.then(() => {
      width = -1;
      fit();
    });
    const ro = new ResizeObserver(fit);
    ro.observe(row);
    return () => ro.disconnect();
  }, [days, language]);

  // Dashboard (owner's reference, 2026-11-26): crown · You are on a Full ERP Trial | days left | Explore Plans button.
  if (variant === "dashboard") return (
    <div className={cn("trial-banner is-dashboard", className)}>
      <div className="trial-banner-row">
        <span className="trial-banner-text"><Crown aria-hidden="true" className="trial-banner-crown" />{tr("You are on a Full ERP Trial")}</span>
        <span className="trial-banner-sep" aria-hidden="true" />
        <span className="trial-banner-days">{tr(days === 1 ? "{x} day left" : "{x} days left", days)}</span>
        <Link to="/plans" className="trial-banner-upgrade">{tr("Explore Plans")} {dir === "rtl" ? "←" : "→"}</Link>
      </div>
      <TrialEndingNotice days={days} />
    </div>
  );
  return (
    <div className={cn("trial-banner", className)}>
      <div ref={rowRef} className="trial-banner-row">
        <span className="trial-banner-days">{tr(days === 1 ? "{x} day left" : "{x} days left", days)}</span>
        <span className="trial-banner-sep" aria-hidden="true" />
        <span className="trial-banner-text">{tr("Your free trial")}</span>
        <span className="trial-banner-sep" aria-hidden="true" />
        <Link to="/plans" className="trial-banner-upgrade">
          {tr("Explore plans")} {dir === "rtl" ? "←" : "→"}
        </Link>
      </div>
      <TrialEndingNotice days={days} />
    </div>
  );
}
