import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, Clock, Crown, Lock, LogOut } from "lucide-react";
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
    ],
  }),
  component: Apps,
});

function Apps() {
  const nav = useNavigate();
  const { dark } = useTheme();
  const [acct, setAcct] = useState<Account | null>(null);
  const [locked, setLocked] = useState<string | null>(null);

  useEffect(() => {
    const a = store.get();
    if (!a || !store.signedIn()) { nav({ to: "/", replace: true }); return; }
    if (!a.plan) { nav({ to: "/plans", replace: true }); return; }
    setAcct(a);
  }, [nav]);

  if (!acct) return <main className="app-screen" />;
  const days = trialDaysLeft(acct);
  const planLabel = acct.plan === "trial" ? "Full ERP Trial" : `${acct.plan} plan`;

  return (
    <main className="app-screen relative px-4 pb-24 pt-4">
      <header className="flex items-center justify-between gap-2">
        <button onClick={() => { store.signOut(); nav({ to: "/", replace: true }); }} className="flex items-center gap-1.5 text-sm font-medium">
          <LogOut className="h-5 w-5 rotate-180" /> Logout
        </button>
        <div className="flex min-w-0 items-center gap-1.5">
          {acct.logo && <img src={acct.logo} alt="" className="h-6 w-6 rounded-full object-cover" />}
          <span className="truncate text-base font-bold">{acct.shopName}</span>
        </div>
        <div className="flex items-center gap-2">
          <button aria-label="Notifications" className="relative"><Bell className="h-5 w-5" /></button>
          <ThemeToggle />
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

      <div className="mt-5 grid grid-cols-4 gap-x-2 gap-y-4">
        {APPS.map((app, i) => {
          const ok = canOpen(acct, app.tier);
          return (
            <button key={app.id}
              onClick={() => ok ? toast(`${app.name} is coming in the next step.`) : setLocked(app.name)}
              className={cn("flex flex-col items-center gap-1.5 transition active:scale-95", i === 12 && "col-start-2 col-span-2")}>
              <span className="relative">
                <span className="block h-[54px] w-[66px] overflow-hidden"><img src={app.icon} alt="" className={cn("h-[72px] w-[66px] max-w-none", !ok && "opacity-50 grayscale")} /></span>
                {!ok && <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-card shadow"><Lock className="h-3 w-3" /></span>}
              </span>
              <span className="text-xs font-semibold">{app.name}</span>
            </button>
          );
        })}
      </div>

      <button aria-label="AI assistant" onClick={() => toast("AI assistant is coming soon.")}
        className="fixed bottom-6 right-[max(1rem,calc(50%-199px))] flex flex-col items-center">
        <img src={dark ? chatIcons.dark : chatIcons.light} alt="" className="h-14 w-14 rounded-full" />
      </button>

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
