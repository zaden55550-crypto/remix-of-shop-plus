// Daily summary at closing time (owner, 2026-11-23): at the time set in Settings › Finance › Connections, today's summary
// (`dailySummary`) is sent once a day through the business's own WhatsApp Business or SMS connection. It runs while the app is open
// on this device (a browser can't wake itself); if the app was closed at that time it sends the next time it opens the same day.
// Without a connection nothing is sent and the Dashboard's WhatsApp/SMS buttons stay the way to send it.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { moneyFor } from "@/components/shopbook/selling";
import { useLanguage } from "@/hooks/use-language";
import { load } from "@/lib/erp";
import { sendMessage } from "@/lib/integrations.functions";
import { readSettings, saveSettings, type SettingsConfig } from "@/lib/settings-config";
import { store } from "@/lib/shopbook";
import { dailySummary } from "@/lib/whatsapp";

type Auto = NonNullable<SettingsConfig["autoSummary"]>;
const SENT = "shopbook.summarySent";
const today = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
/** Whether the summary is due now: switched on, past its time today, and not yet sent today. */
export function summaryDue(a: Auto | undefined, now: Date, sentOn: string | null) {
  if (!a?.on || !a.to || !/^\d{2}:\d{2}$/.test(a.at)) return false;
  const [h, m] = a.at.split(":").map(Number) as [number, number];
  return now.getHours() * 60 + now.getMinutes() >= h * 60 + m && sentOn !== today(now);
}

/** Mounted once in __root. */
export function AutoSummary() {
  const { tr } = useLanguage();
  useEffect(() => {
    let busy = false;
    const tick = async () => {
      const a = readSettings().autoSummary, acc = store.get();
      let sent: string | null = null; try { sent = localStorage.getItem(SENT); } catch { /* none */ }
      if (busy || !acc || !store.signedIn() || !summaryDue(a, new Date(), sent) || !navigator.onLine) return;
      busy = true;
      try {
        const text = dailySummary(load(), { business: acc.shopName ?? "", money: moneyFor(acc.currency || "KSh"), tr });
        await sendMessage({ data: { channel: a!.channel, to: a!.to, text } });
        try { localStorage.setItem(SENT, today()); } catch { /* may send again */ }
      } catch { /* not connected or offline: try again next minute, once a day at most */ } finally { busy = false; }
    };
    const id = window.setInterval(() => void tick(), 60_000); void tick();
    return () => window.clearInterval(id);
  }, [tr]);
  return null;
}

/** The setting, shown in Connections. */
export function AutoSummaryForm() {
  const { tr } = useLanguage();
  const [v, setV] = useState<Auto>({ on: false, at: "20:00", channel: "whatsapp", to: "" });
  useEffect(() => { const a = readSettings().autoSummary; setV(a ?? { on: false, at: "20:00", channel: "whatsapp", to: store.get()?.phone ?? "" }); }, []);
  const save = () => {
    if (v.on && v.to.replace(/\D/g, "").length < 9) { toast.error(tr("Enter the phone number to send it to")); return; }
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
    <div className="connection-actions"><ShopButton onClick={save}>{tr("Save")}</ShopButton></div>
  </section>;
}
