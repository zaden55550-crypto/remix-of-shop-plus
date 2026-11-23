// WhatsApp and SMS from the app (owner, 2026-11-23): receipts to the customer's WhatsApp from POS, and the owner's daily summary by
// WhatsApp or SMS. These open the phone's own WhatsApp or messages app with the text ready, so no paid provider is needed; sending
// on a schedule by itself would need an SMS or WhatsApp Business provider on the server.
import { cashSession, payLines, stockStatus, methodLabel, type ErpState } from "@/lib/erp";
import { dialCodeFor } from "@/lib/dial-codes";

/** A phone number as WhatsApp wants it (country code, digits only): "0722 569460" in Kenya → "254722569460". */
export function waNumber(phone: string | undefined, countryCode: string | undefined): string {
  const d = (phone ?? "").replace(/[^\d+]/g, "");
  if (!d) return "";
  if (d.startsWith("+")) return d.slice(1);
  const dial = (countryCode ? dialCodeFor(countryCode) : "").replace(/\D/g, "");
  if (d.startsWith("00")) return d.slice(2);
  if (dial && d.startsWith(dial) && d.length > dial.length + 6) return d;
  if (dial && d.startsWith("0")) return dial + d.slice(1);
  return dial ? dial + d : d;
}
/** A link that opens WhatsApp with the text, to that number or (none given) letting the person choose the chat. */
export const waLink = (text: string, phone?: string, countryCode?: string) => {
  const n = waNumber(phone, countryCode);
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
};
export const smsLink = (text: string, phone?: string) => `sms:${(phone ?? "").replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;

/** Today's summary for the owner: sales, how they were paid, cash in the drawer and what is running low. */
export function dailySummary(s: ErpState, opts: { business: string; money: (n: number) => string; tr: (x: string) => string; now?: Date }): string {
  const { business, money, tr } = opts, now = opts.now ?? new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sales = s.sales.filter((x) => x.at >= start && x.at <= now.getTime());
  const total = sales.reduce((a, x) => a + x.total, 0);
  const byMethod = new Map<string, number>();
  for (const x of sales) for (const [m, v] of payLines(s, x.pay)) byMethod.set(m, (byMethod.get(m) ?? 0) + v);
  const low = s.products.filter((p) => !p.archived && stockStatus(p) !== "OK");
  const drawer = cashSession(s).expected;
  return [
    `${business} · ${tr("Today")} ${now.toLocaleDateString("en-GB")}`,
    `${tr("Sales")}: ${sales.length} · ${money(total)}`,
    ...[...byMethod].filter(([, v]) => v > 0).map(([m, v]) => `- ${m === "credit" ? tr("On credit") : methodLabel(m, s, tr)}: ${money(v)}`),
    `${tr("Cash in the drawer")}: ${money(drawer)}`,
    low.length ? `${tr("Low or out of stock")} (${low.length}): ${low.slice(0, 8).map((p) => `${p.name} (${p.qty})`).join(", ")}${low.length > 8 ? "…" : ""}` : tr("No low stock"),
  ].join("\n");
}
