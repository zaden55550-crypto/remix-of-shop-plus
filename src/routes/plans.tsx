import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  Search,
  PlayCircle,
  Gift,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { DownloadRecords, GlassNotice, PlanLoss } from "@/components/shopbook/plan-loss";
import { Wordmark } from "@/components/shopbook/ui";
import { GlassPage } from "@/components/shopbook/glass-page";
import { SaleTour, Testimonials } from "@/components/shopbook/try-and-tour";
import { ReferralCard } from "@/components/shopbook/daily-tools";
import { SUPPORT } from "@/lib/i18n";
import { PAYMENT_TEST_MODE, realPayment } from "@/lib/payment";
import { buyPlan } from "@/lib/plan-change";
import { PLANS, READ_ONLY_MESSAGE, appsLostOn, planAllowanceLines, planCounterLine, planEmployeeRule, store, trialDaysLeft, type PlanId } from "@/lib/shopbook";
import { cn } from "@/lib/utils";
import { USD_RATES, convertUsdToCurrency } from "@/lib/world-data";
import { useLanguage } from "@/hooks/use-language";

const PLAN_CURRENCY = "shopbook.planCurrency";
/** The currencies prices can be shown in: every one with a rate, aliases (KSH, SOM, USH, TSH) left out. */
const PLAN_CURRENCIES = Object.keys(USD_RATES).filter((c) => !["KSH", "SOM", "USH", "TSH"].includes(c));

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Subscription Plans — DataQuill Solutions" },
      { name: "description", content: "Choose the DataQuill Solutions plan that fits your business." },
      { property: "og:title", content: "Subscription Plans — DataQuill Solutions" },
      { property: "og:description", content: "Transparent pricing for African small and medium businesses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Plans,
});

function Plans() {
  const nav = useNavigate();
  const { tr, dir } = useLanguage();

  const [tour, setTour] = useState(false), [invite, setInvite] = useState(false);
  // Real M-Pesa plan payments (payment.ts): whether the server has DataQuill Solutions' M-Pesa keys, and the shilling prices.
  const [real, setReal] = useState<{ ready: boolean; prices: Record<string, number> }>({ ready: false, prices: {} });
  const [payPhone, setPayPhone] = useState(""), [payStep, setPayStep] = useState<"sent" | "waiting" | null>(null);
  useEffect(() => { void realPayment().then(setReal); setPayPhone(store.get()?.phone ?? ""); }, []);
  const [yearly, setYearly] = useState(false);
  // Prices in the currency the visitor picks (owner, 2026-11-24): US dollars unless changed; remembered on this device. Other
  // currencies are approximate conversions for reading only; payment stays as the payment step states.
  const [cur, setCur] = useState("USD");
  useEffect(() => { try { const c = localStorage.getItem(PLAN_CURRENCY); if (c && USD_RATES[c]) setCur(c); } catch { /* USD */ } }, []);
  const pickCurrency = (c: string) => { setCur(c); try { localStorage.setItem(PLAN_CURRENCY, c); } catch { /* this visit only */ } };
  // Nothing is selected until the customer chooses; a choice made earlier comes back after the first paint.
  const [chosenPlanId, setChosenPlanId] = useState<PlanId | null>(null);
  const [askedToSelect, setAskedToSelect] = useState(false);
  const [confirmingTrial, setConfirmingTrial] = useState(false);
  const [paying, setPaying] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showingLimits, setShowingLimits] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [buying, setBuying] = useState(false);
  // Read after the first paint, like the saved choice. A paid customer has no trial to go back to.
  const [paidPlan, setPaidPlan] = useState<PlanId | null>(null);

  const acct = store.get();
  const plan = PLANS.find((p) => p.id === chosenPlanId) || PLANS[1]!;
  // The payment step always states the US dollar price (what is charged), with the chosen currency beside it.
  const usd = yearly ? Math.round(plan.yearlyUsd) : plan.monthlyUsd;
  const currentPrice = convertUsdToCurrency(usd, "USD");
  const currentLocal = cur === "USD" ? null : convertUsdToCurrency(usd, cur);

  useEffect(() => {
    const saved = store.get();
    if (saved?.trialChoice) setChosenPlanId(saved.trialChoice);
    if (saved?.plan && saved.plan !== "trial") setPaidPlan(saved.plan);
  }, []);

  useEffect(() => {
    if (!askedToSelect) return;
    const timer = setTimeout(() => setAskedToSelect(false), 4000);
    return () => clearTimeout(timer);
  }, [askedToSelect]);

  // One trial per shop: choosing it again never restarts the clock.
  const started = acct?.trialStart;

  const askForTrial = () => {
    if (started && trialDaysLeft(acct) <= 0) {
      toast.error(tr(READ_ONLY_MESSAGE));
      return;
    }
    if (!chosenPlanId) {
      setAskedToSelect(true);
      return;
    }
    setConfirmingTrial(true);
  };

  const startTrial = () => {
    // The trial stays full access. The selected plan is only remembered; it never activates a paid plan.
    store.update({ plan: "trial", trialStart: started ?? Date.now(), trialChoice: plan.id, ...(started ? {} : { setupPending: true }) });
    toast.success(tr(started ? "Your plan choice is saved." : "30-day free trial activated! Welcome to DataQuill Solutions."));
    // Only a brand new trial goes on to Business / Shop Setup.
    nav({ to: started ? "/apps" : "/setup" });
  };

  const confirmPlan = async () => {
    setBuying(true); setPayStep(null);
    const result = await buyPlan(plan.id, yearly ? "yearly" : "monthly", undefined, { phone: payPhone, onStep: setPayStep });
    setBuying(false); setPayStep(null);
    if (!result.ok) {
      toast.error(tr(result.error));
      return;
    }
    toast.success(tr("{x} is now your plan.", plan.name));
    if (result.firstPlan) store.update({ setupPending: true });
    nav({ to: result.firstPlan ? "/setup" : "/apps" });
  };

  const trialLabel = (name: string) => tr(started ? "Continue free trial with {x}" : "Start 30-day free trial with {x}", name);
  const trialDialog = confirmingTrial && (
    <GlassNotice title={trialLabel(plan.name)} onClose={() => setConfirmingTrial(false)} className="plans-type">
      <p>{tr("You get all features during the trial. You are not charged.")}</p>
      <p>{tr("No payment details are needed, and billing never starts automatically.")}</p>
      <p>{tr("During the trial you have every app and the Business limits.")}</p>
      <p>{tr("{x} is saved as your choice. It becomes your plan only when you pay for it.", plan.name)}</p>
      <p>{tr("After your 30-day trial ends, you can still view and export your existing records. Subscribe to add new transactions.")}</p>
      <PlanLoss planId={plan.id} />
      <p>{tr("Your records stay safe. Upgrading opens them again.")}</p>
      <div className="flex gap-2 pt-1">
        <ShopButton variant="outline" className="h-auto min-h-11 flex-1 px-3 py-2 text-sm" onClick={() => setConfirmingTrial(false)}>{tr("Back")}</ShopButton>
        <ShopButton className="h-auto min-h-11 flex-[2] px-3 py-2 text-sm" onClick={startTrial}>{trialLabel(plan.name)}</ShopButton>
      </div>
    </GlassNotice>
  );

  const limitsDialog = showingLimits && (
    <GlassNotice title={tr("How plan limits work")} onClose={() => setShowingLimits(false)} className="plans-type">
      <div className="plans-limits">
        {PLANS.map((p) => (
          <div key={p.id} className="plans-limits-plan">
            <h3>{p.name}</h3>
            {planAllowanceLines(p).map((line) => <p key={line}>{tr(line)}</p>)}
            <p>{tr(planCounterLine(p))}</p>
            <p>{tr(planEmployeeRule(p))}</p>
          </div>
        ))}
      </div>
      <p>{tr("Every Shop or Warehouse uses one location allowance. Choose any mix of locations within your plan limit.")}</p>
      <p>{tr("Each plan has one pool of logins: place staff at any shop or warehouse, all at one or shared. Managers have their own limit within the pool. Basic includes one employee and no Warehouse.")}</p>
      <p>{tr("Employees without a login don't count.")}</p>
      <p>{tr("Each person uses their own account and counts as 1 user, even when assigned to multiple locations.")}</p>
      <p>{tr("Managers, Shopkeepers and Storekeepers have separate roles and position limits.")}</p>
      <p>{tr("The owner controls each person's role and permitted locations.")}</p>
      <p>{tr("Cashiers and devices have no separate limit.")}</p>
      <p>{tr("After your 30-day trial ends, you can still view and export your existing records. Subscribe to add new transactions.")}</p>
    </GlassNotice>
  );

  const tone: Record<PlanId, { text: string; ring: string; selected: string; border: string; bg: string; btn: string }> = {
    basic: {
      text: "text-emerald-500",
      ring: "ring-emerald-500/20",
      selected: "ring-2 ring-emerald-400 !border-emerald-400",
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/10",
      btn: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30",
    },
    growth: {
      text: "text-blue-500",
      ring: "ring-blue-500/30",
      selected: "ring-2 ring-blue-400 !border-blue-400",
      border: "border-blue-500/40",
      bg: "bg-blue-500/10",
      btn: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30",
    },
    business: {
      text: "text-amber-500",
      ring: "ring-amber-500/20",
      selected: "ring-2 ring-amber-400 !border-amber-400",
      border: "border-amber-500/30",
      bg: "bg-amber-500/10",
      btn: "bg-amber-500 hover:bg-amber-400 text-black font-extrabold shadow-amber-500/30 border border-amber-300/40",
    },
  };

  const handleRestorePurchases = () => {
    setRestoring(true);
    setTimeout(() => {
      setRestoring(false);
      toast.info(tr("Online payment isn't available yet. You have not been charged."));
    }, 1200);
  };

  // =========================================================================
  // VIEW: PAYMENT WORKFLOW SCREENS
  // =========================================================================
  if (paying) {
    const losing = appsLostOn(acct, plan.id);
    return (
      <main
        dir={dir}
        className="plans-type min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center p-3 sm:p-4 overflow-y-auto"
      >
        <div className="w-full max-w-md bg-card/95 border border-border/80 rounded-2xl shadow-2xl p-4 sm:p-5 relative backdrop-blur-md">
          {/* HEADER ROW */}
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <button
              type="button"
              onClick={() => {
                setPaying(false);
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{tr("Back")}</span>
            </button>
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
              {tr("Buy {x}", plan.name)}
            </h2>
            <button
              type="button"
              onClick={() => {
                setPaying(false);
              }}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ACTIVE PLAN SUMMARY BANNER WITH BOLD SUBSCRIPTION DETAILS */}
          <div className="mt-3 p-3 rounded-xl bg-muted/40 border border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-500">
                <Store className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-foreground">
                  {plan.name} {tr("Plan")}
                  <span className="text-[11px] font-bold text-muted-foreground ml-1">
                    · {yearly ? tr("Yearly") : tr("Monthly")} ·
                  </span>
                  <span className="text-xs font-black text-foreground ml-1">{currentPrice.formatted}</span>
                  {currentLocal && <span className="text-[11px] font-bold text-muted-foreground ml-1">(≈ {currentLocal.formatted})</span>}
                </div>
                <div className="text-[10px] font-bold text-muted-foreground">
                  {[...planAllowanceLines(plan), planCounterLine(plan)].map((line) => tr(line)).join(" · ")}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaying(false)}
              className="text-[11px] font-bold text-blue-500 hover:text-blue-400 cursor-pointer"
            >
              {tr("Change >")}
            </button>
          </div>

          {losing.length > 0 && (
            <div className="mt-3 p-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs space-y-1.5">
              <PlanLoss planId={plan.id} apps={losing} />
              <p>{tr("Your records stay safe. Upgrading opens them again.")}</p>
              <DownloadRecords />
            </div>
          )}

          <div className="mt-4 space-y-3 text-center">
            {acct?.plan === plan.id ? (
              <p className="text-sm font-bold text-foreground">{tr("This is already your plan.")}</p>
            ) : real.ready ? (
              <>
                <p className="text-sm font-bold text-foreground">{tr("Pay by M-Pesa")} · KSh {(real.prices[`${plan.id}:${yearly ? "yearly" : "monthly"}`] ?? 0).toLocaleString("en-KE")}</p>
                <input className="inventory-input w-full text-center" inputMode="tel" value={payPhone} onChange={(e) => setPayPhone(e.target.value)} placeholder={tr("M-Pesa number that will pay")} aria-label={tr("M-Pesa number that will pay")} disabled={buying} />
                <ShopButton className="h-auto min-h-11 px-3 py-2 text-sm" disabled={buying || payPhone.replace(/D/g, "").length < 9} onClick={confirmPlan}>
                  {tr(buying ? "Waiting for M-Pesa…" : "Send M-Pesa prompt")}
                </ShopButton>
                {payStep && <p className="text-xs font-bold text-emerald-500" role="status">{tr("Check your phone and enter your M-Pesa PIN. This page updates by itself.")}</p>}
                <p className="text-[11px] text-muted-foreground">{tr("Your plan opens as soon as Safaricom confirms the payment.")}</p>
              </>
            ) : PAYMENT_TEST_MODE ? (
              <>
                <p className="plans-test-mode">{tr("Test mode: payment is accepted automatically. No money is taken.")}</p>
                <ShopButton className="h-auto min-h-11 px-3 py-2 text-sm" disabled={buying} onClick={confirmPlan}>
                  {tr("Activate {x}", plan.name)}
                </ShopButton>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground">{tr("Online payment isn't available yet. You have not been charged.")}</p>
                <p className="text-xs text-muted-foreground">{tr("To activate this plan, contact support:")}</p>
                <p className="text-sm font-bold">
                  <a className="underline" href={`tel:${SUPPORT.phone}`}>{SUPPORT.phone}</a>
                  {" · "}
                  <a className="underline" href={`https://wa.me/${SUPPORT.whatsapp}`} target="_blank" rel="noreferrer">WhatsApp</a>
                </p>
              </>
            )}
            {!paidPlan && (
              <button type="button" onClick={askForTrial} className="text-[11px] font-bold text-emerald-500 hover:text-emerald-400 cursor-pointer">
                {tr("Use 30-day free trial instead")}
              </button>
            )}
          </div>
        </div>
        {trialDialog}
      </main>
    );
  }

  // =========================================================================
  // VIEW: MAIN RESPONSIVE PLANS COMPARISON (3 EQUAL COLUMNS ON ALL SCREENS)
  // =========================================================================
  return (
    <main
      dir={dir}
      className="plans-page plans-type min-h-[100dvh] w-full bg-background text-foreground flex flex-col justify-between p-2 sm:p-3 md:p-4 max-w-7xl mx-auto overflow-y-auto overflow-x-hidden select-none"
    >
      {/* 1. TOP HEADER WITH RESTORE PURCHASES AND CLOSE */}
      <header className="shrink-0 flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Wordmark className="text-xs sm:text-sm md:text-base font-black tracking-tight" />
          <span className="hidden sm:inline-block text-[11px] font-semibold text-muted-foreground truncate">
            — {tr("Unlock more features and grow your business with DataQuill Solutions")}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* A 30-second sale, POS to M-Pesa to receipt (owner, 2026-11-23). */}
          <button type="button" className="plans-tour-btn is-gift" onClick={() => setInvite(true)}><Gift aria-hidden /> {tr("Free month")}</button>
          <button type="button" className="plans-tour-btn" onClick={() => setTour(true)}><PlayCircle aria-hidden /> {tr("See a sale in 30 seconds")}</button>
          <button
            type="button"
            onClick={handleRestorePurchases}
            disabled={restoring}
            className="text-[11px] sm:text-xs font-bold text-blue-500 hover:text-blue-400 cursor-pointer disabled:opacity-50"
          >
            {restoring ? tr("Checking...") : tr("Restore Purchases")}
          </button>
          <button
            type="button"
            onClick={() => nav({ to: "/apps" })}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
            title={tr("Close")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {invite && <GlassPage label={tr("Invite a shop, get a free month")} onClose={() => setInvite(false)}><ReferralCard /></GlassPage>}
      {tour && <GlassPage label={tr("See a sale in 30 seconds")} onClose={() => setTour(false)}><SaleTour /><Testimonials /></GlassPage>}

      {/* 2. BILLING CYCLE TOGGLE IN SOLID EMERALD GREEN */}
      <div className="plans-billing-row flex justify-center items-center gap-2 shrink-0 my-0.5 sm:my-1">
        <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-muted/60 border border-border/80 shadow-inner w-full max-w-xs sm:max-w-sm justify-between">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              "flex-1 px-3 py-1 text-[11px] sm:text-xs font-bold rounded-full transition-all cursor-pointer text-center",
              !yearly
                ? "bg-emerald-600 text-white font-extrabold shadow-md shadow-emerald-600/30"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tr("Monthly")}
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={cn(
              "flex-1 px-3 py-1 text-[11px] sm:text-xs font-bold rounded-full transition-all cursor-pointer flex items-center justify-center gap-1",
              yearly
                ? "bg-emerald-600 text-white font-extrabold shadow-md shadow-emerald-600/30"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tr("Yearly")}</span>
            <span
              className={cn(
                "text-[10px] sm:text-[10px] font-extrabold uppercase px-1.5 py-0.2 rounded-full border transition-colors",
                yearly
                  ? "bg-white/20 text-white border-white/30"
                  : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
              )}
            >
              {tr("Save 10%")}
            </span>
          </button>
        </div>
        <div className="plans-currency">
          <span>{tr("Currency")}</span>
          <CurrencyChooser value={cur} onPick={pickCurrency} />
        </div>
      </div>

      {/* 3. THREE PLANS CARDS GRID (ELEVATED 3D HOVER, BOLDER BORDERS, STRICT 3-COLUMN) */}
      <div className={cn("plans-card-grid grid grid-cols-3 gap-1.5 md:gap-3 flex-1 min-h-0 items-stretch my-1", askedToSelect && "plans-nudge")}>
        {PLANS.map((p) => {
          const tColor = tone[p.id];
          // US dollars unless another currency is picked; yearly is rounded to the whole dollar first.
          const priceObj = convertUsdToCurrency(yearly ? Math.round(p.yearlyUsd) : p.monthlyUsd, cur);
          const isPlus = p.id === "growth";
          const isSelected = chosenPlanId === p.id;

          return (
            <div
              key={p.id}
              onClick={() => {
                setChosenPlanId(p.id);
                setAskedToSelect(false);
              }}
              data-selected={isSelected || undefined}
              className={cn(
                "relative rounded-xl border p-1.5 sm:p-2.5 md:p-3.5 flex flex-col justify-between transition-all duration-300 ease-out cursor-pointer overflow-visible text-left min-h-0",
                "hover:scale-[1.04] hover:-translate-y-1.5 hover:z-40 hover:shadow-2xl",
                isPlus
                  ? "bg-card/90 shadow-xl border-blue-500/80 hover:border-blue-400 hover:shadow-blue-500/30 z-20"
                  : p.id === "business"
                    ? "bg-card/75 shadow-md border-border/70 hover:border-amber-400 hover:shadow-amber-500/30 z-10"
                    : "bg-card/75 shadow-md border-border/70 hover:border-emerald-400 hover:shadow-emerald-500/20 z-10",
                isSelected && tColor.selected,
              )}
            >
              {isSelected && (
                <span className={cn("plan-selected-tick", tColor.btn)} role="img" aria-label={tr("Selected")}>
                  <Check aria-hidden="true" />
                </span>
              )}
              {/* TOP BADGES */}
              {paidPlan === p.id && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-40">
                  <span className="plans-yours px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider whitespace-nowrap">{tr("Your plan")}</span>
                </div>
              )}
              {p.recommended && paidPlan !== p.id && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-30">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[10px] font-extrabold uppercase tracking-wider bg-blue-600 text-white shadow-md shadow-blue-600/40 border border-blue-400/40 whitespace-nowrap">
                    {tr("RECOMMENDED")}
                  </span>
                </div>
              )}
              {p.best && paidPlan !== p.id && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-30">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[10px] font-extrabold uppercase tracking-wider bg-amber-500 text-black shadow-md shadow-amber-500/40 border border-amber-300 whitespace-nowrap">
                    {tr("BEST")}
                  </span>
                </div>
              )}

              {/* CARD HEADER */}
              <div className="text-center pt-0.5 sm:pt-1 shrink-0">
                {/* ICON BADGE */}
                <div className="flex justify-center mb-1">
                  <div
                    className={cn(
                      "p-1 sm:p-1.5 rounded-lg border flex items-center justify-center",
                      tColor.bg,
                      tColor.border,
                    )}
                  >
                    {p.id === "business" ? (
                      <Building2 className={cn("h-3 w-3 sm:h-4 sm:w-4", tColor.text)} />
                    ) : (
                      <Store className={cn("h-3 w-3 sm:h-4 sm:w-4", tColor.text)} />
                    )}
                  </div>
                </div>

                <h3 className={cn("text-[11px] sm:text-sm md:text-base font-black truncate", tColor.text)}>{p.name}</h3>

                {/* SUBTITLE IN BOLD */}
                <p className="text-[10px] sm:text-[10px] text-muted-foreground line-clamp-1 mt-0.5 font-bold">
                  {tr(p.subtitle)}
                </p>

                {/* PRICE ROW IN BOLD */}
                <div className="mt-1 flex items-baseline justify-center gap-0.5">
                  <span className="text-lg sm:text-2xl md:text-3xl plans-amount font-black text-foreground tracking-tight">
                    {priceObj.formatted}
                  </span>
                  <span className="text-[10px] sm:text-[11px] text-muted-foreground font-bold">
                    /{yearly ? tr("yr") : tr("mo")}
                  </span>
                </div>

                {/* Yearly: the saving in money, in the chosen currency (owner, 2026-11-24). */}
                {yearly && <p className="plans-saving">{tr("Save {x} a year", convertUsdToCurrency(Math.max(0, p.monthlyUsd * 12 - Math.round(p.yearlyUsd)), cur).formatted)}</p>}
                {/* CAPACITY PILL IN BOLD */}
                <div className="plan-allowance mt-1 rounded-lg px-1.5 py-0.5 bg-muted/60 text-muted-foreground border border-border/50">
                  {planAllowanceLines(p).map((line) => <div key={line}>{tr(line)}</div>)}
                  <div>{tr(planCounterLine(p))}</div>
                </div>
              </div>

              {/* FEATURES LIST IN BOLD (EXPANDED TO FILL FULL HEIGHT TO THE BUTTON) */}
              <div className="flex-1 my-1 sm:my-2 flex flex-col justify-between overflow-hidden min-h-0">
                {p.intro && (
                  <p className="text-[10px] sm:text-[10px] font-black text-muted-foreground uppercase tracking-wider border-b border-border/40 pb-0.5 mb-0.5 shrink-0">
                    {tr(p.intro)}
                  </p>
                )}
                <ul className="flex-1 flex flex-col justify-evenly py-0.5 min-h-0">
                  {p.features.map((f, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-1 text-[10px] sm:text-[10px] md:text-[10px] leading-tight font-bold"
                    >
                      <Check className={cn("h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0 mt-0.5", tColor.text)} />
                      <span className="text-foreground font-bold">{tr(f)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* ACTION BUTTON */}
              <div className="shrink-0 pt-1">
                <ShopButton
                  disabled={paidPlan === p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChosenPlanId(p.id);
                    setPaying(true);
                  }}
                  className={cn(
                    "w-full h-6 sm:h-7.5 md:h-8 text-[10px] sm:text-[11px] md:text-xs font-bold cursor-pointer shadow-sm",
                    tColor.btn,
                  )}
                >
                  {paidPlan === p.id ? (
                    tr("Your plan")
                  ) : (
                    <>
                      <span className="sm:hidden">{tr("Buy")}</span>
                      <span className="hidden sm:inline">{tr("Buy {x}", p.name)}</span>
                      <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-1" />
                    </>
                  )}
                </ShopButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. BOTTOM TRIAL CTA IN SOLID EMERALD GREEN */}
      <div className="relative shrink-0 pt-1">
        {cur !== "USD" && <p className="plans-terms plans-approx">{tr("Prices in {x} are approximate. You are charged the US dollar price, or its amount in KSh when paying by M-Pesa.", cur)}</p>}
        {!paidPlan && <p className="plans-terms">
          {tr("No payment details needed. Billing never starts automatically. After your 30-day trial ends, you can still view and export your existing records. Subscribe to add new transactions.")}
          <button type="button" onClick={() => setShowingLimits(true)}>{tr("How limits work")}</button>
          <button type="button" onClick={() => setComparing(true)}>{tr("Compare plans")}</button>
        </p>}
        {paidPlan && <p className="plans-terms"><button type="button" onClick={() => setComparing(true)}>{tr("Compare plans")}</button></p>}
        <button
          type="button"
          disabled={!!paidPlan}
          onClick={askForTrial}
          className="w-full h-8 sm:h-9 text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-md shadow-emerald-600/30 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-70 disabled:cursor-default"
        >
          {paidPlan ? (
            <span>{tr("You are on {x}", PLANS.find((p) => p.id === paidPlan)?.name ?? "")}</span>
          ) : (
            <>
              <span>{chosenPlanId ? trialLabel(plan.name) : tr("Start with 30-day free trial")}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
      {/* Shown in the middle of the screen (owner, 2026-11-24): at the bottom it hid behind the trial button on phones. */}
      {askedToSelect && typeof document !== "undefined" && createPortal(
        <div className="plans-select-first plans-type" role="alert" onClick={() => setAskedToSelect(false)}>
          <b>{tr("Choose a plan first")}</b>
          <span>{tr("Select one of these plans first, then start your 30-day free trial.")}</span>
        </div>, document.body,
      )}
      {trialDialog}
      {limitsDialog}
      {comparing && <GlassPage label={tr("Compare plans")} onClose={() => setComparing(false)}><ComparePlans cur={cur} yearly={yearly} paidPlan={paidPlan} onClose={() => setComparing(false)} /></GlassPage>}
    </main>
  );
}

/** Every currency's English name, for the chooser's list and search ("KES · Kenyan Shilling"). */
function currencyName(code: string) {
  try { return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code; } catch { return code; }
}

/** Currency for the plan prices (owner, 2026-11-24): a button showing the code that opens a list with a search box. Not a
 *  role="dialog", so the one-page fit leaves it at full size; closes on a choice, an outside tap or Escape. */
function CurrencyChooser({ value, onPick }: { value: string; onPick: (code: string) => void }) {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(false), [q, setQ] = useState("");
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => { if (!(e.target as Element | null)?.closest?.(".plans-cur")) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", out); window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", out); window.removeEventListener("keydown", esc); };
  }, [open]);
  const needle = q.trim().toLowerCase();
  const list = PLAN_CURRENCIES.map((c) => ({ c, name: currencyName(c) })).filter((x) => !needle || x.c.toLowerCase().includes(needle) || x.name.toLowerCase().includes(needle));
  const pick = (c: string) => { onPick(c); setOpen(false); setQ(""); };
  return <span className="plans-cur">
    <button type="button" className="plans-cur-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={tr("Show prices in")} onClick={() => setOpen(!open)}>
      {value} <ChevronDown aria-hidden />
    </button>
    {open && <span className="plans-cur-pop">
      <span className="plans-cur-search"><Search aria-hidden />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Search currency")} aria-label={tr("Search currency")}
          onKeyDown={(e) => { if (e.key === "Enter" && list[0]) pick(list[0].c); }} />
      </span>
      <span className="plans-cur-list" role="listbox" aria-label={tr("Show prices in")}>
        {list.map(({ c, name }) => <button key={c} type="button" role="option" aria-selected={c === value} className={cn(c === value && "is-on")} onClick={() => pick(c)}>
          <b>{c}</b><span>{name}</span>{c === value && <Check aria-hidden />}
        </button>)}
        {!list.length && <em>{tr("No currency found")}</em>}
      </span>
    </span>}
  </span>;
}

/** Every plan's features side by side with ticks (owner, 2026-11-24). Each plan includes the ones before it, so a feature listed under
 *  Growth is ticked for Growth and Business. Limits and prices come from PLANS, never typed in. */
function ComparePlans({ cur, yearly, paidPlan, onClose }: { cur: string; yearly: boolean; paidPlan: PlanId | null; onClose: () => void }) {
  const { tr } = useLanguage();
  const rows = PLANS.flatMap((p, i) => p.features.map((f) => ({ f, from: i })));
  return <div className="inventory-box dash-panel plans-compare plans-type">
    <div className="feature-panel-head"><h3>{tr("Compare plans")}</h3><button type="button" className="compare-shops-done" onClick={onClose}>{tr("Done")}</button></div>
    <div className="plans-compare-scroll" data-own-scroll>
      <table>
        <thead><tr><th />{PLANS.map((p) => <th key={p.id} className={cn(paidPlan === p.id && "is-yours")}>{p.name}<small>{convertUsdToCurrency(yearly ? Math.round(p.yearlyUsd) : p.monthlyUsd, cur).formatted}/{yearly ? tr("yr") : tr("mo")}</small></th>)}</tr></thead>
        <tbody>
          <tr className="is-limit"><th>{tr("Locations")}</th>{PLANS.map((p) => <td key={p.id}>{p.locations}</td>)}</tr>
          <tr className="is-limit"><th>{tr("Users")}</th>{PLANS.map((p) => <td key={p.id}>{p.maxUsers}</td>)}</tr>
          <tr className="is-limit"><th>{tr("Counters")}</th>{PLANS.map((p) => <td key={p.id}>{p.counters}</td>)}</tr>
          {rows.map(({ f, from }) => <tr key={f}><th>{tr(f)}</th>{PLANS.map((p, i) => <td key={p.id}>{i >= from ? <Check aria-label={tr("Included")} className="plans-compare-yes" /> : <span aria-label={tr("Not included")} className="plans-compare-no">—</span>}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
