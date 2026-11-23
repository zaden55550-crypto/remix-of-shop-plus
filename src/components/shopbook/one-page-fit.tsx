// Mounted once in __root: keeps Log In, Create Account, Plans and Business Setup (and their windows) on one screen (src/lib/one-page.ts),
// and on a phone held upright covers Setup with a "turn your phone sideways" card.
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
    const later = () => { window.clearTimeout(timer); timer = window.setTimeout(() => run(false), 120); };
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

function TurnSideways() {
  const { tr } = useLanguage();
  const [upright, setUpright] = useState(false);
  useEffect(() => {
    const f = () => setUpright(phoneUpright());
    f(); window.addEventListener("resize", f); window.addEventListener("orientationchange", f);
    return () => { window.removeEventListener("resize", f); window.removeEventListener("orientationchange", f); };
  }, []);
  if (!upright) return null;
  return <div className="turn-sideways" role="alert">
    <RotateCw aria-hidden />
    <b>{tr("Turn your phone sideways")}</b>
    <span>{tr("Business Setup needs the wide view. Hold your phone sideways to see everything.")}</span>
  </div>;
}
