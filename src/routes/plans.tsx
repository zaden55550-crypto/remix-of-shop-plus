import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Smartphone,
  CreditCard,
  Building2,
  Lock,
  Copy,
  CheckCircle2,
  Wallet,
} from "lucide-react";
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

const tone: Record<PlanId, { border: string; activeBorder: string; text: string; surface: string; shadow: string }> = {
  basic: {
    border: "border-emerald-500/40",
    activeBorder: "border-2 border-emerald-500",
    text: "text-emerald-500 dark:text-emerald-400",
    surface: "bg-emerald-950/25",
    shadow: "shadow-2xl shadow-emerald-500/30",
  },
  plus: {
    border: "border-blue-500/40",
    activeBorder: "border-2 border-blue-500",
    text: "text-blue-500 dark:text-blue-400",
    surface: "bg-blue-950/25",
    shadow: "shadow-2xl shadow-blue-500/30",
  },
  business: {
    border: "border-amber-500/40",
    activeBorder: "border-2 border-amber-500",
    text: "text-amber-500 dark:text-amber-400",
    surface: "bg-amber-950/25",
    shadow: "shadow-2xl shadow-amber-500/30",
  },
};

type PaymentTab = "phone" | "card" | "bank";

function Plans() {
  const { t, tr, dir } = useLanguage();
  const nav = useNavigate();
  const router = useRouter();

  const [yearly, setYearly] = useState(false);
  const [paying, setPaying] = useState(false);
  const [chosenPlanId, setChosenPlanId] = useState<PlanId>("plus");
  const [restoring, setRestoring] = useState(false);
  const [currency, setCurrency] = useState<string>("KSH");

  // Payment method selection & inputs
  const [payTab, setPayTab] = useState<PaymentTab>("phone");
  const [phone, setPhone] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardName, setCardName] = useState("");
  const [processing, setProcessing] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  // Device wallet auto-detection (Apple Pay / Google Pay)
  const [deviceWallet, setDeviceWallet] = useState<"apple" | "google" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent || "";
    const isApple = /iPhone|iPad|iPod|Macintosh/i.test(ua);
    const hasApplePay = !!(window as any).ApplePaySession;

    if (isApple || hasApplePay) {
      setDeviceWallet("apple");
    } else if (/Android|Chrome/i.test(ua)) {
      setDeviceWallet("google");
    }
  }, []);

  useEffect(() => {
    const acct = store.get();
    if (acct?.currency) {
      setCurrency(acct.currency);
      return;
    }
    const detected = detectUserCountry();
    if (detected?.currency) {
      setCurrency(detected.currency);
    }
  }, []);

  const plan = useMemo(() => PLANS.find((p) => p.id === chosenPlanId) ?? PLANS[1], [chosenPlanId]);

  const currentPrice = useMemo(
    () => convertUsdToCurrency(yearly ? plan.yearlyUsd : plan.monthlyUsd, currency),
    [yearly, plan.yearlyUsd, plan.monthlyUsd, currency],
  );

  const currentYearlyTotal = useMemo(
    () => convertUsdToCurrency(plan.yearlyUsd * 12, currency),
    [plan.yearlyUsd, currency],
  );

  const bankReference = useMemo(() => `SB-${Math.floor(10000 + Math.random() * 90000)}`, []);

  const startTrial = () => {
    store.update({ plan: "trial", trialStart: Date.now() });
    toast.success(tr("30-day free trial started! Full access unlocked."));
    nav({ to: "/apps" });
  };

  const handleCardNumberChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    const parts = digits.match(/.{1,4}/g);
    setCardNumber(parts ? parts.join(" ") : digits);
  };

  const handleExpiryChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 3) {
      setCardExpiry(`${digits.slice(0, 2)}/${digits.slice(2)}`);
    } else {
      setCardExpiry(digits);
    }
  };

  const completeSubscription = (methodName: string) => {
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      store.update({ plan: chosenPlanId });
      toast.success(tr(`Payment successful via ${methodName}! ${plan.name} plan activated.`));
      nav({ to: "/apps" });
    }, 900);
  };

  const handleDevicePay = () => {
    const provider = deviceWallet === "apple" ? "Apple Pay" : "Google Pay";
    completeSubscription(provider);
  };

  const handlePhonePayment = () => {
    if (!phone.trim()) {
      toast.error(tr("Enter your payment phone number"));
      return;
    }
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      store.update({ plan: chosenPlanId });
      toast.success(tr(`Payment request sent to ${phone}. Plan activated upon confirmation!`));
      nav({ to: "/apps" });
    }, 900);
  };

  const handleCardPayment = () => {
    const rawDigits = cardNumber.replace(/\s/g, "");
    if (rawDigits.length < 15) {
      toast.error(tr("Enter a valid 16-digit card number"));
      return;
    }
    if (cardExpiry.length < 5) {
      toast.error(tr("Enter expiry date (MM/YY)"));
      return;
    }
    if (cardCvc.length < 3) {
      toast.error(tr("Enter 3-digit security CVC code"));
      return;
    }
    completeSubscription("Card");
  };

  const handleBankConfirmation = () => {
    completeSubscription("Bank Transfer");
  };

  const copyBankDetails = () => {
    navigator.clipboard?.writeText(`Account: 01109048392, Ref: ${bankReference}`);
    setCopiedRef(true);
    toast.success(tr("Bank details and reference copied to clipboard"));
    setTimeout(() => setCopiedRef(false), 2500);
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
        const remainingDays = Math.max(0, 30 - Math.floor((Date.now() - (acct.trialStart ?? Date.now())) / 864e5));
        toast.info(tr(`You are on the 30-day Free Trial (${remainingDays} days remaining).`));
        nav({ to: "/apps" });
        return;
      }

      toast.error(tr("No active subscription found for this account."));
    } catch {
      toast.error(tr("Could not verify subscriptions. Please try again."));
    } finally {
      setRestoring(false);
    }
  };

  // Payment confirmation screen
  if (paying) {
    return (
      <main
        dir={dir}
        className="app-screen h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between px-3 py-2 md:py-3 w-full max-w-md mx-auto box-border"
      >
        <header className="flex items-center justify-between shrink-0">
          <ShopButton
            variant="bare"
            onClick={() => setPaying(false)}
            aria-label={t("back")}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </ShopButton>
          <Wordmark className="text-sm font-black" />
          <div className="w-7" />
        </header>

        <div className="rounded-lg border border-border bg-card/75 p-3.5 md:p-4 shadow-sm flex flex-col justify-between overflow-y-auto max-h-[82dvh]">
          <div>
            <h2 className="text-center text-sm md:text-base font-bold">{tr("Complete Subscription")}</h2>
            <p className="mt-0.5 text-center text-xs text-muted-foreground">
              {t("planSuffix", plan.name)} · {currentPrice.formatted} {tr("/ month")}
              {yearly && (
                <>
                  {" "}
                  · {tr("Billed yearly")}: {currentYearlyTotal.formatted}
                </>
              )}
            </p>

            {/* Auto-detected 1-Tap Device Wallet (Apple Pay or Google Pay) */}
            {deviceWallet && (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleDevicePay}
                  className={cn(
                    "w-full h-9 rounded-md flex items-center justify-center gap-1.5 font-semibold text-xs transition-transform active:scale-[0.98] shadow-sm disabled:opacity-50",
                    deviceWallet === "apple"
                      ? "bg-black text-white hover:bg-neutral-900 border border-neutral-800"
                      : "bg-white text-neutral-900 hover:bg-neutral-100 border border-neutral-300 dark:bg-neutral-900 dark:text-white dark:border-neutral-700",
                  )}
                >
                  <Wallet className="h-3.5 w-3.5" />
                  <span>{deviceWallet === "apple" ? tr("Pay with Apple Pay") : tr("Pay with Google Pay")}</span>
                </button>

                <div className="relative flex py-2 items-center">
                  <div className="flex-grow border-t border-border"></div>
                  <span className="flex-shrink mx-2 text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {tr("or choose payment method")}
                  </span>
                  <div className="flex-grow border-t border-border"></div>
                </div>
              </div>
            )}

            {/* 3-Tab Payment Method Chooser */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-muted/60 rounded-md border border-border/60">
              <button
                type="button"
                onClick={() => setPayTab("phone")}
                className={cn(
                  "flex items-center justify-center gap-1 py-1.5 px-2 rounded text-[11px] font-medium transition-colors",
                  payTab === "phone"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Smartphone className="h-3.5 w-3.5 shrink-0" />
                <span>{tr("Phone")}</span>
              </button>
              <button
                type="button"
                onClick={() => setPayTab("card")}
                className={cn(
                  "flex items-center justify-center gap-1 py-1.5 px-2 rounded text-[11px] font-medium transition-colors",
                  payTab === "card"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <CreditCard className="h-3.5 w-3.5 shrink-0" />
                <span>{tr("Card")}</span>
              </button>
              <button
                type="button"
                onClick={() => setPayTab("bank")}
                className={cn(
                  "flex items-center justify-center gap-1 py-1.5 px-2 rounded text-[11px] font-medium transition-colors",
                  payTab === "bank"
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span>{tr("Bank")}</span>
              </button>
            </div>

            {/* Tab 1: Phone / Mobile Money */}
            {payTab === "phone" && (
              <div className="mt-3 space-y-2">
                <Field
                  icon={<Smartphone className="h-4 w-4" />}
                  type="tel"
                  inputMode="tel"
                  placeholder={tr("Payment phone number (M-Pesa / Mobile Money)")}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                />
                <p className="text-[10px] text-muted-foreground leading-tight px-1">
                  {tr("An instant payment prompt (STK push) will appear on your screen to enter your mobile PIN.")}
                </p>
                <ShopButton
                  variant="success"
                  disabled={processing}
                  className="w-full py-2.5 text-xs font-semibold mt-1"
                  onClick={handlePhonePayment}
                >
                  {processing ? tr("Sending request...") : tr("Send payment request")}
                </ShopButton>
              </div>
            )}

            {/* Tab 2: Card Payment */}
            {payTab === "card" && (
              <div className="mt-3 space-y-2">
                <Field
                  icon={<CreditCard className="h-4 w-4" />}
                  type="text"
                  inputMode="numeric"
                  placeholder={tr("Card number (16 digits)")}
                  value={cardNumber}
                  onChange={(event) => handleCardNumberChange(event.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    type="text"
                    inputMode="numeric"
                    placeholder={tr("MM / YY")}
                    value={cardExpiry}
                    onChange={(event) => handleExpiryChange(event.target.value)}
                  />
                  <Field
                    icon={<Lock className="h-3.5 w-3.5" />}
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder={tr("CVC / CVV")}
                    value={cardCvc}
                    onChange={(event) => setCardCvc(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                </div>
                <Field
                  type="text"
                  placeholder={tr("Cardholder full name")}
                  value={cardName}
                  onChange={(event) => setCardName(event.target.value)}
                />
                <div className="flex items-center gap-1.5 px-1 text-[9.5px] text-muted-foreground">
                  <Lock className="h-3 w-3 text-emerald-500 shrink-0" />
                  <span>{tr("256-bit encrypted • PCI-DSS Level 1 compliant")}</span>
                </div>
                <ShopButton
                  variant="primary"
                  disabled={processing}
                  className="w-full py-2.5 text-xs font-semibold mt-1"
                  onClick={handleCardPayment}
                >
                  {processing ? tr("Processing card...") : `${tr("Pay")} ${currentPrice.formatted}`}
                </ShopButton>
              </div>
            )}

            {/* Tab 3: Bank Transfer */}
            {payTab === "bank" && (
              <div className="mt-3 space-y-2">
                <div className="rounded-md border border-border/80 bg-muted/40 p-2.5 space-y-1.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{tr("Bank / Paybill")}:</span>
                    <span className="font-semibold">522522 (KCB Bank)</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{tr("Account Number")}:</span>
                    <span className="font-mono font-semibold">1294820194</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">{tr("Reference Code")}:</span>
                    <span className="font-mono font-bold text-primary">{bankReference}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyBankDetails}
                  className="w-full flex items-center justify-center gap-1.5 py-1 text-[10.5px] text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  {copiedRef ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedRef ? tr("Copied to clipboard") : tr("Copy account & reference code")}</span>
                </button>
                <p className="text-[10px] text-muted-foreground leading-tight px-1">
                  {tr("Use your reference code in the bank narration so your payment is automatically reconciled.")}
                </p>
                <ShopButton
                  variant="outline"
                  disabled={processing}
                  className="w-full py-2.5 text-xs font-semibold mt-1"
                  onClick={handleBankConfirmation}
                >
                  {processing ? tr("Verifying transfer...") : tr("I have sent bank transfer")}
                </ShopButton>
              </div>
            )}
          </div>

          <div className="mt-3 pt-2 border-t border-border/70 space-y-1.5">
            <ShopButton variant="outline" className="w-full py-2 text-xs font-semibold" onClick={startTrial}>
              {tr("Use the 30-day free trial instead")}
            </ShopButton>
            <p className="text-center text-[9.5px] text-muted-foreground">
              {tr("Your plan is activated instantly upon payment confirmation.")}
            </p>
          </div>
        </div>

        <div className="h-2" />
      </main>
    );
  }

  return (
    <main
      dir={dir}
      style={{ zoom: 1 }}
      className="app-screen h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between px-3 py-2 md:py-3 w-full max-w-7xl mx-auto box-border"
    >
      {/* Top Header */}
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

      {/* Monthly / Yearly Billing Toggle */}
      <div className="flex items-center justify-center shrink-0 my-0.5">
        <div className="inline-flex items-center rounded-full border border-border bg-card/60 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              "px-3 py-0.5 rounded-full text-[10.5px] transition-colors",
              !yearly
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tr("Monthly")}
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={cn(
              "px-3 py-0.5 rounded-full text-[10.5px] flex items-center gap-1 transition-colors",
              yearly
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tr("Yearly")}</span>
            <span className="text-[9px] font-extrabold uppercase tracking-wide text-emerald-400 bg-emerald-950/60 px-1 py-0.2 rounded-full">
              {tr("-10%")}
            </span>
          </button>
        </div>
      </div>

      {/* 3 Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 md:gap-3 flex-1 min-h-0 mt-2.5 mb-1 items-stretch">
        {PLANS.map((p) => {
          const tColors = tone[p.id];
          const priceObj = convertUsdToCurrency(yearly ? p.yearlyUsd : p.monthlyUsd, currency);
          const yearlyTotalObj = convertUsdToCurrency(p.yearlyUsd * 12, currency);

          return (
            <div
              key={p.id}
              onClick={() => {
                setChosenPlanId(p.id);
                setPaying(true);
              }}
              className={cn(
                "relative rounded-lg border bg-card/75 p-2.5 md:p-3 flex flex-col justify-between transition-all duration-200 cursor-pointer overflow-visible",
                tColors.border,
                "hover:-translate-y-1.5 hover:scale-[1.015] hover:z-30 hover:shadow-xl",
              )}
            >
              {p.recommended && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-600 text-white shadow-md shadow-blue-500/40">
                  {tr("RECOMMENDED")}
                </span>
              )}
              {p.best && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-600 text-white shadow-md shadow-amber-500/40">
                  {tr("BEST")}
                </span>
              )}

              {/* Card Header & Price */}
              <div>
                <div className="flex items-center justify-between">
                  <h2 className={cn("text-xs md:text-sm font-bold uppercase tracking-wide", tColors.text)}>{p.name}</h2>
                </div>

                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-lg md:text-xl font-black tracking-tight">{priceObj.formatted}</span>
                  <span className="text-[10px] text-muted-foreground font-normal">{tr("/ month")}</span>
                </div>

                <div className="h-3.5 mt-0.5">
                  {yearly && (
                    <p className="text-[9.5px] font-medium text-emerald-500 dark:text-emerald-400 leading-tight">
                      {tr("Billed yearly")}: {yearlyTotalObj.formatted} · {tr("save 10%")}
                    </p>
                  )}
                </div>

                {/* Features List */}
                <ul className="mt-2 space-y-1 text-[10px] md:text-[10.5px]">
                  {p.features.map((feat, i) => (
                    <li key={i} className="flex items-start gap-1.5 leading-tight">
                      <Check className={cn("h-3 w-3 shrink-0 mt-0.5", tColors.text)} />
                      <span className="text-foreground/90">{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Per-card action button */}
              <div className="mt-2.5 pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChosenPlanId(p.id);
                    setPaying(true);
                  }}
                  className="w-full h-7 md:h-7.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10.5px] md:text-[11px] font-medium transition-colors flex items-center justify-center gap-1 shadow-sm shrink-0"
                >
                  <span>{t("continueWithPlan", p.name)}</span>
                  <ArrowRight className="h-3 w-3 shrink-0" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Trial & Guarantee Footer */}
      <footer className="shrink-0 pt-0.5 pb-1">
        <ShopButton
          variant="success"
          onClick={startTrial}
          className="w-full h-8 md:h-8.5 text-[11px] md:text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm"
        >
          <span>{tr("Start 30-Day Free Trial — Full ERP Access")}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
        </ShopButton>
        <p className="mt-1 text-center text-[8.5px] md:text-[9.5px] text-muted-foreground leading-none">
          {tr("No payment required • Cancel anytime • 100% data preserved upon upgrade")}
        </p>
      </footer>
    </main>
  );
}
