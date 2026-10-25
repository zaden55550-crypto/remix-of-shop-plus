import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Field, Wordmark } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { PLANS, store, type PlanId } from "@/lib/shopbook";
import { convertUsdToCurrency, detectUserCountry } from "@/lib/world-data";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Choose Your Plan — SHOPBOOK ERP" },
      {
        name: "description",
        content:
          "Compare Basic ($11), Plus ($22) and Business ($40) SHOPBOOK plans, or start a free 30-day full ERP trial.",
      },
      { property: "og:title", content: "Choose Your Plan — SHOPBOOK ERP" },
      { property: "og:description", content: "Compare SHOPBOOK plans or start a free 30-day trial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Plans,
});

const tone: Record<PlanId, { border: string; text: string; surface: string }> = {
  basic: {
    border: "border-emerald-500/60",
    text: "text-emerald-400",
    surface: "bg-emerald-950/20",
  },
  plus: {
    border: "border-blue-500",
    text: "text-blue-400",
    surface: "bg-blue-950/30",
  },
  business: {
    border: "border-purple-500/60",
    text: "text-purple-400",
    surface: "bg-purple-950/20",
  },
};

function Plans() {
  const nav = useNavigate();
  const { tr, t, dir } = useLanguage();
  const router = useRouter();
  const [yearly, setYearly] = useState(false);
  const [selected, setSelected] = useState<PlanId>("plus");
  const [paying, setPaying] = useState(false);
  const [phone, setPhone] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [restoring, setRestoring] = useState(false);

  // Read stored account currency, with fallback to detected country
  useEffect(() => {
    const acct = store.get();
    if (acct?.currency) {
      setCurrency(acct.currency.toUpperCase());
    } else {
      const detected = detectUserCountry();
      setCurrency(detected.currencyCode || "USD");
    }
  }, []);

  const plan = useMemo(
    () => (PLANS.find((item) => item.id === selected) ?? PLANS[1]) as (typeof PLANS)[number],
    [selected],
  );

  const currentMonthlyUsd = yearly ? plan.yearlyUsd / 12 : plan.monthlyUsd;
  const currentPrice = convertUsdToCurrency(currentMonthlyUsd, currency);
  const currentYearlyTotal = convertUsdToCurrency(plan.yearlyUsd, currency);

  const startTrial = () => {
    const a = store.get();
    if (a?.trialStart && Date.now() - a.trialStart >= 30 * 864e5) {
      toast.error(tr("Your 30-day free trial has ended. Choose a plan to continue."));
      return;
    }
    store.update({ plan: "trial", trialStart: a?.trialStart ?? Date.now() });
    nav({ to: "/apps" });
  };

  const handleSelectPlan = (id: PlanId) => {
    setSelected(id);
    setPaying(true);
  };

  const handleRestorePurchases = async () => {
    setRestoring(true);
    try {
      const acct = store.get();
      await new Promise((res) => setTimeout(res, 600));

      if (acct?.plan && acct.plan !== "trial") {
        toast.success(tr(`Active ${acct.plan.toUpperCase()} subscription restored!`));
        nav({ to: "/apps" });
        return;
      }

      if (acct?.plan === "trial") {
        toast.info(tr("Active 30-day free trial restored."));
        nav({ to: "/apps" });
        return;
      }

      toast.info(tr("No previous active subscription found for this account."));
    } catch {
      toast.error(tr("Could not restore purchases. Please check your connection and try again."));
    } finally {
      setRestoring(false);
    }
  };

  const requestPayment = () => {
    const cleaned = phone.replace(/\s+/g, "");
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(cleaned)) {
      toast.error(tr("Enter a valid phone number"));
      return;
    }
    toast(tr("Online payments are coming soon. Start the free trial for now — your data stays when you upgrade."));
  };

  if (paying) {
    return (
      <main
        dir={dir}
        style={{ zoom: 1 }}
        className="app-screen h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between px-4 py-3 md:max-w-md mx-auto"
      >
        <div>
          <div className="flex items-center justify-between mb-2">
            <ShopButton variant="bare" onClick={() => setPaying(false)} aria-label={t("back")} className="h-8 w-8 p-0">
              <ChevronLeft className="rtl:rotate-180" />
            </ShopButton>
            <Wordmark />
            <div className="w-8" />
          </div>

          <h1 className="mt-2 text-center text-xl font-bold">{tr("Confirm Subscription")}</h1>
          <p className="mt-0.5 text-center text-xs text-muted-foreground">
            {t("planSuffix", plan.name)} · {currentPrice.formatted} {tr("/ month")}
            {yearly && (
              <>
                {" "}
                · {tr("Billed yearly")}: {currentYearlyTotal.formatted}
              </>
            )}
          </p>

          <div className="mt-4 space-y-2.5">
            <Field
              icon={<Smartphone className="h-4 w-4" />}
              type="tel"
              inputMode="tel"
              placeholder={tr("Payment phone number (M-Pesa / Mobile Money)")}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
            <ShopButton variant="success" className="w-full py-2.5 text-xs font-semibold" onClick={requestPayment}>
              {tr("Send payment request")}
            </ShopButton>
            <ShopButton variant="outline" className="w-full py-2.5 text-xs font-semibold" onClick={startTrial}>
              {tr("Use the 30-day free trial instead")}
            </ShopButton>
          </div>
        </div>

        <p className="text-center text-[10px] text-muted-foreground pb-2">
          {tr("Your plan is only activated after payment is confirmed.")}
        </p>
      </main>
    );
  }

  return (
    <main
      dir={dir}
      style={{ zoom: 1 }}
      className="app-screen h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between px-3 py-2 md:py-3 w-full max-w-7xl mx-auto box-border"
    >
      {/* Top Header: Back + Wordmark + Restore Purchases & Currency */}
      <header className="flex items-center justify-between shrink-0">
        <ShopButton
          variant="bare"
          onClick={() => router.history.back()}
          aria-label={t("back")}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </ShopButton>
        <Wordmark className="text-sm font-black" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={restoring}
            onClick={handleRestorePurchases}
            className="text-[9.5px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-50 whitespace-nowrap"
            title={tr("Check and restore your previous active subscription")}
          >
            {restoring ? tr("Restoring...") : tr("Restore Purchases")}
          </button>
          <button
            type="button"
            onClick={() => setCurrency((c) => (c === "USD" ? store.get()?.currency || "KSH" : "USD"))}
            className="text-[9.5px] font-bold px-2.5 py-0.5 rounded-full border border-border bg-card/70 text-foreground/80 hover:bg-card"
            title={tr("Switch currency display")}
          >
            {currency}
          </button>
        </div>
      </header>

      {/* Title & Subtitle */}
      <div className="text-center shrink-0 my-0.5">
        <h1 className="text-sm md:text-base font-bold leading-tight">{tr("Choose Your Plan")}</h1>
        <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
          {tr("Unlock more features and grow your business with SHOPBOOK")}
        </p>
      </div>

      {/* Monthly / Yearly Switch */}
      <div className="mx-auto shrink-0 mb-1 grid w-full max-w-[220px] grid-cols-2 rounded-full border border-border bg-card/70 p-0.5 text-[10px]">
        <button
          type="button"
          onClick={() => setYearly(false)}
          className={cn(
            "rounded-full py-0.5 px-2 font-bold transition-all",
            !yearly ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tr("Monthly")}
        </button>
        <button
          type="button"
          onClick={() => setYearly(true)}
          className={cn(
            "rounded-full py-0.5 px-2 font-bold transition-all",
            yearly ? "bg-emerald-600 text-white shadow-xs" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tr("Yearly (Save 10%)")}
        </button>
      </div>

      {/* 3 Plans Columns Grid - Fills available screen space */}
      <div className="grid grid-cols-3 gap-2 flex-1 min-h-0 items-stretch my-1 w-full">
        {PLANS.map((item) => {
          const isMid = item.id === "plus";
          const isBest = item.id === "business";
          const itemTone = tone[item.id];

          const monthlyEquivalentUsd = yearly ? item.yearlyUsd / 12 : item.monthlyUsd;
          const displayPrice = convertUsdToCurrency(monthlyEquivalentUsd, currency);
          const yearlyTotal = convertUsdToCurrency(item.yearlyUsd, currency);

          return (
            <div
              key={item.id}
              className={cn(
                "relative flex flex-col justify-between rounded-lg border p-2 text-start transition-all overflow-hidden",
                isMid
                  ? "border-2 border-blue-500 shadow-md shadow-blue-500/10"
                  : isBest
                    ? "border-2 border-orange-500/80 shadow-md shadow-orange-500/10"
                    : itemTone.border,
                itemTone.surface,
              )}
            >
              {/* RECOMMENDED Badge for Middle Plan */}
              {isMid && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-white shadow-xs whitespace-nowrap">
                  RECOMMENDED
                </span>
              )}

              {/* BEST Badge in Orange for Business Plan */}
              {isBest && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-white shadow-xs whitespace-nowrap">
                  BEST
                </span>
              )}

              {/* Card Content */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div
                  className={cn(
                    "text-center text-[10px] md:text-xs font-black uppercase tracking-wider",
                    (isMid || isBest) && "mt-1",
                    isBest ? "text-orange-400" : itemTone.text,
                  )}
                >
                  {item.name}
                </div>

                {/* Price and / month on ONE ROW */}
                <div className="mt-0.5 flex items-baseline justify-center gap-1 leading-tight text-center">
                  <span className="text-xs md:text-sm font-black tracking-tight">{displayPrice.formatted}</span>
                  <span className="text-[8px] md:text-[9px] text-muted-foreground font-medium">{tr("/ month")}</span>
                </div>

                {/* Yearly Save 10% Calculation Row */}
                <div className="text-center text-[8px] md:text-[8.5px] text-emerald-600 dark:text-emerald-400 font-semibold leading-none mt-0.5 truncate">
                  {yearly ? `${tr("Save 10%")}: ${yearlyTotal.formatted}/${tr("yr")}` : `${tr("Yearly: save 10%")}`}
                </div>

                <div className="my-1 border-t border-border/40" />

                <div className="text-center text-[8.5px] text-muted-foreground leading-tight truncate mb-1">
                  {tr(item.tagline)}
                </div>

                {/* Features Bullets (Scrolls cleanly if height is limited) */}
                <ul className="flex-1 min-h-0 overflow-y-auto space-y-0.5 text-[8.5px] md:text-[9px] leading-tight text-foreground/90 pr-0.5">
                  {item.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1">
                      <span className={cn("shrink-0 font-bold", isBest ? "text-orange-400" : itemTone.text)}>•</span>
                      <span className="truncate">{tr(feature)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button: Height added (h-7/h-8), pinned shrink-0, thin/normal font */}
              <ShopButton
                type="button"
                className="mt-1.5 w-full shrink-0 flex items-center justify-center gap-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white font-normal py-1 px-2 text-[8.5px] md:text-[9.5px] shadow-xs transition-all h-6.5 md:h-7"
                onClick={() => handleSelectPlan(item.id)}
              >
                <span>{tr("Continue with {x}", item.name)}</span>
                <ArrowRight className="h-2.5 w-2.5 shrink-0" />
              </ShopButton>
            </div>
          );
        })}
      </div>

      {/* Bottom Free Trial: Expanded to fill screen width nicely */}
      <footer className="shrink-0 pt-1.5 w-full text-center">
        <ShopButton
          variant="success"
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2 md:py-2.5 px-4 text-xs md:text-sm font-bold shadow-md transition-all h-8.5 md:h-9.5"
          onClick={startTrial}
        >
          <span>{tr("Get Started with Your 30-Day Free Trial")}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </ShopButton>
        <p className="mt-1 text-center text-[8.5px] md:text-[9.5px] text-muted-foreground leading-none">
          {tr("No payment required • Cancel anytime • 100% data preserved upon upgrade")}
        </p>
      </footer>
    </main>
  );
}
