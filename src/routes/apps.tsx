import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  Mail,
  MessageCircle,
  Phone,
  Clock,
  Coins,
  Crown,
  Globe,
  HelpCircle,
  Lock,
  LogOut,
  Menu,
  Store,
  UserRound,
  X,
} from "lucide-react";
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
import { getT, LANGS, NATIVE, type Lang, type TKey } from "@/lib/i18n";

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

const CURRENCIES = [
  ["KSh", "Kenyan Shilling"],
  ["USh", "Ugandan Shilling"],
  ["TSh", "Tanzanian Shilling"],
  ["USD", "US Dollar"],
] as const;
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
  const { t, dir, tr, language, setLanguage } = useLanguage();
  const { dark } = useTheme();
  const [acct, setAcct] = useState<Account | null>(null);
  const [cfg] = useSettings();
  const shown = APPS.filter((a) => a.id !== "settings" && !cfg.hiddenApps.includes(a.id));
  const [locked, setLocked] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<null | "profile" | "language" | "currency" | "help">(null);
  const [faq, setFaq] = useState<number | null>(null);
  const [chat, setChat] = useState(false);
  const [businessAi, setBusinessAi] = useState(false);
  const pick = (p: Partial<Account>) => {
    store.update(p);
    setAcct((a) => (a ? { ...a, ...p } : a));
    toast.success(getT(p.language ?? acct?.language).t("saved"));
  };

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

  const renderApp = (app: (typeof APPS)[number]) => {
    const ok = canOpen(acct, app.tier);
    return (
      <ShopButton
        variant="bare"
        key={app.id}
        onClick={() => (ok && ROUTES[app.id] ? nav({ to: ROUTES[app.id]! }) : openApp(ok, appName(app.id)))}
        className="h-auto w-full min-w-0 flex-col items-center justify-start gap-1 rounded-none p-0"
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
      className="app-screen relative flex flex-col px-4 pb-[clamp(3rem,11dvh,5.5rem)] pt-[clamp(0.5rem,2dvh,1rem)] md:px-10"
      style={{ minHeight: "calc(100dvh / var(--fluid-scale, 1))" }}
    >
      <header className="flex items-center justify-between gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/50 bg-card/60">
          {acct.logo ? (
            <img src={acct.logo} alt={acct.shopName} className="h-full w-full object-cover" />
          ) : (
            <Store className="h-5 w-5 text-primary" />
          )}
        </span>

        <ConnectionStatus />

        <h1 className="flex-1 truncate text-center text-sm sm:text-base font-bold tracking-wide text-foreground">
          {acct.shopName}
        </h1>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <ShopButton variant="ghost" size="icon" aria-label="Menu" onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </ShopButton>
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

      {/* Launcher rows spread evenly over the remaining height so apps fill the screen top to bottom. */}
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

      <ShopButton
        variant="bare"
        aria-label="ShopBot"
        onClick={() => setBusinessAi(true)}
        className="h-auto w-auto fixed bottom-[clamp(2.5rem,9dvh,5rem)] right-4 md:right-10 flex flex-col items-center"
      >
        <img
          src={dark ? chatIcons.dark : chatIcons.light}
          alt=""
          className="h-[min(11vw,6.5dvh,64px)] w-[min(11vw,6.5dvh,64px)] rounded-full"
        />
      </ShopButton>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-background/60 backdrop-blur-sm"
          onClick={() => {
            setMenuOpen(false);
            setPanel(null);
          }}
        >
          <div
            className="flex h-full w-full max-w-sm flex-col border-l border-border bg-card p-4 shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-primary/50 bg-muted">
                  {acct.logo ? (
                    <img src={acct.logo} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Store className="h-5 w-5 text-primary" />
                  )}
                </span>
                <div>
                  <div className="font-bold leading-tight">{acct.shopName}</div>
                  <div className="text-xs text-muted-foreground">{acct.email}</div>
                </div>
              </div>
              <ShopButton
                variant="ghost"
                size="icon"
                onClick={() => {
                  setMenuOpen(false);
                  setPanel(null);
                }}
              >
                <X className="h-5 w-5" />
              </ShopButton>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/60 p-2.5 text-xs">
              <span className="font-medium">
                {t("plan")}: <strong className="text-primary">{planLabel}</strong>
              </span>
              <ShopButton
                size="sm"
                variant="outline"
                onClick={() => {
                  setMenuOpen(false);
                  nav({ to: "/plans" });
                }}
              >
                {tr("Change plan")}
              </ShopButton>
            </div>

            <div className="mt-4 flex flex-1 flex-col gap-1">
              <ShopButton
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => setPanel(panel === "profile" ? null : "profile")}
              >
                <UserRound className="h-4 w-4" /> {tr("Profile & Business")}
              </ShopButton>
              {panel === "profile" && (
                <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1.5">
                  <div>
                    <strong>{t("shopName")}:</strong> {acct.shopName}
                  </div>
                  <div>
                    <strong>{t("email")}:</strong> {acct.email}
                  </div>
                  {acct.phone && (
                    <div>
                      <strong>{tr("Phone")}:</strong> {acct.phone}
                    </div>
                  )}
                  <div>
                    <strong>{t("currency")}:</strong> {acct.currency}
                  </div>
                </div>
              )}

              <ShopButton
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => setPanel(panel === "language" ? null : "language")}
              >
                <Globe className="h-4 w-4" /> {t("language")} (
                {NATIVE[language]}
                )
              </ShopButton>
              {panel === "language" && (
                <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2 text-xs">
                  {LANGS.map((code) => ({ code, name: NATIVE[code] })).map((l) => (
                    <ShopButton
                      key={l.code}
                      size="sm"
                      variant={language === l.code ? "default" : "outline"}
                      className="justify-start text-[11px]"
                      onClick={() => {
                        setLanguage(l.code as Lang);
                        pick({ language: l.code });
                      }}
                    >
                      {l.name}
                    </ShopButton>
                  ))}
                </div>
              )}

              <ShopButton
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => setPanel(panel === "currency" ? null : "currency")}
              >
                <Coins className="h-4 w-4" /> {t("currency")} ({acct.currency})
              </ShopButton>
              {panel === "currency" && (
                <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted/40 p-2 text-xs">
                  {CURRENCIES.map(([code, label]) => (
                    <ShopButton
                      key={code}
                      size="sm"
                      variant={acct.currency === code ? "default" : "outline"}
                      className="justify-start"
                      onClick={() => pick({ currency: code })}
                    >
                      {code}
                    </ShopButton>
                  ))}
                </div>
              )}

              <ShopButton
                variant="ghost"
                className="justify-start gap-2"
                onClick={() => {
                  setMenuOpen(false);
                  setChat(true);
                }}
              >
                <HelpCircle className="h-4 w-4" /> {tr("Help & Support")}
              </ShopButton>

              <ShopButton
                variant="ghost"
                className="justify-start gap-2 text-destructive hover:text-destructive"
                onClick={() => {
                  store.signOut();
                  setMenuOpen(false);
                  nav({ to: "/" });
                }}
              >
                <LogOut className="h-4 w-4" /> {t("signOut")}
              </ShopButton>
            </div>
          </div>
        </div>
      )}

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
