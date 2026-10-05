import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Check, ChevronLeft, Clock, Coins, Crown, Globe, HelpCircle, Lock, LogOut, Menu, Store, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { ThemeToggle, useTheme } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { APPS, canOpen, chatIcons, store, trialDaysLeft, type Account } from "@/lib/shopbook";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/apps")({
  head: () => ({
    meta: [
      { title: "Apps — SHOPBOOK ERP" },
      { name: "description", content: "All your SHOPBOOK apps: POS, inventory, sales, accounting, payroll and more." },
      { property: "og:title", content: "Apps — SHOPBOOK ERP" },
      { property: "og:description", content: "All your SHOPBOOK business apps in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Apps,
});

const ROWS = [APPS.slice(0, 4), APPS.slice(4, 8), APPS.slice(8, 12)];
const LANGS = ["English", "Swahili", "French", "Arabic", "Spanish", "Portuguese", "German", "Italian", "Chinese", "Hindi"];
const CURRENCIES = [["KSh", "Kenyan Shilling"], ["USh", "Ugandan Shilling"], ["TSh", "Tanzanian Shilling"], ["USD", "US Dollar"]] as const;
const SETTINGS_APP = APPS.find((a) => a.id === "settings");

function Apps() {
  const nav = useNavigate();
  const { dark } = useTheme();
  const [acct, setAcct] = useState<Account | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<null | "profile" | "language" | "currency" | "help">(null);
  const pick = (p: Partial<Account>) => { store.update(p); setAcct((a) => (a ? { ...a, ...p } : a)); toast.success("Saved"); };

  useEffect(() => {
    const a = store.get();
    if (!a || !store.signedIn()) { nav({ to: "/", replace: true }); return; }
    if (!a.plan) { nav({ to: "/plans", replace: true }); return; }
    setAcct(a);
  }, [nav]);

  if (!acct) return <main className="app-screen" />;
  const days = trialDaysLeft(acct);
  const planLabel = acct.plan === "trial" ? "Full ERP Trial" : `${acct.plan} plan`;

  const openApp = (ok: boolean, name: string) => {
    if (ok) toast(`${name} is coming in the next step.`);
    else setLocked(name);
  };

  const renderApp = (app: (typeof APPS)[number]) => {
    const ok = canOpen(acct, app.tier);
    return (
      <button key={app.id} onClick={() => openApp(ok, app.name)}
        className="flex min-w-0 flex-col items-center gap-1 transition active:scale-95">
        <span className="relative flex h-[58px] w-full max-w-[76px] items-center justify-center">
          <span className="block h-full w-full">
            <img src={dark ? app.iconDark : app.icon} alt="" className={cn("h-full w-full object-contain", !ok && "opacity-50 grayscale")} />
          </span>
          {!ok && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-card shadow"><Lock className="h-3 w-3" /></span>}
        </span>
        <span className="w-full truncate text-center text-[11px] font-semibold text-foreground">{app.name}</span>
      </button>
    );
  };

  return (
    <main className="app-screen relative px-4 pb-24 pt-4">
      <header className="flex items-center justify-between gap-2">
        <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-primary/50 bg-card/60">
          {acct.logo
            ? <img src={acct.logo} alt="Shop logo" className="h-full w-full object-cover object-center" />
            : <Store className="h-4.5 w-4.5 text-primary" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-base font-bold">{acct.shopName}</span>
        <div className="flex shrink-0 items-center gap-2">
          <button aria-label="Notifications" className="relative"><Bell className="h-5 w-5" /></button>
          <ThemeToggle />
          <button aria-label="Menu" onClick={() => { setPanel(null); setMenuOpen(true); }}><Menu className="h-5 w-5" /></button>
        </div>
      </header>

      {acct.plan === "trial" && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-card/70 p-3">
          <Crown className="h-7 w-7 text-badge-gold" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Free Trial Remaining</div>
            <div className="text-xs text-muted-foreground">You are using the {planLabel}</div>
          </div>
          <span className="flex items-center gap-1 rounded-xl bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground glow">
            <Clock className="h-3.5 w-3.5" /> {days} Days Left
          </span>
        </div>
      )}

      <div className="mt-8 space-y-9">
        {ROWS.map((row, i) => (
          <div key={i} className="grid grid-cols-4 gap-x-2">
            {row.map(renderApp)}
          </div>
        ))}
        {SETTINGS_APP && <div className="flex justify-center">{renderApp(SETTINGS_APP)}</div>}
      </div>

      <button aria-label="AI assistant" onClick={() => toast("AI assistant is coming soon.")}
        className="fixed bottom-6 right-[max(1rem,calc(50%-199px))] flex flex-col items-center">
        <img src={dark ? chatIcons.dark : chatIcons.light} alt="" className="h-14 w-14 rounded-full" />
      </button>

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>
          <div className="ml-auto flex h-full w-64 flex-col border-l border-border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-extrabold tracking-tight">SHOP<span className="text-primary">BOOK</span></span>
              <button aria-label="Close menu" onClick={() => setMenuOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-6 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-primary/50 bg-card/60">
                {acct.logo
                  ? <img src={acct.logo} alt="" className="h-full w-full object-cover object-center" />
                  : <Store className="h-5 w-5 text-primary" />}
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{acct.shopName}</div>
                <div className="text-xs text-muted-foreground capitalize">{planLabel}</div>
              </div>
            </div>
            {panel === null ? (
              <nav className="mt-6 flex flex-col gap-1">
                {([["profile", "Profile & Business", UserRound], ["language", "Language", Globe], ["currency", "Currency", Coins], ["help", "Help & Support", HelpCircle]] as const).map(([k, label, Icon]) => (
                  <button key={k} onClick={() => setPanel(k)} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium hover:bg-muted">
                    <Icon className="h-4.5 w-4.5 text-primary" /> {label}
                  </button>
                ))}
              </nav>
            ) : (
              <div className="mt-6 flex min-h-0 flex-1 flex-col">
                <button onClick={() => setPanel(null)} className="mb-3 flex items-center gap-1 text-sm text-muted-foreground"><ChevronLeft className="h-4 w-4" /> Back</button>
                {panel === "profile" && (
                  <div className="space-y-3 text-sm">
                    <div className="font-bold">Profile</div>
                    <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Email</div>{acct.email || "—"}<div className="mt-2 text-xs text-muted-foreground">Role</div>Admin</div>
                    <div className="font-bold">Business</div>
                    <div className="rounded-xl border border-border p-3"><div className="text-xs text-muted-foreground">Shop name</div>{acct.shopName}<div className="mt-2 text-xs text-muted-foreground">Currency</div>{acct.currency}<div className="mt-2 text-xs text-muted-foreground">Plan</div><span className="capitalize">{planLabel}</span></div>
                    <ShopButton variant="outline" onClick={() => { setMenuOpen(false); nav({ to: "/plans" }); }}>Manage Subscription</ShopButton>
                  </div>
                )}
                {panel === "language" && (
                  <div className="flex flex-col gap-1 overflow-y-auto">
                    {LANGS.map((l) => (
                      <button key={l} onClick={() => pick({ language: l })} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm hover:bg-muted">
                        {l} {(acct.language || "English") === l && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
                {panel === "currency" && (
                  <div className="flex flex-col gap-1">
                    {CURRENCIES.map(([c, label]) => (
                      <button key={c} onClick={() => pick({ currency: c })} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-muted">
                        {c} – {label} {acct.currency === c && <Check className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}
                {panel === "help" && (
                  <div className="space-y-3 text-sm">
                    <p className="text-muted-foreground">Need help with SHOPBOOK? Ask the AI assistant or contact our support team.</p>
                    <ShopButton variant="outline" onClick={() => { setMenuOpen(false); toast("AI assistant is coming soon."); }}>Ask the AI assistant</ShopButton>
                    <ShopButton variant="outline" onClick={() => toast("Support contact is coming soon.")}>Contact support</ShopButton>
                  </div>
                )}
              </div>
            )}
            <div className="mt-auto border-t border-border pt-3">
              <button
                onClick={() => { store.signOut(); nav({ to: "/", replace: true }); }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-sm font-medium text-destructive">
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {locked && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-background/70 px-6 backdrop-blur-sm" onClick={() => setLocked(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <Lock className="mx-auto h-8 w-8 text-primary" />
            <h2 className="mt-2 text-lg font-bold">Upgrade Required</h2>
            <p className="mt-1 text-sm text-muted-foreground">{locked} is not included in your current plan.</p>
            <ShopButton className="mt-4" onClick={() => nav({ to: "/plans" })}>Upgrade Plan</ShopButton>
          </div>
        </div>
      )}
    </main>
  );
}
