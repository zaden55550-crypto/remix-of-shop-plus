// Mounted once in __root: keeps Log In, Create Account, Plans and Business Setup (and their windows) on one screen (src/lib/one-page.ts),
// and on a phone held upright tells Setup's visitor, in English and Kiswahili, that turning the phone sideways gives the better view
// (owner, 2026-11-24: the page stays usable upright; the tip can be closed).
import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/use-language";
import { fitOnePage, isOnePageRoute, phoneUpright } from "@/lib/one-page";

export function OnePageFit() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const on = isOnePageRoute(pathname);
  useEffect(() => {
    if (!on) return;
    let frame = 0, timer = 0;
    const run = (reset: boolean) => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => fitOnePage(reset)); };
    // Content that changes (a translation, an error line) is refitted on the next frame, not 120 ms later, so it never shows too big.
    const later = () => run(false);
    const grow = () => { window.clearTimeout(timer); timer = window.setTimeout(() => run(true), 150); };
    run(true);
    const t1 = window.setTimeout(() => run(false), 600), t2 = window.setTimeout(() => run(false), 2000);
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", grow); window.addEventListener("orientationchange", grow); window.addEventListener("shopbook-prefs", grow);
    return () => { mo.disconnect(); cancelAnimationFrame(frame); window.clearTimeout(timer); window.clearTimeout(t1); window.clearTimeout(t2); window.removeEventListener("resize", grow); window.removeEventListener("orientationchange", grow); window.removeEventListener("shopbook-prefs", grow); };
  }, [on, pathname]);
  return pathname === "/setup" ? <TurnSideways /> : null;
}

/** Both languages always (owner, 2026-11-24): many owners haven't changed the language yet when they first reach Setup. */
export const TURN_SIDEWAYS_SW = "Geuza simu yako ilale upande kwa mwonekano bora";
function TurnSideways() {
  const { tr, language } = useLanguage();
  const [upright, setUpright] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    try { setClosed(sessionStorage.getItem("zakrio.setupTilt") === "1"); } catch { /* show */ }
    const f = () => setUpright(phoneUpright());
    f(); window.addEventListener("resize", f); window.addEventListener("orientationchange", f);
    return () => { window.removeEventListener("resize", f); window.removeEventListener("orientationchange", f); };
  }, []);
  if (!upright || closed) return null;
  const close = () => { try { sessionStorage.setItem("zakrio.setupTilt", "1"); } catch { /* this visit only */ } setClosed(true); };
  return <div className="turn-sideways" role="status">
    <RotateCw aria-hidden />
    <div className="turn-sideways-text">
      <b>{language === "Swahili" ? TURN_SIDEWAYS_SW : tr("Turn your phone sideways for the best view")}</b>
      <span lang={language === "Swahili" ? "en" : "sw"}>{language === "Swahili" ? "Turn your phone sideways for the best view" : TURN_SIDEWAYS_SW}</span>
    </div>
    <button type="button" onClick={close}>{tr("OK")}</button>
  </div>;
}
