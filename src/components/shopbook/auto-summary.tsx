// Things the app does by itself while it is open on the owner's device (owner, 2026-11-23), set in Settings › Finance ›
// Connections › Daily summary at closing time. A browser can't wake itself, so each runs while the app is open; anything due while
// it was closed runs the next time it opens that day, once a day at most.
// - Daily summary at closing time, by the business's own WhatsApp Business or SMS connection (`dailySummary`).
// - Expiry alert by SMS: batches expiring within 30 days (`expiryAlertText`), at closing time.
// - Backup by email: today's whole-business backup, emailed to the owner's own address at closing time (backup-email.functions.ts).
// - Supplier orders by WhatsApp: when a product falls to its reorder level, its supplier gets the order (`supplierOrdersDue`),
//   at most once a day per supplier, through the business's WhatsApp Business connection.
// Without a connection nothing is sent; the Dashboard's WhatsApp/SMS buttons and Inventory › Reorder still work by hand.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { moneyFor } from "@/components/shopbook/selling";
import { useLanguage } from "@/hooks/use-language";
import { backupJson } from "@/lib/backup";
import { expiryAlertText, supplierOrdersDue } from "@/lib/day-tools";
import { load } from "@/lib/erp";
import { sendMessage } from "@/lib/integrations.functions";
import { readSettings, saveSettings, type SettingsConfig } from "@/lib/settings-config";
import { store } from "@/lib/shopbook";
import { dailySummary } from "@/lib/whatsapp";

type Auto = NonNullable<SettingsConfig["autoSummary"]>;
const SENT = "shopbook.summarySent";
const today = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const pastClosing = (a: Auto | undefined, now: Date) => {
  if (!a || !/^\d{2}:\d{2}$/.test(a.at)) return false;
  const [h, m] = a.at.split(":").map(Number) as [number, number];
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
};
/** Whether the summary is due now: switched on, past its time today, and not yet sent today. */
export function summaryDue(a: Auto | undefined, now: Date, sentOn: string | null) {
  return !!a?.on && !!a.to && pastClosing(a, now) && sentOn !== today(now);
}
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* may run again */ } };

/** Mounted once in __root. */
export function AutoSummary() {
  const { tr } = useLanguage();
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      const a = readSettings().autoSummary, acc = store.get(), now = new Date(), day = today(now);
      if (busy || !a || !acc || acc.staff || acc.demo || !store.signedIn() || !navigator.onLine) return;
      busy = true;
      const business = acc.shopName ?? "";
      try {
        if (summaryDue(a, now, get(SENT))) {
          await sendMessage({ data: { channel: a.channel, to: a.to, text: dailySummary(load(), { business, money: moneyFor(acc.currency || "KSh"), tr }) } }).then(() => put(SENT, day)).catch(() => undefined);
        }
        if (a.expiry && a.to && pastClosing(a, now) && get("shopbook.expirySent") !== day) {
          const text = expiryAlertText(load(), business, tr);
          if (!text) put("shopbook.expirySent", day);
          else await sendMessage({ data: { channel: "sms", to: a.to, text } }).then(() => put("shopbook.expirySent", day)).catch(() => undefined);
        }
        if (a.backup && pastClosing(a, now) && get("shopbook.backupMailed") !== day) {
          const { emailBackup } = await import("@/lib/backup-email.functions");
          await emailBackup({ data: { business: business || "Zakrio Systems", fileName: `zakrio-systems-backup-${day}.json`, json: backupJson(business) } }).then(() => put("shopbook.backupMailed", day)).catch(() => undefined);
        }
        if (a.orders) {
          const key = `shopbook.ordered@${day}`, done: string[] = JSON.parse(get(key) || "[]");
          for (const o of supplierOrdersDue(load(), business, tr).filter((x) => !done.includes(x.supplier))) {
            try { await sendMessage({ data: { channel: "whatsapp", to: o.phone, text: o.text } }); done.push(o.supplier); put(key, JSON.stringify(done)); } catch { /* not connected: try next minute */ }
          }
        }
      } finally { busy = false; }
    };
    const id = window.setInterval(() => void tick(), 60_000); void tick();
    return () => window.clearInterval(id);
  }, [tr]);
  return null;
}

/** The settings, shown in Connections. */
export function AutoSummaryForm() {
  const { tr } = useLanguage();
  const [v, setV] = useState<Auto>({ on: false, at: "20:00", channel: "whatsapp", to: "" });
  useEffect(() => { const a = readSettings().autoSummary; setV(a ?? { on: false, at: "20:00", channel: "whatsapp", to: store.get()?.phone ?? "" }); }, []);
  const save = () => {
    if ((v.on || v.expiry) && v.to.replace(/\D/g, "").length < 9) { toast.error(tr("Enter the phone number to send it to")); return; }
    saveSettings({ autoSummary: v }); toast.success(tr("Saved"));
  };
  return <section className="connection">
    <header><h4>{tr("Daily summary at closing time")}</h4><span className={v.on ? "is-on" : "is-off"}>{tr(v.on ? "On" : "Off")}</span></header>
    <p className="settings-note">{tr("Sent once a day through your WhatsApp Business or SMS connection while the app is open on this device. If it was closed at that time, it is sent when the app next opens that day.")}</p>
    <div className="connection-grid">
      <label className="inventory-field"><span>{tr("Closing time")}</span><input className="inventory-input" type="time" value={v.at} onChange={(e) => setV({ ...v, at: e.target.value })} /></label>
      <label className="inventory-field"><span>{tr("Send by")}</span><select className="inventory-input" value={v.channel} onChange={(e) => setV({ ...v, channel: e.target.value as Auto["channel"] })}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></label>
      <label className="inventory-field"><span>{tr("Send to")}</span><input className="inventory-input" inputMode="tel" value={v.to} onChange={(e) => setV({ ...v, to: e.target.value })} /></label>
    </div>
    <label className="feature-check"><input type="checkbox" checked={v.on} onChange={(e) => setV({ ...v, on: e.target.checked })} /> {tr("Send it every day")}</label>
    <label className="feature-check"><input type="checkbox" checked={!!v.expiry} onChange={(e) => setV({ ...v, expiry: e.target.checked })} /> {tr("SMS me stock that expires within 30 days")}</label>
    <label className="feature-check"><input type="checkbox" checked={!!v.backup} onChange={(e) => setV({ ...v, backup: e.target.checked })} /> {tr("Email me a backup of my records every night")}</label>
    <label className="feature-check"><input type="checkbox" checked={!!v.orders} onChange={(e) => setV({ ...v, orders: e.target.checked })} /> {tr("Order from suppliers by WhatsApp when stock runs low")}</label>
    <p className="settings-note">{tr("Supplier orders go to the phone saved on each supplier, once a day at most, for products that have a supplier and have sold in the last 4 weeks.")}</p>
    <div className="connection-actions"><ShopButton onClick={save}>{tr("Save")}</ShopButton></div>
  </section>;
}
