// The working date period chosen from the header calendar. A page that can filter by date calls usePeriod and hands
// the result to the shared header; a page that does not has no calendar. Read-only: it only narrows what is displayed.
import { useState } from "react";
import type { ErpState } from "@/lib/erp";

export type AnalyticsPeriod = "Today" | "This Week" | "This Month" | "This Year" | "Custom";
/** The order the calendar lists them in. */
export const ANALYTICS_PERIODS: AnalyticsPeriod[] = ["Custom", "Today", "This Week", "This Month", "This Year"];
export type DateRange = { from: number; to: number };

export const localIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function analyticsRange(period: AnalyticsPeriod, custom: [string, string]): DateRange {
  const now = new Date(), start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "This Week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  if (period === "This Month") start.setDate(1);
  if (period === "This Year") { start.setMonth(0); start.setDate(1); }
  if (period === "Custom") { const from = new Date(`${custom[0]}T00:00:00`).getTime(), to = new Date(`${custom[1]}T23:59:59.999`).getTime(); return { from: Number.isFinite(from) ? from : start.getTime(), to: Number.isFinite(to) ? to : now.getTime() }; }
  return { from: start.getTime(), to: now.getTime() };
}

export type HeaderPeriod = {
  period: AnalyticsPeriod | null;
  setPeriod: (p: AnalyticsPeriod | null) => void;
  custom: [string, string];
  setCustom: (c: [string, string]) => void;
  /** Tapping the chosen period again clears it, returning the page to all records. */
  clearable: boolean;
  range: DateRange;
};

/** `null` means no period chosen: the page shows all its records, as it does before any choice. */
export function usePeriod(initial: AnalyticsPeriod | null, clearable = initial === null): HeaderPeriod {
  const [period, setPeriod] = useState<AnalyticsPeriod | null>(initial);
  const [custom, setCustom] = useState<[string, string]>(() => { const now = new Date(); return [localIso(new Date(now.getFullYear(), now.getMonth(), 1)), localIso(now)]; });
  // Worked out on every render: an open-ended period runs up to now, so a record added a moment ago is always inside it.
  const range = period ? analyticsRange(period, custom) : { from: 0, to: Date.now() };
  return { period, setPeriod, custom, setCustom, clearable, range };
}

/** A copy of the records narrowed to the period, for display only. Payments and returns stay whole because a document's
 *  status and balance are worked out from them, whenever they happened. */
export function scopeToPeriod(s: ErpState, p: HeaderPeriod): ErpState {
  if (!p.period) return s;
  const inside = <T extends { at: number }>(rows: T[]) => rows.filter((x) => x.at >= p.range.from && x.at <= p.range.to);
  return { ...s, sales: inside(s.sales), purchases: inside(s.purchases), expenses: inside(s.expenses), payrolls: inside(s.payrolls), commissions: inside(s.commissions), movements: inside(s.movements) };
}
