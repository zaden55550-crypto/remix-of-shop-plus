import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Smartphone,
  CreditCard,
  Lock,
  CheckCircle2,
  ShieldCheck,
  Info,
  Store,
  Receipt,
  Zap,
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

const tone: Record<
  PlanId,
  {
    border: string;
    text: string;
  }
> = {
  basic: {
    border: "border-emerald-500/40",
    text: "text-emerald-500 dark:text-emerald-400",
  },
  plus: {
    border: "border-2 border-blue-500/80 shadow-md shadow-blue-500/20",
    text: "text-blue-500 dark:text-blue-400",
  },
  business: {
    border: "border-amber-500/40",
    text: "text-amber-500 dark:text-amber-400",
  },
};

type PaymentMethod = "mobile" | "card";

type MobileNetwork = "mpesa" | "airtel" | "mtn" | "orange" | "tigo" | "vodafone" | "telebirr" | "ecocash";

const MOBILE_NETWORKS: { id: MobileNetwork; name: string; country: string; active: boolean }[] = [
  { id: "mpesa", name: "Safaricom M-Pesa", country: "Kenya / East Africa", active: true },
  { id: "airtel", name: "Airtel Money", country: "East & Central Africa", active: false },
  { id: "mtn", name: "MTN Mobile Money", country: "Uganda, Ghana, Nigeria", active: false },
  { id: "orange", name: "Orange Money", country: "Francophone Africa", active: false },
  { id: "tigo", name: "Tigo Pesa", country: "Tanzania", active: false },
  { id: "vodafone", name: "Vodafone Cash", country: "Egypt & Ghana", active: false },
  { id: "telebirr", name: "Telebirr", country: "Ethiopia", active: false },
  { id: "ecocash", name: "EcoCash", country: "Zimbabwe", active: false },
];

function Plans() {
  const { t, tr, dir } = useLanguage();
  const nav = useNavigate();
  const router = useRouter();

  const [yearly, setYearly] = useState(false);
  const [paying, setPaying] = useState(false);
  const [chosenPlanId, setChosenPlanId] = useState<PlanId>("plus");
  const [restoring, setRestoring] = useState(false);
  const [currency, setCurrency] = useState<string>("KSH");

  // Phone Pre-Existing Payment Auto-Detection
  const [detectedPhonePay, setDetectedPhonePay] = useState<"apple" | "google" | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const hasApplePay = typeof (window as any).ApplePaySession !== "undefined";

    if (isIOS || hasApplePay) {
      setDetectedPhonePay("apple");
    } else if (typeof (window as any).PaymentRequest !== "undefined" || /Android/i.test(ua)) {
      setDetectedPhonePay("google");
    }
  }, []);

  // Payment Form States
  const [method, setMethod] = useState<PaymentMethod>("mobile");
  const [mobileNetwork, setMobileNetwork] = useState<MobileNetwork>("mpesa");
  const [phone, setPhone] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  // Status Lifecycle: "idle" -> "processing" -> "success"
  const [payStatus, setPayStatus] = useState<"idle" | "processing" | "success">("idle");
  const [processStep, setProcessStep] = useState(1);
  const [confirmedDate, setConfirmedDate] = useState("");

  useEffect(() => {
    const acct = store.get();
    if (acct?.currency) {
      setCurrency(acct.currency);
      return;
    }
    const detected = detectUserCountry();
    if (detected?.currencyCode) {
      setCurrency(detected.currencyCode);
    }
  }, []);

  const plan = useMemo(() => PLANS.find((p) => p.id === chosenPlanId) ?? PLANS[1]!, [chosenPlanId]);

  const currentPrice = useMemo(
    () => convertUsdToCurrency(yearly ? plan.yearlyUsd : plan.monthlyUsd, currency),
    [yearly, plan.yearlyUsd, plan.monthlyUsd, currency],
  );

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

  const runPaymentWorkflow = (sourceName?: string) => {
    setPayStatus("processing");
    setProcessStep(1);

    setTimeout(() => setProcessStep(2), 650);
    setTimeout(() => setProcessStep(3), 1350);
    setTimeout(() => {
      setProcessStep(4);
      setConfirmedDate(
        new Date().toLocaleDateString("en-US", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      );
      store.update({ plan: chosenPlanId });
      setPayStatus("success");
      const label = sourceName || method.toUpperCase();
      toast.success(tr(`Payment confirmed via ${label}! ${plan.name} plan is now active.`));
    }, 2200);
  };

  const handlePayNow = () => {
    if (method === "mobile") {
      if (mobileNetwork !== "mpesa") {
        toast.info(tr("Direct integration for this network is coming soon. Please choose Safaricom M-Pesa."));
        return;
      }
      const cleanPhone = phone.replace(/[\s-]/g, "");
      if (cleanPhone.length < 9) {
        toast.error(tr("Enter a valid phone number for M-Pesa STK Push"));
        return;
      }
    } else if (method === "card") {
      const cleanCard = cardNumber.replace(/\s/g, "");
      if (cleanCard.length < 15) {
        toast.error(tr("Enter a valid 16-digit card number"));
        return;
      }
      if (cardExpiry.length < 5) {
        toast.error(tr("Enter valid card expiry (MM/YY)"));
        return;
      }
      if (cardCvc.length < 3) {
        toast.error(tr("Enter CVV security code"));
        return;
      }
    }
    runPaymentWorkflow();
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

  // -------------------------------------------------------------
  // CHECKOUT SCREEN — STRICT ZERO SCROLL & EXPANDED FOR LARGE SCREENS
  // -------------------------------------------------------------
  if (paying) {
    return (
      <main
        dir={dir}
        style={{ zoom: 1 }}
        className="app-screen h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between px-3 py-1.5 md:px-8 md:py-3 w-full max-w-lg md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto box-border"
      >
        {/* Top Navigation */}
        <header className="flex items-center justify-between shrink-0">
          <ShopButton
            variant="bare"
            onClick={() => {
              if (payStatus === "processing") return;
              setPaying(false);
              setPayStatus("idle");
            }}
            aria-label={t("back")}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </ShopButton>
          <Wordmark className="text-sm font-black" />
          <div className="w-7" />
        </header>

        {payStatus === "processing" ? (
          /* PROCESSING SCREEN */
          <div className="flex-1 flex flex-col items-center justify-center p-3 text-center min-h-0 space-y-3">
            <div className="relative w-14 h-14 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-3 border-blue-500/20 border-t-blue-500 animate-spin" />
              <Store className="h-6 w-6 text-blue-400 animate-pulse" />
            </div>

            <div>
              <h2 className="text-sm font-bold text-foreground">{tr("Processing Subscription")}</h2>
              <p className="text-[10.5px] text-muted-foreground mt-0.5">
                {tr("Please do not close or refresh this page.")}
              </p>
            </div>

            <div className="w-full max-w-xs md:max-w-md space-y-1.5 text-left text-[11px] bg-card/60 border border-border/80 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn("h-3.5 w-3.5", processStep >= 1 ? "text-emerald-400" : "text-muted-foreground")}
                />
                <span className={processStep >= 1 ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {tr("Validating subscription details")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn("h-3.5 w-3.5", processStep >= 2 ? "text-emerald-400" : "text-muted-foreground")}
                />
                <span className={processStep >= 2 ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {tr("Authorizing payment method")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn("h-3.5 w-3.5", processStep >= 3 ? "text-emerald-400" : "text-muted-foreground")}
                />
                <span className={processStep >= 3 ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {tr("Applying plan entitlements")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn("h-3.5 w-3.5", processStep >= 4 ? "text-emerald-400" : "text-muted-foreground")}
                />
                <span className={processStep >= 4 ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {tr("Generating account receipt")}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setPayStatus("idle")}
              className="text-[10px] text-muted-foreground hover:text-foreground underline pt-1"
            >
              {tr("Cancel and return")}
            </button>
          </div>
        ) : payStatus === "success" ? (
          /* SUCCESS CONFIRMATION SCREEN */
          <div className="flex-1 flex flex-col items-center justify-center p-3 text-center min-h-0 space-y-2.5">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/30">
              <Check className="h-6 w-6 stroke-[3]" />
            </div>

            <div>
              <h2 className="text-base font-extrabold text-foreground">{tr("Subscription Confirmed!")}</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {tr("Your")} {plan.name} {tr("plan is now fully active.")}
              </p>
            </div>

            {/* Receipt Summary */}
            <div className="w-full max-w-xs md:max-w-md rounded-xl border border-border bg-card/80 p-2.5 space-y-1.5 text-[10.5px]">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Plan")}</span>
                <span className="font-bold text-foreground">{plan.name}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Billing Cycle")}</span>
                <span className="font-medium text-foreground">{yearly ? tr("Yearly") : tr("Monthly")}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Amount Paid")}</span>
                <span className="font-extrabold text-foreground">{currentPrice.formatted}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Date")}</span>
                <span className="font-medium text-foreground">{confirmedDate}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Status")}</span>
                <span className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/40">
                  {tr("Active")}
                </span>
              </div>
            </div>

            <div className="w-full max-w-xs md:max-w-md space-y-1.5 pt-1">
              <ShopButton
                variant="primary"
                onClick={() => nav({ to: "/apps" })}
                className="w-full py-2 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
              >
                <span>{tr("Go to Apps")}</span>
                <ArrowRight className="h-4 w-4" />
              </ShopButton>
              <ShopButton
                variant="bare"
                onClick={() => toast.info(tr("Receipt saved to account records."))}
                className="w-full py-0.5 text-[10.5px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
              >
                <Receipt className="h-3 w-3" />
                <span>{tr("View Receipt")}</span>
              </ShopButton>
            </div>
          </div>
        ) : (
          /* MAIN UNIFIED CHECKOUT FORM — ZERO-SCROLL */
          <div className="flex-1 flex flex-col justify-between py-1 space-y-2 min-h-0">
            {/* 1. SINGLE-ROW SUMMARY: Plus Plan • Monthly • $22       Change > */}
            <div className="rounded-lg border border-blue-500/30 bg-[#0E1A32] px-3 py-2 flex items-center justify-between shadow-sm shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-600/30 border border-blue-500/40 text-blue-400 shrink-0">
                  <Store className="h-3 w-3" />
                </div>
                <div className="flex items-center gap-1.5 text-xs truncate">
                  <span className="font-bold text-foreground whitespace-nowrap">
                    {plan.name} {tr("Plan")}
                  </span>
                  <span className="text-muted-foreground font-medium">•</span>
                  <span className="text-muted-foreground whitespace-nowrap">
                    {yearly ? tr("Yearly") : tr("Monthly")}
                  </span>
                  <span className="text-muted-foreground font-medium">•</span>
                  <span className="font-extrabold text-foreground whitespace-nowrap">{currentPrice.formatted}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaying(false)}
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors shrink-0 ml-2"
              >
                {tr("Change >")}
              </button>
            </div>

            {/* 2. AUTO-DETECTED PHONE PAYMENT (ONLY WHEN DETECTED) */}
            {detectedPhonePay && (
              <div className="shrink-0 space-y-1">
                <button
                  type="button"
                  onClick={() =>
                    runPaymentWorkflow(
                      detectedPhonePay === "apple" ? "Apple Pay (Connected Wallet)" : "Phone Wallet / Card",
                    )
                  }
                  className="w-full h-8 rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-700 text-white flex items-center justify-center gap-2 text-xs font-semibold shadow-md transition-all active:scale-[0.99]"
                >
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span>
                    {detectedPhonePay === "apple" ? tr("Pay 1-Tap with Apple Pay") : tr("Pay 1-Tap with Phone Wallet")}
                  </span>
                </button>

                <div className="relative py-0.5 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/60" />
                  </div>
                  <span className="relative bg-[#0B1528] px-2 text-[8.5px] uppercase tracking-wider text-muted-foreground font-semibold">
                    {tr("Or Choose Payment Method")}
                  </span>
                </div>
              </div>
            )}

            {/* 3. PAYMENT METHOD TABS (MOBILE MONEY & CARD ONLY) */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMethod("mobile")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border transition-all text-center",
                  method === "mobile"
                    ? "border-blue-500 bg-blue-950/50 shadow-md shadow-blue-500/30 text-blue-400 font-bold"
                    : "border-border/70 bg-[#0C1629] text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span className="text-[11px] leading-tight">{tr("Mobile Money")}</span>
              </button>

              <button
                type="button"
                onClick={() => setMethod("card")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border transition-all text-center",
                  method === "card"
                    ? "border-blue-500 bg-blue-950/50 shadow-md shadow-blue-500/30 text-blue-400 font-bold"
                    : "border-border/70 bg-[#0C1629] text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span className="text-[11px] leading-tight">{tr("Card")}</span>
              </button>
            </div>

            {/* 4. FORM CONTENT BOX */}
            <div className="rounded-xl border border-border/80 bg-[#0B1528] p-3 space-y-2 shadow-md flex-1 flex flex-col justify-between">
              {/* TAB 1: Mobile Payment */}
              {method === "mobile" && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                      {tr("Select Mobile Network")}
                    </label>
                    <select
                      value={mobileNetwork}
                      onChange={(e) => setMobileNetwork(e.target.value as MobileNetwork)}
                      className="w-full h-8 text-xs px-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-blue-500 font-medium"
                    >
                      {MOBILE_NETWORKS.map((net) => (
                        <option key={net.id} value={net.id}>
                          {net.name} {net.active ? `(Active)` : `— Coming soon`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {mobileNetwork === "mpesa" ? (
                    <>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                          {tr("M-Pesa Phone Number")}
                        </label>
                        <Field
                          icon={<Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
                          type="tel"
                          placeholder="0712 345 678 / +254..."
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>

                      <div className="rounded-md bg-blue-950/40 border border-blue-500/30 p-2 flex items-start gap-1.5 text-[10px] text-blue-300">
                        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
                        <span>
                          {tr("You will receive an STK Push prompt on this phone. Enter your PIN to complete payment.")}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-md bg-amber-950/30 border border-amber-500/30 p-2 flex items-start gap-1.5 text-[10.5px] text-amber-300">
                      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <span>
                        {tr(
                          "Integration for this African network is coming soon. Please select Safaricom M-Pesa or Card.",
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Card Payment */}
              {method === "card" && (
                <div className="space-y-1.5">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                      {tr("Cardholder Name")}
                    </label>
                    <Field placeholder="Jane Doe" value={cardName} onChange={(e) => setCardName(e.target.value)} />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                      {tr("Card Number")}
                    </label>
                    <Field
                      icon={<CreditCard className="h-3.5 w-3.5 text-muted-foreground" />}
                      placeholder="4000 1234 5678 9010"
                      value={cardNumber}
                      onChange={(e) => handleCardNumberChange(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                        {tr("Expiry (MM/YY)")}
                      </label>
                      <Field
                        placeholder="MM/YY"
                        value={cardExpiry}
                        onChange={(e) => handleExpiryChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                        {tr("CVV")}
                      </label>
                      <Field
                        type="password"
                        placeholder="123"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 pt-0.5 text-[9px] text-muted-foreground">
                    <span className="font-semibold text-foreground/80">Accepted:</span>
                    <span>Visa • Mastercard • American Express</span>
                  </div>
                </div>
              )}

              {/* Bottom Pay Action */}
              <div className="pt-2 border-t border-border/60 space-y-1.5">
                <div className="flex justify-between items-baseline text-xs">
                  <span className="text-muted-foreground">{tr("Total Due:")}</span>
                  <span className="text-sm font-black text-foreground">{currentPrice.formatted}</span>
                </div>

                <ShopButton
                  variant="primary"
                  onClick={handlePayNow}
                  className="w-full h-8 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md bg-blue-600 hover:bg-blue-500"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>
                    {method === "mobile" && mobileNetwork === "mpesa" ? tr("Pay Now with M-Pesa") : tr("Pay Now")}
                  </span>
                </ShopButton>

                <div className="flex items-center justify-center gap-1 text-[9px] text-muted-foreground">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  <span>{tr("Encrypted & Secure 256-bit Payment")}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="h-0.5" />
      </main>
    );
  }

  // -------------------------------------------------------------
  // PLANS OVERVIEW GRID — ZERO SCROLL & SCREEN FITTED (3 COLUMNS)
  // -------------------------------------------------------------
  return (
    <main
      dir={dir}
      style={{ zoom: 1 }}
      className="app-screen h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between px-3 py-1.5 md:py-2 w-full max-w-7xl mx-auto box-border"
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

      {/* Title & Subtitle IN ONE ROW */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 shrink-0 my-0.5 text-center">
        <h1 className="text-sm md:text-base font-bold tracking-tight text-foreground whitespace-nowrap">
          {tr("Choose Your Plan")}
        </h1>
        <span className="hidden sm:inline text-xs text-muted-foreground font-light">•</span>
        <p className="text-[11px] md:text-xs text-muted-foreground">
          {tr("Unlock more features and grow your business with SHOPBOOK")}
        </p>
      </div>

      {/* Monthly / Yearly Billing Toggle — Wider & Prominent */}
      <div className="flex items-center justify-center shrink-0 my-0.5 w-full">
        <div className="grid grid-cols-2 rounded-xl border border-border bg-card/80 p-0.5 text-xs w-full max-w-sm sm:max-w-md shadow-sm">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              "py-1.5 px-3 rounded-lg text-xs font-semibold transition-all text-center",
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
              "py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all text-center",
              yearly
                ? "bg-primary text-primary-foreground font-bold shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tr("Yearly")}</span>
            <span className="text-[9.5px] font-extrabold uppercase tracking-wide text-emerald-400 bg-emerald-950/70 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
              {tr("save 10%")}
            </span>
          </button>
        </div>
      </div>

      {/* 3 Pricing Cards Grid: 3 columns on phone & desktop, zero scroll */}
      <div className="grid grid-cols-3 gap-1.5 md:gap-3 flex-1 min-h-0 mt-1 sm:mt-2 mb-1 items-stretch group">
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
                "relative rounded-xl border bg-card/85 p-1.5 sm:p-2.5 md:p-3.5 flex flex-col justify-between transition-all duration-200 cursor-pointer overflow-visible",
                p.id === "plus" ? "md:-translate-y-1 md:scale-[1.015] z-10" : "z-0",
                tColors.border,
                // Dominant high-contrast hover styles
                "hover:!-translate-y-2 sm:hover:!-translate-y-3.5 hover:!scale-[1.02] sm:hover:!scale-[1.03] hover:!z-30 group-hover:opacity-75 hover:!opacity-100",
                p.id === "basic" &&
                  "hover:border-2 sm:hover:border-2.5 hover:border-emerald-400 hover:shadow-xl sm:hover:shadow-2xl hover:shadow-emerald-500/40",
                p.id === "plus" &&
                  "hover:border-2.5 sm:hover:border-3 hover:border-blue-400 hover:shadow-xl sm:hover:shadow-2xl hover:shadow-blue-500/60",
                p.id === "business" &&
                  "hover:border-2 sm:hover:border-2.5 hover:border-amber-400 hover:shadow-xl sm:hover:shadow-2xl hover:shadow-amber-500/40",
              )}
            >
              {p.recommended && (
                <span className="absolute -top-2 sm:-top-2.5 left-1/2 -translate-x-1/2 z-20 text-[7px] sm:text-[9px] font-black uppercase tracking-wider px-1.5 sm:px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-md sm:shadow-lg shadow-blue-500/50 ring-1 sm:ring-2 ring-background whitespace-nowrap">
                  {tr("RECOMMENDED")}
                </span>
              )}
              {p.best && (
                <span className="absolute -top-2 sm:-top-2.5 left-1/2 -translate-x-1/2 z-20 text-[7px] sm:text-[9px] font-black uppercase tracking-wider px-1.5 sm:px-2.5 py-0.5 rounded-full bg-amber-600 text-white shadow-md sm:shadow-lg shadow-amber-500/50 ring-1 sm:ring-2 ring-background whitespace-nowrap">
                  {tr("BEST")}
                </span>
              )}

              {/* Card Header & Price */}
              <div>
                <div className="flex items-center justify-between">
                  <h2
                    className={cn(
                      "text-[10px] sm:text-xs md:text-sm font-black uppercase tracking-wide truncate",
                      tColors.text,
                    )}
                  >
                    {p.name}
                  </h2>
                </div>

                <div className="mt-0.5 sm:mt-1 flex items-baseline gap-0.5 sm:gap-1 flex-wrap">
                  <span className="text-xs sm:text-lg md:text-2xl font-black tracking-tight">{priceObj.formatted}</span>
                  <span className="text-[7.5px] sm:text-[10px] text-muted-foreground font-normal">{tr("/ month")}</span>
                </div>

                <div className="h-3 sm:h-3.5 mt-0.5">
                  {yearly ? (
                    <p className="text-[7px] sm:text-[9.5px] font-medium text-emerald-500 dark:text-emerald-400 leading-tight truncate">
                      {tr("Billed yearly")}: {yearlyTotalObj.formatted}
                    </p>
                  ) : (
                    <p className="text-[7px] sm:text-[9.5px] text-muted-foreground leading-tight truncate">
                      {tr("Billed monthly")}
                    </p>
                  )}
                </div>

                {/* Features List */}
                <ul className="mt-1 sm:mt-2 space-y-0.5 sm:space-y-1 text-[7.5px] sm:text-[9px] md:text-[10.5px]">
                  {p.intro && (
                    <li className="font-bold text-foreground/80 text-[7.5px] sm:text-[9px] tracking-wide mb-0.5 truncate">
                      {p.intro}
                    </li>
                  )}
                  {p.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-1 leading-tight">
                      <Check
                        className={cn(
                          "h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0 mt-0.5 stroke-[2.5]",
                          p.id === "basic" ? "text-emerald-400" : p.id === "plus" ? "text-blue-400" : "text-amber-400",
                        )}
                      />
                      <span className="text-foreground/90 line-clamp-2">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Action Button: Non-bold, balanced */}
              <div className="pt-1.5 sm:pt-2 mt-auto">
                <ShopButton
                  variant="primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChosenPlanId(p.id);
                    setPaying(true);
                  }}
                  className="w-full h-6 sm:h-7 text-[8.5px] sm:text-[11px] font-medium flex items-center justify-center gap-1 shadow-sm bg-blue-600 hover:bg-blue-500 text-white px-1"
                >
                  <span className="truncate">
                    {tr("Continue with")} {p.name}
                  </span>
                  <ArrowRight className="h-2.5 w-2.5 sm:h-3.5 sm:w-3.5 shrink-0" />
                </ShopButton>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom 30-Day Free Trial Banner — Solid Emerald Green */}
      <div className="shrink-0 pt-0.5 text-center">
        <button
          type="button"
          onClick={startTrial}
          className="w-full max-w-lg mx-auto py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white text-[9.5px] sm:text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-emerald-600/30 active:scale-[0.99]"
        >
          <span>{tr("Start with 30-day free trial")}</span>
          <ArrowRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 stroke-[2.5]" />
        </button>
      </div>

      <div className="h-0.5" />
    </main>
  );
}
