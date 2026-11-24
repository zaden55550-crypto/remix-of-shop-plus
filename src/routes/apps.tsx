import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, Building2, ChevronDown, ChevronUp, HelpCircle, LayoutGrid, Lock, LogOut, MapPin, Store, UserRound, X } from "lucide-react";
import { ManageShops } from "@/components/shopbook/manage-shops";
import { toast } from "sonner";
import { ThemeToggle, useTheme } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { APPS, PLANS, businessTypesOf, canOpen, chatIcons, store, trialDaysLeft, type Account } from "@/lib/shopbook";
import { allowedApps } from "@/lib/staff-access";
import { INDUSTRY_TILE_TONE } from "@/lib/industry-config";
import { launcherFor } from "@/lib/app-registry";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings-config";
import { HelpChat } from "@/components/shopbook/help-chat";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { AnnouncementBanner } from "@/components/shopbook/announcement-banner";
import { DownloadRecords } from "@/components/shopbook/plan-loss";
import { TrialBanner } from "@/components/shopbook/trial-banner";
import { useLanguage } from "@/hooks/use-language";
import { type TKey } from "@/lib/i18n";
import { signOutUnified } from "@/lib/auth-service";
import { forOpenBusiness } from "@/components/shopbook/selling";
import { subscribe } from "@/lib/erp";

export const Route = createFileRoute("/apps")({
  head: () => ({
    meta: [
      { title: "Apps — Zakrio Systems" },
      { name: "description", content: "Access your business apps: POS, Inventory, Sales, Accounting, and more." },
      { property: "og:title", content: "Apps — Zakrio Systems" },
      { property: "og:description", content: "Access your business apps on Zakrio Systems." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Apps,
});

const ROUTES: Record<
  string,
  | "/dashboard"
  | "/inventory"
  | "/purchases"
  | "/sales"
  | "/pos"
  | "/expenses"
  | "/contacts"
  | "/accounting"
  | "/float"
  | "/payroll"
  | "/reports"
  | "/summary"
  | "/settings"
> = {
  dashboard: "/dashboard",
  inventory: "/inventory",
  purchases: "/purchases",
  sales: "/sales",
  pos: "/pos",
  expenses: "/expenses",
  contacts: "/contacts",
  accounting: "/accounting",
  float: "/float",
  payroll: "/payroll",
  reports: "/reports",
  summary: "/summary",
  settings: "/settings",
};
const SETTINGS_APP = APPS.find((a) => a.id === "settings");
/** Glass tint per app tile, taken from each icon's own colour (Liquid Glass launcher). */
const TILE_TONE: Record<string, string> = {
  dashboard: "#3b82f6", inventory: "#22c55e", purchases: "#a855f7", sales: "#ec4899", pos: "#3b82f6", expenses: "#d946ef",
  contacts: "#06b6d4", float: "#3b82f6", accounting: "#3b82f6", payroll: "#8b5cf6", reports: "#22c55e", summary: "#06b6d4", settings: "#64748b",
};

function Apps() {
  const nav = useNavigate();
  const { t, dir, tr } = useLanguage();
  const { dark } = useTheme();
  const [acct, setAcct] = useState<Account | null>(null);
  const [cfg, setCfg] = useSettings();

  // Launcher apps: exclude settings and apps marked as hidden
  // The open business's apps, from its industry and business type (app-registry.ts): Trade keeps all 13, another industry gets its
  // shared apps and its own planned modules, never the Trade apps as if they were its environment.
  const launcher = acct ? launcherFor({ industryFamilyId: acct.industryFamilyId, businessType: businessTypesOf(acct)[0], account: acct, hiddenApps: cfg.hiddenApps }) : undefined;
  const shown = launcher?.apps ?? [];
  const [locked, setLocked] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [panel, setPanel] = useState<null | "profile" | "manageApps" | "shops">(null);
  const [chat, setChat] = useState(false);

  useEffect(() => {
    const a = store.get();
    if (!a || !store.signedIn()) {
      nav({ to: "/", replace: true });
      return;
    }
    if (!a.plan) {
      nav({ to: "/plans", replace: true });
      return;
    }
    // The open business's name, currency and industry (its own apps and modules); the first business is the account itself.
    const show = () => { const now = store.get(); if (now) setAcct((prev) => { const next = forOpenBusiness(now); return prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next; }); };
    show();
    const onSession = () => {
      if (!store.signedIn()) {
        setAcct(null);
        nav({ to: "/", replace: true });
      }
    };
    window.addEventListener("shopbook-session", onSession);
    const stop = subscribe(show);
    return () => { window.removeEventListener("shopbook-session", onSession); stop(); };
  }, [nav]);

  // One screen: html and .app-screen zooms both scale viewport units, so measure the real zoom
  // (drawn size / CSS size) and give the page exactly the visible height below its top.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!acct) return;
    const zoomOf = (el: Element) => el.getBoundingClientRect().width / parseFloat(getComputedStyle(el).width) || 1;
    const fit = () => {
      const m = mainRef.current;
      if (!m) return;
      const top = m.getBoundingClientRect().top + window.scrollY;
      const bottomPad = parseFloat(getComputedStyle(document.body).paddingBottom) * zoomOf(document.body);
      m.style.height = `${(window.innerHeight - top - bottomPad) / zoomOf(m)}px`;
    };
    const frame = () => requestAnimationFrame(fit);
    frame();
    window.addEventListener("resize", frame);
    return () => window.removeEventListener("resize", frame);
  }, [acct]);

  if (!acct) return <main className="app-screen" />;

  const days = trialDaysLeft(acct);
  // The subscription is the owner's; an employee sees Settings only if it was granted.
  const settingsTile = !acct.staff || allowedApps(acct.staff.permissions).some((id) => id === "settings") ? SETTINGS_APP : undefined;
  const planLabel =
    acct.plan === "trial"
      ? t("fullTrial")
      : t("planSuffix", (acct.plan ?? "").charAt(0).toUpperCase() + (acct.plan ?? "").slice(1));
  const appName = (id: string): string => t(id as TKey) ?? id;

  const openApp = (ok: boolean, name: string) => {
    if (ok) toast(t("comingNext", name));
    else setLocked(name);
  };

  // Toggle app active/deactivated state in launcher
  const toggleAppVisibility = (appId: string) => {
    const isHidden = cfg.hiddenApps.includes(appId);
    const nextHidden = isHidden ? cfg.hiddenApps.filter((id) => id !== appId) : [...cfg.hiddenApps, appId];
    setCfg({ hiddenApps: nextHidden });
    toast.success(
      isHidden
        ? tr(`Activated ${appName(appId)} on your home screen`)
        : tr(`Deactivated ${appName(appId)} from home screen`),
    );
  };

  const renderApp = (app: (typeof APPS)[number]) => {
    const ok = canOpen(acct, app.tier);
    return (
      <ShopButton
        variant="bare"
        key={app.id}
        onClick={() => (ok && ROUTES[app.id] ? nav({ to: ROUTES[app.id]! }) : openApp(ok, appName(app.id)))}
        className="apps-tile min-w-0 flex-col items-center cursor-pointer"
        style={{ "--tone": TILE_TONE[app.id] ?? "#3b82f6" } as React.CSSProperties}
      >
        <span className="apps-icon relative flex aspect-square items-center justify-center">
          <span className="block h-full w-full">
            <img
              src={dark ? app.iconDark : app.icon}
              alt=""
              className={cn("h-full w-full object-contain", app.id === "inventory" && "scale-[1.18]")}
            />
          </span>
          {!ok && (
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-card/90 shadow border border-border/80 text-foreground">
              <Lock className="h-3 w-3" />
            </span>
          )}
        </span>
        <span className="apps-label w-full text-center font-black leading-tight tracking-wide text-foreground">
          {appName(app.id)}
        </span>
      </ShopButton>
    );
  };

  const renderPlanned = (tile: { id: string; name: string }) => (
    <ShopButton
      variant="bare"
      key={tile.id}
      onClick={() => openApp(false, tile.name)}
      className="apps-tile apps-tile-planned min-w-0 flex-col items-center cursor-pointer opacity-80"
      style={{ "--tone": INDUSTRY_TILE_TONE[tile.id] ?? "#64748b" } as React.CSSProperties}
    >
      <span className="apps-icon relative flex aspect-square items-center justify-center">
        <span className="grid h-full w-full place-items-center rounded-full bg-card/60 border border-dashed border-border/80">
          <LayoutGrid className="h-6 w-6 text-muted-foreground" />
        </span>
        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-500/90 text-white text-[10px] font-black">
          !
        </span>
      </span>
      <span className="apps-label w-full text-center font-black leading-tight tracking-wide text-foreground">
        {tile.name}
      </span>
    </ShopButton>
  );

  // Planned industry modules are catalogued but their operational ERP is not implemented yet. Show them as
  // ghost tiles so a business sees what is coming for its industry; they never open.
  const plannedTiles = launcher?.planned ?? [];

  return (
    <main
      ref={mainRef}
      dir={dir}
      className="app-screen apps-home apps-glass relative flex flex-col overflow-hidden px-3 pb-2 pt-[clamp(0.5rem,2dvh,1rem)] sm:px-6 md:px-10"
    >
      {/* =========================================================================
          HEADER: APP LOGO (LEFT) | CAPITAL SHOP NAME (CENTER) | AVATAR (RIGHT)
         ========================================================================= */}
      <header className="apps-header flex items-center justify-between shrink-0">
        {/* TOP LEFT: APP LOGO + APP NAME + ONLINE/OFFLINE INDICATOR */}
        <div className="apps-header-side flex items-center shrink-0">
          <div className="apps-glass-logo shrink-0 grid place-items-center">
            <img src={"/SHOP_PLUS_3D_Transparent_Icons/shopplus-logo-512.png"} alt="Zakrio Systems" className="h-full w-full object-contain rounded-full" />
          </div>
          <span className="apps-brand font-black tracking-tight text-foreground whitespace-nowrap">
            Zakrio <span className="text-primary">Systems</span>
          </span>
          <ConnectionStatus />
        </div>

        {/* CENTER: SHOP NAME IN CAPITAL LETTERS ALWAYS + SMALL PLAN BADGE */}
        <div className="apps-shop flex-1 min-w-0 flex items-center justify-center text-center">
          <h1 className="apps-shop-name truncate font-black tracking-wider text-foreground uppercase">
            {(acct.shopName || "").toUpperCase()}
          </h1>
          {!acct.staff && <div className="flex items-center shrink-0">
            <span
              className={cn(
                "apps-plan rounded font-black uppercase tracking-wider shrink-0",
                acct.plan === "business"
                  ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                  : acct.plan === "growth"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                    : acct.plan === "trial"
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
              )}
            >
              {acct.plan === "trial" ? tr("TRIAL") : acct.plan ? acct.plan.toUpperCase() : tr("BASIC")}
            </span>
            {/* The owner's businesses: open another one or create one. Separate from the apps, so the launcher grid is unchanged. */}
            <button
              type="button"
              onClick={() => nav({ to: "/businesses" })}
              aria-label={tr("Switch business")}
              title={`${tr("Switch business")}${acct.businessType ? ` · ${tr(acct.businessType)}` : ""}`}
              className="apps-switch-business ms-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-emerald-500/50 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
            >
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>}
        </div>

        {/* TOP RIGHT: NOTIFICATION BELL | SUN/MOON THEME | SHOP LOGO / DEFAULT AVATAR PROFILE */}
        <div className="apps-header-side flex items-center shrink-0">
          {/* Notification Button */}
          <ShopButton
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            className="apps-gbtn apps-bell cursor-pointer relative"
            onClick={() => toast.info(tr("No new unread system notifications."))}
          >
            <Bell className="h-4 w-4" />
          </ShopButton>

          {/* Sun & Moon Theme Toggle */}
          <ThemeToggle />

          {/* FAR RIGHT: SHOP LOGO (IF UPLOADED) OR DEFAULT AVATAR PROFILE ICON IN CIRCLE */}
          <button
            type="button"
            aria-label="Business Profile & Settings"
            onClick={() => {
              setProfileOpen(true);
              setPanel(null);
            }}
            className="apps-gbtn apps-gbtn-profile grid shrink-0 place-items-center overflow-hidden cursor-pointer"
          >
            {acct.logo ? (
              <img src={acct.logo} alt={acct.shopName} className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-4.5 w-4.5 sm:h-5 sm:w-5 text-primary" />
            )}
          </button>
        </div>
      </header>

      <div className="mt-1">
        <AnnouncementBanner />
      </div>

      {acct.plan === "trial" && !acct.staff && (
        <TrialBanner days={days} className="apps-glass-banner mt-2" />
      )}

      {/* Launcher fills the remaining height; icons size from it so every app fits on one screen */}
      <div
        className="apps-launcher"
        style={{ "--app-rows": Math.ceil((shown.length + plannedTiles.length) / 4) + (settingsTile ? 1 : 0) } as React.CSSProperties}
      >
        <div className="apps-grid">
          {shown.map(renderApp)}
          {plannedTiles.map(renderPlanned)}
          {settingsTile && <div className="apps-grid-settings">{renderApp(settingsTile)}</div>}
        </div>
        {plannedTiles.length > 0 && (
          <p className="apps-planned-note text-center text-xs text-muted-foreground mt-2">
            {tr("Industry modules coming soon:")} {plannedTiles.map((t) => t.name).join(" · ")}
          </p>
        )}
      </div>

      {/* ShopBot: the global assistant (GlobalShopBot in __root) shows its labelled button here. */}

      {/* =========================================================================
          PROFILE & MANAGEMENT DRAWER (OPENED VIA TOP-RIGHT AVATAR ICON)
         ========================================================================= */}
      {profileOpen && (
        <div
          className="glass-scrim fixed inset-0 z-50 flex justify-end"
          onClick={() => {
            setProfileOpen(false);
            setPanel(null);
          }}
        >
          <div
            className="flex h-full w-full max-w-sm flex-col border-l border-border bg-card p-4 shadow-2xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* DRAWER HEADER WITH BUSINESS IDENTITY */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/50 bg-muted">
                  {acct.logo ? (
                    <img src={acct.logo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-5 w-5 text-primary" />
                  )}
                </span>
                <div className="min-w-0">
                  <div className="font-black text-sm uppercase tracking-wider truncate text-foreground">
                    {(acct.shopName || "").toUpperCase()}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{acct.email}</div>
                </div>
              </div>
              <ShopButton
                variant="ghost"
                size="icon"
                onClick={() => {
                  setProfileOpen(false);
                  setPanel(null);
                }}
              >
                <X className="h-5 w-5" />
              </ShopButton>
            </div>

            {/* 1. SUBSCRIPTION PLAN CARD - ONE SINGLE ROW */}
            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-muted/60 border border-border/80 px-3 py-2.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] sm:text-xs text-muted-foreground uppercase font-bold tracking-wider shrink-0">
                  {t("plan")}
                </span>
                <strong className="text-primary font-black text-xs sm:text-sm uppercase truncate">{planLabel}</strong>
              </div>
              {!acct.staff && <ShopButton
                size="sm"
                variant="outline"
                className="font-bold text-xs shrink-0"
                onClick={() => {
                  setProfileOpen(false);
                  nav({ to: "/plans" });
                }}
              >
                {tr("Change plan")}
              </ShopButton>}
            </div>

            {/* MENU ITEMS */}
            <div className="mt-4 flex flex-1 flex-col gap-1.5">
              {/* 2. PROFILE & BUSINESS DETAILS */}
              <ShopButton
                variant="ghost"
                className="justify-between text-xs font-semibold py-2"
                onClick={() => setPanel(panel === "profile" ? null : "profile")}
              >
                <span className="flex items-center gap-2">
                  <UserRound className="h-4 w-4 text-primary" /> {tr("Profile & Shop Details")}
                </span>
                {panel === "profile" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </ShopButton>
              {panel === "profile" && (
                <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs space-y-2">
                  <div>
                    <span className="text-muted-foreground block text-[11px] uppercase font-bold">{t("shopName")}</span>
                    <span className="font-bold uppercase text-foreground">{acct.shopName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px] uppercase font-bold">{t("email")}</span>
                    <span className="font-medium text-foreground">{acct.email}</span>
                  </div>
                  {acct.phone && (
                    <div>
                      <span className="text-muted-foreground block text-[11px] uppercase font-bold">{tr("Phone")}</span>
                      <span className="font-medium text-foreground">{acct.phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <div>
                      <span className="text-muted-foreground block text-[11px] uppercase font-bold">
                        {t("currency")}
                      </span>
                      <span className="font-bold text-foreground">{acct.currency}</span>
                    </div>
                    {acct.country && (
                      <div>
                        <span className="text-muted-foreground block text-[11px] uppercase font-bold">
                          {tr("Country")}
                        </span>
                        <span className="font-bold text-foreground">{acct.country}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 3. MANAGE APPS (SLIDING TOGGLE SWITCH: GREEN/RIGHT FOR ACTIVE, GREY/LEFT FOR DEACTIVATE) */}
              <ShopButton
                variant="ghost"
                className="justify-between text-xs font-semibold py-2"
                onClick={() => setPanel(panel === "manageApps" ? null : "manageApps")}
              >
                <span className="flex items-center gap-2">
                  <LayoutGrid className="h-4 w-4 text-blue-400" /> {tr("Manage Apps (Active / Inactive)")}
                </span>
                {panel === "manageApps" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </ShopButton>
              {panel === "manageApps" && (
                <div className="rounded-xl border border-border bg-muted/40 p-2 text-xs space-y-1.5 max-h-60 overflow-y-auto">
                  <p className="text-[11px] text-muted-foreground px-1 pb-1">
                    {tr("Toggle modules on or off to customize your business launcher:")}
                  </p>
                  {APPS.filter((a) => a.id !== "settings").map((app) => {
                    const isHidden = cfg.hiddenApps.includes(app.id);
                    const isActive = !isHidden;
                    return (
                      <div
                        key={app.id}
                        className="flex items-center justify-between p-1.5 px-2 rounded-lg bg-card/60 border border-border/60 hover:bg-card transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={dark ? app.iconDark : app.icon}
                            alt=""
                            className="h-5 w-5 object-contain shrink-0"
                          />
                          <span className="font-semibold truncate text-[11px] text-foreground">{appName(app.id)}</span>
                        </div>

                        {/* SLIDING TOGGLE SWITCH: RIGHT = GREEN (ACTIVE), LEFT = GREY (DEACTIVATE) */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isActive}
                          aria-label={`Toggle ${appName(app.id)}`}
                          onClick={() => toggleAppVisibility(app.id)}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none",
                            isActive ? "bg-emerald-500" : "bg-muted-foreground/30 dark:bg-zinc-700",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-md transition-transform duration-200",
                              isActive ? "translate-x-4.5" : "translate-x-1",
                            )}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Manage shops (owner, 2026-11-24): which shop the apps show, or all shops, and a side-by-side comparison. */}
              {!acct.staff && <ShopButton
                variant="ghost"
                className="justify-between text-xs font-semibold py-2"
                onClick={() => setPanel(panel === "shops" ? null : "shops")}
              >
                <span className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-amber-400" /> {tr("Manage shops")}
                </span>
                {panel === "shops" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </ShopButton>}
              {panel === "shops" && <ManageShops />}

              {/* Back into Business Setup at any time after setting up (owner, 2026-11-24). Settings is on the launcher already. */}
              {!acct.staff && <ShopButton
                variant="ghost"
                className="justify-start gap-2 text-xs font-semibold py-2"
                onClick={() => { setProfileOpen(false); nav({ to: "/setup" }); }}
              >
                <Store className="h-4 w-4 text-emerald-400" /> {tr("Business Setup")}
              </ShopButton>}

              {/* 4. HELP & SUPPORT */}
              <ShopButton
                variant="ghost"
                className="justify-start gap-2 text-xs"
                onClick={() => {
                  setProfileOpen(false);
                  setChat(true);
                }}
              >
                <HelpCircle className="h-4 w-4 text-emerald-400" /> {tr("Help & Support")}
              </ShopButton>

              {/* 5. SIGN OUT */}
              <ShopButton
                variant="ghost"
                className="justify-start gap-2 text-xs text-destructive hover:text-destructive mt-3"
                onClick={() => {
                  void signOutUnified().catch(() => store.signOut());
                  setProfileOpen(false);
                  nav({ to: "/", replace: true });
                }}
              >
                <LogOut className="h-4 w-4" /> {t("signOut")}
              </ShopButton>
            </div>
          </div>
        </div>
      )}

      {/* SUPPORT & ASSISTANT MODALS */}
      <HelpChat
        open={chat}
        onClose={() => setChat(false)}
        shopName={acct.shopName}
        email={acct.email}
        icon={dark ? chatIcons.dark : chatIcons.light}
      />

      {/* UPGRADE REQUIRED MODAL WITH TOP-RIGHT ✕ EXIT BUTTON */}
      {locked && (
        <div
          className="glass-scrim fixed inset-0 z-50 grid place-items-center px-6"
          onClick={() => setLocked(null)}
        >
          <div
            className="glass-card relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLocked(null)}
              aria-label="Close"
              className="absolute right-3.5 top-3.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
            <Lock className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-2 text-lg font-bold">{t("upgradeRequired")}</h2>
            {/* Only a plan that leaves an app out locks it. The trial, ended or not, opens every app; an ended trial is read-only. */}
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("{x} is not included in {plan}.", locked).replace("{plan}", PLANS.find((p) => p.id === acct.plan)?.name ?? "")}
            </p>
            <p className="mt-1 text-sm font-bold">{tr("Your records are safe. Upgrade to open them.")}</p>
            {!acct.staff && <div className="mt-3"><DownloadRecords /></div>}
            <ShopButton className="mt-4" onClick={() => nav({ to: "/plans" })}>
              {t("upgradePlan")}
            </ShopButton>
          </div>
        </div>
      )}
    </main>
  );
}






