// Mounted once at the root. On an employee login it keeps access current, sends them away from pages they may not open,
// and asks which location they are working at when they have more than one.
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { store } from "@/lib/shopbook";
import { chooseStaffLocation, startStaffMonitor } from "@/lib/staff-session";
import { staffMayOpen } from "@/lib/staff-access";

export function StaffGate() {
  const { tr } = useLanguage();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [, tick] = useState(0);
  const [picking, setPicking] = useState(false);
  // Read after mounting: the server has no device storage, and the first paint must match what it sent.
  const [mounted, setMounted] = useState(false);
  const staff = mounted ? store.get()?.staff : undefined;

  useEffect(() => {
    setMounted(true);
    const f = () => tick((n) => n + 1);
    window.addEventListener("shopbook-staff", f); window.addEventListener("shopbook-session", f);
    return () => { window.removeEventListener("shopbook-staff", f); window.removeEventListener("shopbook-session", f); };
  }, []);
  const active = Boolean(staff);
  useEffect(() => (active ? startStaffMonitor() : undefined), [active]);
  // A sale made offline can be refused later, once the server sees the real stock. The person who made it has to hear about it.
  useEffect(() => {
    const f = (e: Event) => toast.error(`${tr("A sale could not be recorded")}: ${(e as CustomEvent<string>).detail}`, { duration: 15000 });
    window.addEventListener("shopbook-staff-refused", f);
    return () => window.removeEventListener("shopbook-staff-refused", f);
  }, [tr]);
  const perms = staff?.permissions.join();
  useEffect(() => {
    if (!active || !store.signedIn()) return;
    if (!staffMayOpen(pathname, store.get()?.staff?.permissions ?? [])) nav({ to: "/apps", replace: true });
  }, [active, pathname, perms, nav]);

  if (!staff || !store.signedIn() || pathname !== "/apps" || staff.locations.length < 2) return null;
  const current = staff.locations.find((l) => l.id === staff.activeLocationId);
  if (current && !picking) return <button type="button" className="pw-btn staff-place" onClick={() => setPicking(true)}><MapPin /><span>{current.name}</span></button>;
  return <div className="glass-scrim" role="dialog" aria-modal="true" aria-label={tr("Choose your location")}>
    <div className="glass-card staff-picker">
      <h2>{tr("Choose your location")}</h2>
      {staff.locations.map((l) => <button key={l.id} type="button" className={`pw-btn${l.id === staff.activeLocationId ? " is-on" : ""}`} onClick={() => { chooseStaffLocation(l.id); setPicking(false); }}><MapPin /><span>{l.name} • {tr(l.kind === "shop" ? "Shop" : "Warehouse")}</span></button>)}
    </div>
  </div>;
}
