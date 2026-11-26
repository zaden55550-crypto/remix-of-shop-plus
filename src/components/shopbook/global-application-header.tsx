// The one application header: every one of the 13 apps renders this component, so changing it changes them all.
// < Apps | Online — SHOP NAME / app name — notifications · theme · calendar · profile. Styles: the dash-header block in styles.css.
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Building2, CalendarDays, Check, ChevronLeft, ChevronRight, Info, LayoutGrid, MapPin, Moon, Settings as SettingsIcon, Store, Sun, Users } from "lucide-react";
import { APPS } from "@/lib/shopbook";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { businessView, useErp, useShopErp } from "@/components/shopbook/product-search";
import { useTheme } from "@/components/shopbook/ui";
import { useLanguage } from "@/hooks/use-language";
import { cachedAnnouncements, dismissedIds, visibleAnnouncements, type Announcement } from "@/lib/announcements";
import { businessAlerts } from "@/lib/dashboard";
import { activeBusiness, listBusinesses, selectedShop, selectBusiness, selectShop } from "@/lib/erp";
import { isActiveLocation, listLocations } from "@/lib/locations";
import { toCurrencySymbol } from "@/lib/exact-amount";
import { useSyncStatus } from "@/lib/shop-sync";
import { store } from "@/lib/shopbook";
import { ANALYTICS_PERIODS, type HeaderPeriod } from "@/lib/period";
import { cn } from "@/lib/utils";

const POPOVER = "absolute end-0 top-full mt-1.5 z-50 rounded-xl border border-border/60 dark:border-white/10 backdrop-blur-xl shadow-2xl dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)]";
const MENU_ROW = "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-xs text-foreground hover:bg-muted dark:hover:bg-white/10";

/** The header bell: the Dashboard's Actionable Alerts plus system messages saved on this device. Reads only. */
function NotificationBell({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { tr } = useLanguage();
  const s = useShopErp();
  const sync = useSyncStatus();
  const [notices, setNotices] = useState<Announcement[]>([]);
  useEffect(() => setNotices(visibleAnnouncements(cachedAnnouncements().list, Date.now(), dismissedIds())), [open]);
  const alerts = businessAlerts(s, { cur: toCurrencySymbol(store.get()?.currency || "KSh"), tr, sync });
  const count = alerts.length + notices.length;
  const label = count ? `${tr("Notifications")}: ${count}` : tr("Notifications");
  return (
    <div className="dash-bell-wrap relative">
      <button type="button" onClick={() => setOpen(!open)} className="dash-hbtn dash-round dash-bell" title={label} aria-label={label} aria-expanded={open}>
        <Bell />
        {count > 0 && <span className="dash-bell-count">{count > 9 ? "9+" : count}</span>}
      </button>
      {open && (
        <div className={cn(POPOVER, "dash-bell-pop bg-popover/95")}>
          <div className="dash-bell-title">{tr("Notifications")}</div>
          {notices.map((n) => (
            <div key={n.id} className="dash-bell-row">
              <Info />
              <span>{n.message}</span>
            </div>
          ))}
          {alerts.map((a) => (
            <Link key={a.id} to={a.go.to} search={a.go.search} className="dash-bell-row" onClick={() => setOpen(false)}>
              <i className={`is-${a.tone}`} />
              <span>{a.title}</span>
              <ChevronRight className="rtl:rotate-180" />
            </Link>
          ))}
          {!count && <div className="dash-bell-none">{tr("No urgent alerts right now")}</div>}
        </div>
      )}
    </div>
  );
}

export function GlobalApplicationHeader({
  title,
  shop,
  moduleFirst = false,
  menus = [],
  menu,
  onMenu,
  period,
  branded = false,
}: {
  title: string;
  shop: string;
  /** Put the module name first and the shop name second in app screens; Dashboard keeps its benchmark order. */
  moduleFirst?: boolean;
  /** The app's own sections, listed in the profile menu. */
  menus?: string[];
  menu?: string;
  onMenu?: (m: string) => void;
  /** The page's working period. A page that cannot filter by date passes nothing and has no calendar. */
  period?: HeaderPeriod | undefined;
  branded?: boolean | undefined;
}) {
  const nav = useNavigate();
  const { tr } = useLanguage();
  const { dark, toggle } = useTheme();
  const [calOpen, setCalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const whole = useErp();
  // An owner with several businesses chooses which one they are working in. An employee's login decides theirs, so they get no choice.
  const businesses = store.get()?.staff ? [] : listBusinesses(whole);
  const activeBiz = activeBusiness(whole);
  // An owner with several shops chooses which one they are working in. An employee's login decides theirs, so they get no choice.
  // Only the open business's shops: a shop of another business can never be chosen here.
  const shops = store.get()?.staff ? [] : listLocations(businessView(whole)).filter((l) => isActiveLocation(l) && l.type === "shop");
  const chosen = selectedShop(whole), chosenName = shops.length > 1 && chosen ? shops.find((l) => l.id === chosen)?.name : undefined;
  // Working in one shop: that shop's own name (Kilimani), not "Business · Kilimani". All shops: the business name.
  const name = chosenName || shop;
  const bizName = businesses.find((b) => b.id === activeBiz)?.name || shop;
  const initials = name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  const inventoryHeader = moduleFirst && title === "Inventory";
  const go = (to: string) => { setMenuOpen(false); nav({ to }); };

  return (
    <div className="dash-header app-header-bar">
      <div className="dash-header-row">
        <div className={cn("dash-header-left", inventoryHeader && "inventory-header-left")}>
          <Link to="/apps" className="dash-hbtn dash-apps dash-apps-control" title={tr("Back to Apps")} aria-label={tr("Back to Apps")}>
            <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
            <LayoutGrid aria-hidden="true" />
            <span>{tr("Apps")}</span>
          </Link>
          <span className="dash-divider" />
          {inventoryHeader ? <><span className="app-header-module inventory-header-module-desktop">{tr(title)}</span><span className="dash-divider inventory-header-divider-desktop" /></> : !branded && (moduleFirst || title === "Dashboard") && <><span className="app-header-module app-header-module-desktop">{tr(title)}</span><span className="dash-divider app-header-divider-desktop" /></>}
          {branded && <span className="app-header-module app-header-module-phone">{tr(title)}</span>}
          <ConnectionStatus />
        </div>

        <div className={cn("dash-header-title", moduleFirst && "dash-header-title--module-first", inventoryHeader && "inventory-header-title--center")}>
          {inventoryHeader ? (
            <>
              <span className="app-header-module inventory-header-module-mobile">{tr(title)}</span>
              <span className="app-header-title-divider inventory-header-divider-mobile" aria-hidden="true" />
              <h1>{name.toUpperCase()}</h1>
            </>
          ) : moduleFirst ? (
            <>
              <span className="app-header-module">{tr(title)}</span>
              <span className="app-header-title-divider" aria-hidden="true" />
              <h1>{name.toUpperCase()}</h1>
            </>
          ) : (
            <>
              <h1>{name.toUpperCase()}</h1>
              <span>{tr(title)}</span>
            </>
          )}
        </div>

        <div className="dash-header-right">
          <NotificationBell open={bellOpen} setOpen={(v) => { setBellOpen(v); if (v) { setCalOpen(false); setMenuOpen(false); } }} />

          <button
            type="button"
            onClick={toggle}
            className="dash-hbtn dash-round"
            title={dark ? tr("Switch to Light Mode") : tr("Switch to Dark Mode")}
            aria-label={tr("Toggle Theme")}
          >
            {dark ? <Sun className="text-amber-400" /> : <Moon className="text-muted-foreground" />}
          </button>

          {period && (
            <div className="relative">
              <button
                type="button"
                onClick={() => { setCalOpen(!calOpen); setMenuOpen(false); setBellOpen(false); }}
                className={cn("dash-hbtn dash-round", period.period && "dash-cal-on")}
                title={period.period ? `${tr("Period")}: ${tr(period.period)}` : tr("Period")}
                aria-label={period.period ? `${tr("Period")}: ${tr(period.period)}` : tr("Period")}
                aria-haspopup="menu"
                aria-expanded={calOpen}
              >
                <CalendarDays className="text-sky-400" />
              </button>
              {calOpen && (
                <div role="menu" className={cn(POPOVER, "w-56 bg-popover/95 p-2 space-y-1")}>
                  {ANALYTICS_PERIODS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="menuitemradio"
                      aria-checked={period.period === p}
                      onClick={() => {
                        period.setPeriod(period.period === p && period.clearable && p !== "Custom" ? null : p);
                        if (p !== "Custom") setCalOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer",
                        period.period === p ? "bg-primary text-primary-foreground font-bold shadow-xs" : "text-foreground hover:bg-muted dark:hover:bg-white/10",
                      )}
                    >
                      <span>{tr(p)}</span>
                      {period.period === p && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                  {period.period === "Custom" && (
                    <div className="space-y-1.5 border-t border-border/50 pt-2 dark:border-white/10">
                      <label className="block text-[11px] font-semibold text-muted-foreground">{tr("From")}
                        <input type="date" value={period.custom[0]} max={period.custom[1]} onChange={(e) => period.setCustom([e.target.value, period.custom[1]])} className="mt-0.5 w-full px-2 py-1 text-xs" />
                      </label>
                      <label className="block text-[11px] font-semibold text-muted-foreground">{tr("To")}
                        <input type="date" value={period.custom[1]} min={period.custom[0]} onChange={(e) => period.setCustom([period.custom[0], e.target.value])} className="mt-0.5 w-full px-2 py-1 text-xs" />
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => { setMenuOpen(!menuOpen); setCalOpen(false); setBellOpen(false); }}
              className="dash-hbtn dash-round dash-avatar"
              title={name}
              aria-label={tr("Shop Menu")}
              aria-expanded={menuOpen}
            >
              {initials}
            </button>
            {menuOpen && (
              <div className={cn(POPOVER, "w-56 bg-popover/90 p-2 space-y-1")}>
                <div className="px-2 py-1 border-b border-border/60 mb-1">
                  <div className="text-xs font-bold text-foreground truncate">{bizName}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center justify-between mt-0.5">
                    <span className="capitalize">{store.get()?.plan || "Basic"} Plan</span>
                    <Link to="/plans" className="text-primary hover:underline font-semibold">{tr("Manage")}</Link>
                  </div>
                </div>
                {/* One business at a time: records are never shown mixed, so there is no "all businesses" choice. */}
                {businesses.length > 1 && businesses.map((b) => (
                  <button key={b.id} type="button" onClick={() => { setMenuOpen(false); selectBusiness(b.id); }} className={cn(MENU_ROW, activeBiz === b.id && "font-bold")} aria-pressed={activeBiz === b.id}>
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    {activeBiz === b.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
                {!store.get()?.staff && (
                  <Link to="/businesses" onClick={() => setMenuOpen(false)} className={MENU_ROW}>
                    <Building2 className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="min-w-0 flex-1 truncate">{tr("Manage businesses")}</span>
                  </Link>
                )}
                {shops.length > 1 && [{ id: null as string | null, name: tr("All Shops") }, ...shops].map((l) => (
                  <button key={l.id ?? "all"} type="button" onClick={() => { setMenuOpen(false); selectShop(l.id); }} className={cn(MENU_ROW, chosen === l.id && "font-bold")} aria-pressed={chosen === l.id}>
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    {chosen === l.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
                {/* Go straight to another app without going back to the Apps page (owner, 2026-11-26). */}
                <div className="app-switch" role="group" aria-label={tr("Go to another app")}>
                  <div className="app-switch-title">{tr("Go to another app")}</div>
                  <div className="app-switch-grid">
                    {APPS.filter((a) => a.name !== title).map((a) => (
                      <button key={a.id} type="button" className="app-switch-btn" title={tr(a.name)} onClick={() => go(`/${a.id}`)}>
                        <img src={a.iconDark} alt="" /><span>{tr(a.name)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                {menus.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMenuOpen(false); onMenu?.(m); }}
                    className={cn(MENU_ROW, menu === m && "font-bold")}
                  >
                    {tr(m)}
                  </button>
                ))}
                {!store.get()?.staff && <button type="button" onClick={() => go("/setup")} className={MENU_ROW}>
                  <Store className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{tr("Business Setup")}</span>
                </button>}
                <button type="button" onClick={() => go("/settings")} className={MENU_ROW}>
                  <SettingsIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{tr("Settings")}</span>
                </button>
                <button type="button" onClick={() => go("/settings")} className={MENU_ROW}>
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{tr("Business Profile")}</span>
                </button>
                <button type="button" onClick={() => go("/settings")} className={MENU_ROW}>
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{tr("Business Switcher")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
