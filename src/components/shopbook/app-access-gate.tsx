// Route-level app protection. Mounted once in __root: whatever URL is typed or linked, an app page opens only when the open
// business's launcher has it (app-registry.ts: required by its business type, allowed for this login, not hidden, not locked by
// the plan). Otherwise it goes back to the Apps launcher. Pages outside the apps (sign-in, Apps, Businesses, Plans, Setup…) always open.
// It re-checks on every route change, business switch, settings change and session or staff-access change.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { appOfPath, launcherFor, mayOpenPath } from "@/lib/app-registry";
import { tillMayOpen } from "@/lib/till-cashier";
import { forOpenBusiness } from "@/lib/businesses";
import { subscribe } from "@/lib/erp";
import { readSettings } from "@/lib/settings-config";
import { businessTypesOf, store } from "@/lib/shopbook";
import { translateCurrent } from "@/lib/interface-translations";

/** Whether the signed-in account may open this page in the business open now. True when nobody is signed in (sign-in decides then). */
export function pageAllowed(path: string): boolean {
  const raw = store.get();
  if (!raw || !store.signedIn()) return true;
  const acct = forOpenBusiness(raw);
  return mayOpenPath(path, launcherFor({ industryFamilyId: acct.industryFamilyId, businessType: businessTypesOf(acct)[0], account: acct, hiddenApps: readSettings().hiddenApps }));
}

export function AppAccessGate() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const again = () => setVersion((n) => n + 1);
    const events = ["shopbook-settings", "shopbook-session", "shopbook-staff", "shopbook-cashier"];
    for (const e of events) window.addEventListener(e, again);
    const stop = subscribe(again); // a business switch or a change to the business's records
    return () => { for (const e of events) window.removeEventListener(e, again); stop(); };
  }, []);
  useEffect(() => {
    if (!tillMayOpen(pathname)) {
      toast.error(translateCurrent("A cashier is on this till. End their turn to open other screens."));
      void nav({ to: "/pos", replace: true });
      return;
    }
    if (!appOfPath(pathname) || pageAllowed(pathname)) return;
    toast.error(translateCurrent("This app is not available for this business"));
    void nav({ to: "/apps", replace: true });
  }, [pathname, version, nav]);
  return null;
}
