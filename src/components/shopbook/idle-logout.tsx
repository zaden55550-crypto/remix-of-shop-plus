// Sign out after inactivity (owner, 2026-11-23): on every device, whoever is signed in (owner, staff or the sample shop) is signed out
// after a set time with no tapping, typing or scrolling: 10 minutes unless changed in Settings › Security & Activity › Auto sign-out
// (kept per device). The last activity is shared by every tab, and checked when the app opens, so a browser left closed past the
// time opens at Log In. Half a minute before, a card offers "I'm still here". Nothing recorded is lost: records are saved as they are
// made, and drafts (Setup, purchases) are kept on the device.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { supabase } from "@/integrations/supabase/client";
import { inSampleShop, leaveSampleShop } from "@/lib/sample-shop";
import { store } from "@/lib/shopbook";

const LAST = "shopbook.lastActive", LIMIT = "shopbook.idleMinutes", MSG = "zakrio.idleMessage";
export const IDLE_CHOICES = [5, 10, 15, 30, 60, 0] as const;
export const DEFAULT_IDLE_MINUTES = 10;
export function idleMinutes(): number {
  try { const v = localStorage.getItem(LIMIT); if (v === null) return DEFAULT_IDLE_MINUTES; const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : DEFAULT_IDLE_MINUTES; } catch { return DEFAULT_IDLE_MINUTES; }
}
export function setIdleMinutes(n: number) { try { localStorage.setItem(LIMIT, String(n)); } catch { /* this visit only */ } }
const lastActive = () => { try { return Number(localStorage.getItem(LAST)) || 0; } catch { return 0; } };
const touch = () => { try { localStorage.setItem(LAST, String(Date.now())); } catch { /* none */ } };
/** Milliseconds left before sign-out, or Infinity when switched off. */
export function idleLeft(now = Date.now(), last = lastActive(), minutes = idleMinutes()) {
  if (!minutes) return Infinity;
  return last ? last + minutes * 60_000 - now : minutes * 60_000;
}

async function signOutNow() {
  try { sessionStorage.setItem(MSG, "1"); } catch { /* no message */ }
  if (inSampleShop()) leaveSampleShop();
  else { store.signOut(); try { await supabase.auth.signOut({ scope: "local" }); } catch { /* offline: the device sign-out stands */ } }
  window.location.replace("/");
}

export function IdleLogout() {
  const { tr } = useLanguage();
  const [warn, setWarn] = useState<number | null>(null);
  useEffect(() => {
    try { if (sessionStorage.getItem(MSG)) { sessionStorage.removeItem(MSG); toast(tr("You were signed out because the app wasn't used for a while.")); } } catch { /* none */ }
    // Opening the app after the time has passed signs out straight away.
    if (store.signedIn() && lastActive() && idleLeft() <= 0) { void signOutNow(); return; }
    if (store.signedIn()) touch();
    let lastWrite = Date.now();
    const active = () => { if (Date.now() - lastWrite > 10_000) { lastWrite = Date.now(); touch(); } setWarn(null); };
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, active, { passive: true, capture: true }));
    const id = window.setInterval(() => {
      if (!store.signedIn()) { setWarn(null); return; }
      const left = idleLeft();
      if (left <= 0) void signOutNow();
      else setWarn(left <= 30_000 ? Math.ceil(left / 1000) : null);
    }, 1000);
    return () => { events.forEach((e) => window.removeEventListener(e, active, { capture: true })); window.clearInterval(id); };
  }, [tr]);
  if (warn === null) return null;
  return <div className="idle-warn" role="alertdialog" aria-live="assertive">
    <b>{tr("Still there?")}</b>
    <span>{tr("You will be signed out in")} {warn} {tr("seconds")}</span>
    <button type="button" onClick={() => { touch(); setWarn(null); }}>{tr("I'm still here")}</button>
  </div>;
}

/** Settings › Security & Activity › Auto sign-out. */
export function IdleSetting() {
  const { tr } = useLanguage();
  const [v, setV] = useState<number>(DEFAULT_IDLE_MINUTES);
  useEffect(() => setV(idleMinutes()), []);
  return <div className="inventory-field">
    <span>{tr("Sign out after no use for")}</span>
    <select className="inventory-input" value={v} onChange={(e) => { const n = Number(e.target.value); setV(n); setIdleMinutes(n); touch(); toast.success(tr("Saved")); }}>
      {IDLE_CHOICES.map((n) => <option key={n} value={n}>{n ? `${n} ${tr("minutes")}` : tr("Never")}</option>)}
    </select>
    <small className="settings-note">{tr("For this device. Anyone signed in is signed out after this long without tapping or typing.")}</small>
  </div>;
}
