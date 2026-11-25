import type { CSSProperties, ReactNode } from "react";
import { Activity, AlertTriangle, Percent, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The Dashboard's KPI colours: green positive, cyan operational, red negative, purple profit, amber attention. */
export const KPI_COLOR = { good: "#22c55e", info: "#06b6d4", bad: "#ef4444", profit: "#a855f7", warn: "#eab308" } as const;
export type KpiTone = keyof typeof KPI_COLOR;
const KPI_ICON: Record<KpiTone, LucideIcon> = { good: TrendingUp, info: Activity, bad: TrendingDown, profit: Percent, warn: AlertTriangle };

/** Colour for a KPI whose (English) label is only known at run time, as in Reports. */
export function kpiTone(label: string): KpiTone {
  if (/profit|margin|commission/i.test(label)) return "profit";
  if (/expense|refund|return|payable|out of stock|salar/i.test(label)) return "bad";
  if (/low stock|credit|p\.pay|debt|unmatched|stock|balance|owed/i.test(label)) return "warn";
  if (/sales|revenue|paid|receiv|cash in|money in/i.test(label)) return "good";
  return "info";
}

/** Every DataQuill Solutions summary metric is the Dashboard's KPI card (dash-kpi) in one non-wrapping strip. */
export function KpiRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("kpi-row", className)}>{children}</div>;
}

export function Kpi({ label, value, tone = "info", icon }: { label: string; value: ReactNode; tone?: KpiTone | undefined; icon?: ReactNode }) {
  const Fallback = KPI_ICON[tone];
  return (
    <div className="dash-kpi" style={{ "--tone": KPI_COLOR[tone] } as CSSProperties}>
      <span className="dash-kpi-icon">{icon ?? <Fallback />}</span>
      <span className="dash-kpi-body">
        <span className="dash-kpi-label">{label}</span>
        <span className="dash-money dash-kpi-value" data-fit-text="money">{value}</span>
      </span>
    </div>
  );
}
