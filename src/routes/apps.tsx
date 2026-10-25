import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, ChevronDown, ChevronUp, HelpCircle, LayoutGrid, Lock, LogOut, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle, useTheme } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { APPS, canOpen, chatIcons, store, trialDaysLeft, type Account } from "@/lib/shopbook";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings-config";
import { HelpChat } from "@/components/shopbook/help-chat";
import { BusinessAssistant } from "@/components/shopbook/business-assistant";
import { ConnectionStatus } from "@/components/shopbook/connection-status";
import { AnnouncementBanner } from "@/components/shopbook/announcement-banner";
import { useLanguage } from "@/hooks/use-language";
import { type TKey } from "@/lib/i18n";
import emblemAsset from "@/assets/auth-brand-emblem.jpg.asset.json";

export const Route = createFileRoute("/apps")({
  head: () => ({
    meta: [
      { title: "Apps — SHOPBOOK ERP" },
      { name: "description", content: "Access your business apps: POS, Inventory, Sales, Accounting, and more." },
      { property: "og:title", content: "Apps — SHOPBOOK ERP" },
      { property: "og:description", content: "Access your business apps on SHOPBOOK ERP." },
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

function Apps() {
  const nav = useNavigate();
  const { t, dir, tr } = useLanguage();
  const { dark } = useTheme();
  const [acct, setAcct] = useState<Account | null>(null);
  const [cfg, setCfg] = useSettings();

  // Launcher apps: exclude settings and apps marked as hidden
  const shown = APPS.filter((a) => a.id !== "settings" && !cfg.hiddenApps.includes(a.id));
  const [locked, setLocked] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [panel, setPanel] = useState<null | "profile" | "manageApps">(null);
  const [chat, setChat] = useState(false);
  const [businessAi, setBusinessAi] = useState(false);

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
    setAcct(a);
    const onSession = () => {
      if (!store.signedIn()) {
        setAcct(null);
        nav({ to: "/", replace: true });
      }
    };
    window.addEventListener("shopbook-session", onSession);
    return () => window.removeEventListener("shopbook-session", onSession);
  }, [nav]);

  if (!acct) return <main className="app-screen" />;

  const days = trialDaysLeft(acct);
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
        className="h-auto w-full min-w-0 flex-col items-center justify-start gap-1 rounded-none p-0 cursor-pointer"
      >
        <span className="relative flex aspect-square w-full max-w-[min(16vw,9.5dvh,96px)] items-center justify-center">
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
        <span className="w-full truncate text-center text-[clamp(9px,min(2.6vw,1.9dvh),13px)] font-semibold leading-tight text-foreground">
          {appName(app.id)}
        </span>
      </ShopButton>
    );
  };

  return (
    <main
      dir={dir}
      className="app-screen relative flex flex-col px-3 pb-[clamp(3rem,11dvh,5.5rem)] pt-[clamp(0.5rem,2dvh,1rem)] sm:px-6 md:px-10"
      style={{ minHeight: "calc(100dvh / var(--fluid-scale, 1))" }}
    >
      {/* =========================================================================
          HEADER: APP LOGO (LEFT) | CAPITAL SHOP NAME (CENTER) | AVATAR (RIGHT)
         ========================================================================= */}
      <header className="flex items-center justify-between gap-2 shrink-0">
        {/* TOP LEFT: APP LOGO + APP NAME + ONLINE/OFFLINE INDICATOR */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full overflow-hidden border border-primary/40 bg-card/70 shadow-sm shrink-0 grid place-items-center p-0.5">
            <img src={emblemAsset.url} alt="SHOPBOOK ERP" className="h-full w-full object-cover rounded-full" />
          </div>
          <span className="hidden min-[480px]:inline font-black text-xs sm:text-sm tracking-tight text-foreground whitespace-nowrap">
            SHOP<span className="text-primary">BOOK</span>{" "}
            <span className="text-[9.5px] sm:text-[10px] text-muted-foreground font-semibold">ERP</span>
          </span>
          <ConnectionStatus />
        </div>

        {/* CENTER: SHOP NAME IN CAPITAL LETTERS ALWAYS + SMALL PLAN BADGE */}
        <div className="flex-1 min-w-0 flex flex-col items-center justify-center px-1 text-center">
          <h1 className="truncate text-center text-xs sm:text-sm md:text-base font-black tracking-wider text-foreground uppercase max-w-[170px] sm:max-w-xs md:max-w-md">
            {(acct.shopName || "").toUpperCase()}
          </h1>
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className={cn(
                "px-1.5 py-0.2 rounded text-[8px] sm:text-[9.5px] font-black uppercase tracking-wider shrink-0",
                acct.plan === "business"
                  ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                  : acct.plan === "plus"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                    : acct.plan === "trial"
                      ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40",
              )}
            >
              {acct.plan === "trial" ? tr("TRIAL") : acct.plan ? acct.plan.toUpperCase() : tr("BASIC")}
            </span>
          </div>
        </div>

        {/* TOP RIGHT: NOTIFICATION BELL | SUN/MOON THEME | SHOP LOGO / DEFAULT AVATAR PROFILE */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Notification Button */}
          <ShopButton
            variant="ghost"
            size="icon"
            aria-label="Notifications"
            className="h-8 w-8 text-muted-foreground hover:text-foreground cursor-pointer relative"
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
            className="grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/50 bg-card hover:ring-2 hover:ring-primary/40 transition-all cursor-pointer shadow-sm"
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

      {acct.plan === "trial" && (
        <div className="mt-2 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs">
          <span>
            {days} {tr("days left in free trial")}
          </span>
          <ShopButton size="sm" onClick={() => nav({ to: "/plans" })}>
            {tr("Choose plan")}
          </ShopButton>
        </div>
      )}

      {/* Launcher rows spread evenly over the remaining height */}
      <div className="flex min-h-0 flex-1 flex-col justify-evenly py-[clamp(0.25rem,1.5dvh,1rem)]">
        <div
          className="grid grid-cols-4 content-evenly gap-x-[clamp(0.4rem,2vw,1.25rem)] gap-y-[clamp(0.3rem,1.6dvh,1.25rem)]"
          style={{ flex: "1 1 auto" }}
        >
          {shown.map(renderApp)}
        </div>
        {SETTINGS_APP && (
          <div className="flex justify-center pt-[clamp(0.3rem,1.6dvh,1.25rem)]">
            <div className="w-1/4 px-[clamp(0.2rem,1vw,0.6rem)]">{renderApp(SETTINGS_APP)}</div>
          </div>
        )}
      </div>

      {/* FLOATING SHOPBOT BUTTON (ENLARGED & ELEVATED) */}
      <ShopButton
        variant="bare"
        aria-label="ShopBot"
        onClick={() => setBusinessAi(true)}
        className="h-auto w-auto fixed bottom-[clamp(2.5rem,9dvh,5rem)] right-4 md:right-10 flex flex-col items-center cursor-pointer z-30 group"
      >
        <img
          src={dark ? chatIcons.dark : chatIcons.light}
          alt=""
          className="h-[min(14vw,8.5dvh,76px)] w-[min(14vw,8.5dvh,76px)] rounded-full shadow-2xl transition-transform duration-200 group-hover:scale-105"
        />
      </ShopButton>

      {/* =========================================================================
          PROFILE & MANAGEMENT DRAWER (OPENED VIA TOP-RIGHT AVATAR ICON)
         ========================================================================= */}
      {profileOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm"
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
                <span className="text-[10px] sm:text-xs text-muted-foreground uppercase font-bold tracking-wider shrink-0">
                  {t("plan")}
                </span>
                <strong className="text-primary font-black text-xs sm:text-sm uppercase truncate">{planLabel}</strong>
              </div>
              <ShopButton
                size="sm"
                variant="outline"
                className="font-bold text-xs shrink-0"
                onClick={() => {
                  setProfileOpen(false);
                  nav({ to: "/plans" });
                }}
              >
                {tr("Change plan")}
              </ShopButton>
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
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">{t("shopName")}</span>
                    <span className="font-bold uppercase text-foreground">{acct.shopName}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">{t("email")}</span>
                    <span className="font-medium text-foreground">{acct.email}</span>
                  </div>
                  {acct.phone && (
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">{tr("Phone")}</span>
                      <span className="font-medium text-foreground">{acct.phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <div>
                      <span className="text-muted-foreground block text-[10px] uppercase font-bold">
                        {t("currency")}
                      </span>
                      <span className="font-bold text-foreground">{acct.currency}</span>
                    </div>
                    {acct.country && (
                      <div>
                        <span className="text-muted-foreground block text-[10px] uppercase font-bold">
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
                  <p className="text-[10px] text-muted-foreground px-1 pb-1">
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
                  store.signOut();
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
      <BusinessAssistant
        open={businessAi}
        onClose={() => setBusinessAi(false)}
        shop={acct.shopName}
        currency={acct.currency}
        icon={dark ? chatIcons.dark : chatIcons.light}
      />

      {/* UPGRADE REQUIRED MODAL WITH TOP-RIGHT ✕ EXIT BUTTON */}
      {locked && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-6 backdrop-blur-sm"
          onClick={() => setLocked(null)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center shadow-2xl"
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
            <p className="mt-1 text-sm text-muted-foreground">{t("notIncluded", locked)}</p>
            <ShopButton className="mt-4" onClick={() => nav({ to: "/plans" })}>
              {t("upgradePlan")}
            </ShopButton>
          </div>
        </div>
      )}
    </main>
  );
}
