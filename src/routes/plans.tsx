import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Receipt,
  RotateCcw,
  Smartphone,
  Store,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { ShopButton } from "@/components/ui/shop-button";
import { Wordmark } from "@/components/shopbook/ui";
import { PLANS, store, type PlanId } from "@/lib/shopbook";
import { cn } from "@/lib/utils";
import { convertUsdToCurrency } from "@/lib/world-data";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Subscription Plans — SHOPBOOK ERP" },
      { name: "description", content: "Choose the SHOPBOOK ERP plan that fits your business." },
      { property: "og:title", content: "Subscription Plans — SHOPBOOK ERP" },
      { property: "og:description", content: "Transparent pricing for African small and medium businesses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Plans,
});

// African mobile money networks: Only Safaricom M-Pesa is active. All others are Coming Soon.
const MOBILE_NETWORKS = [
  { id: "safaricom", name: "Safaricom M-Pesa", country: "Kenya", active: true },
  { id: "airtel_ke", name: "Airtel Money (Kenya)", country: "Kenya", active: false },
  { id: "evc_plus", name: "EVC Plus / Hormuud", country: "Somalia", active: false },
  { id: "zaad", name: "Zaad / Telesom", country: "Somalia", active: false },
  { id: "sahal", name: "Sahal / Golis", country: "Somalia", active: false },
  { id: "mtn_ug", name: "MTN MoMo (Uganda)", country: "Uganda", active: false },
  { id: "airtel_ug", name: "Airtel Money (Uganda)", country: "Uganda", active: false },
  { id: "mpesa_tz", name: "Vodacom M-Pesa (Tanzania)", country: "Tanzania", active: false },
  { id: "airtel_tz", name: "Airtel Money (Tanzania)", country: "Tanzania", active: false },
  { id: "telebirr", name: "Telebirr (Ethiopia)", country: "Ethiopia", active: false },
  { id: "mtn_rw", name: "MTN Mobile Money (Rwanda)", country: "Rwanda", active: false },
];

function Plans() {
  const nav = useNavigate();
  const { tr, t, dir } = useLanguage();

  const [yearly, setYearly] = useState(false);
  const [chosenPlanId, setChosenPlanId] = useState<PlanId>("plus");
  const [paying, setPaying] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const acct = store.get();
  const currency = (acct?.currency || "KSH").toUpperCase();
  const countryCode = (acct?.country || "KEN").toUpperCase();

  // Strict check: Safaricom M-Pesa is ONLY available for Kenya (+254) in KSh
  const isKenya = countryCode === "KEN" || countryCode === "KENYA";
  const isKsh = currency === "KSH";
  const canUseMpesa = isKenya && isKsh;

  // If user is from another country or uses non-KSh currency, enforce Card only
  const [method, setMethod] = useState<"mobile" | "card">(canUseMpesa ? "mobile" : "card");
  const [mobileNetwork, setMobileNetwork] = useState("safaricom");

  // Mobile Money phone is strictly locked to Kenya (+254)
  const [phone, setPhone] = useState("+254 ");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  // Payment execution state
  const [payStatus, setPayStatus] = useState<"idle" | "stk_waiting" | "processing" | "success">("idle");
  const [processStep, setProcessStep] = useState(1);
  const [confirmedDate, setConfirmedDate] = useState("");
  const [stkSecondsLeft, setStkSecondsLeft] = useState(45);

  useEffect(() => {
    if (!canUseMpesa && method === "mobile") {
      setMethod("card");
    }
  }, [canUseMpesa, method]);

  useEffect(() => {
    if (canUseMpesa && acct?.phone) {
      const clean = acct.phone.trim();
      if (clean.startsWith("+254")) {
        const withoutCode = clean.slice(4).trim().replace(/^0+/, "");
        setPhone(`+254 ${withoutCode}`);
      } else {
        const withoutZero = clean.replace(/^0+/, "").replace(/\D/g, "");
        setPhone(`+254 ${withoutZero}`);
      }
    } else {
      setPhone("+254 ");
    }
  }, [canUseMpesa, acct?.phone]);

  // Restrict phone input so user cannot delete the mandatory +254 prefix
  const handlePhoneChange = (inputVal: string) => {
    let raw = inputVal;
    if (!raw.startsWith("+254")) {
      raw = "+254 " + raw.replace(/^\+?\d*/, "").trim();
    }
    const rest = raw.slice(4).replace(/^[ \t0]+/, "");
    setPhone(`+254 ${rest}`);
  };

  const plan = PLANS.find((p) => p.id === chosenPlanId) || PLANS[1]!;
  const currentPrice = convertUsdToCurrency(yearly ? plan.yearlyUsd : plan.monthlyUsd, currency);

  const startTrial = () => {
    store.update({ plan: "trial", trialStart: Date.now() });
    toast.success(tr("30-day free trial activated! Welcome to SHOPBOOK ERP."));
    nav({ to: "/apps" });
  };

  const tone: Record<PlanId, { text: string; ring: string }> = {
    basic: { text: "text-emerald-500", ring: "ring-emerald-500/20" },
    plus: { text: "text-blue-500", ring: "ring-blue-500/30" },
    business: { text: "text-amber-500", ring: "ring-amber-500/20" },
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (payStatus === "stk_waiting" && stkSecondsLeft > 0) {
      timer = setInterval(() => {
        setStkSecondsLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [payStatus, stkSecondsLeft]);

  // Payment workflow with automatic instant redirection to /apps
  const runPaymentWorkflow = (sourceName?: string) => {
    setPayStatus("processing");
    setProcessStep(1);

    setTimeout(() => setProcessStep(2), 500);
    setTimeout(() => setProcessStep(3), 1100);
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
      const label = sourceName || method.toUpperCase();
      toast.success(tr(`Payment confirmed via ${label}! ${plan.name} plan is now active.`));

      setTimeout(() => {
        nav({ to: "/apps" });
      }, 700);
    }, 1800);
  };

  const handlePayNow = () => {
    if (method === "mobile") {
      if (!canUseMpesa) {
        toast.error(tr("Mobile Money (M-Pesa) settles exclusively in Kenya (+254 / KSh). Please pay with Card."));
        setMethod("card");
        return;
      }

      const activeNet = MOBILE_NETWORKS.find((n) => n.id === mobileNetwork);
      if (!activeNet?.active) {
        toast.info(tr("Direct integration for this network is coming soon. Please choose Safaricom M-Pesa or Card."));
        return;
      }

      // Strict Kenyan Mobile Number Validation (+254 7XX... or +254 1XX...)
      const digits = phone.replace(/\D/g, "");
      const localPart = digits.startsWith("254") ? digits.slice(3) : digits;

      if (
        !digits.startsWith("254") ||
        localPart.length !== 9 ||
        (!localPart.startsWith("7") && !localPart.startsWith("1"))
      ) {
        toast.error(
          tr(
            "Safaricom M-Pesa requires a valid 9-digit Kenyan mobile number starting with 07... or 01... (+254). For international numbers, please use Card.",
          ),
        );
        return;
      }

      setStkSecondsLeft(45);
      setPayStatus("stk_waiting");

      setTimeout(() => {
        runPaymentWorkflow("SAFARICOM M-PESA");
      }, 2500);
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
      runPaymentWorkflow("CARD");
    }
  };

  const handleResendStk = () => {
    setStkSecondsLeft(45);
    toast.success(tr(`Fresh STK push prompt resent to ${phone.trim()}`));
  };

  const handleRestorePurchases = () => {
    setRestoring(true);
    setTimeout(() => {
      setRestoring(false);
      toast.info(tr("No previous active subscription found for this account."));
    }, 1200);
  };

  // =========================================================================
  // VIEW: PAYMENT WORKFLOW SCREENS
  // =========================================================================
  if (paying) {
    return (
      <main
        dir={dir}
        className="app-screen relative flex items-center justify-center p-2 sm:p-4"
        style={{ minHeight: "calc(100dvh / var(--fluid-scale, 1))" }}
      >
        {/* A. STK PUSH WAITING SCREEN */}
        {payStatus === "stk_waiting" && (
          <div className="w-full max-w-sm bg-card/95 border border-border/80 rounded-2xl p-5 shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 grid place-items-center">
                <Smartphone className="h-8 w-8 text-emerald-500 animate-pulse" />
              </div>
              <div className="absolute -top-1 -right-1 bg-emerald-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow">
                {stkSecondsLeft}s
              </div>
            </div>

            <div>
              <h2 className="text-base font-extrabold text-foreground">{tr("Check your phone")}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {tr("Safaricom STK PIN prompt sent to")} <strong className="text-foreground">{phone.trim()}</strong>
              </p>
            </div>

            <div className="w-full bg-muted/50 rounded-xl p-3 border border-border/60 text-xs space-y-1.5 text-left">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("Merchant:")}</span>
                <span className="font-bold text-foreground">SHOPBOOK ERP</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("Amount:")}</span>
                <span className="font-extrabold text-foreground">{currentPrice.formatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("Status:")}</span>
                <span className="text-emerald-500 font-semibold">{tr("Awaiting PIN...")}</span>
              </div>
            </div>

            <div className="w-full space-y-2 pt-1">
              <ShopButton
                variant="ghost"
                onClick={handleResendStk}
                className="w-full h-8 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{tr("Resend Prompt")}</span>
              </ShopButton>

              <button
                type="button"
                onClick={() => setPayStatus("idle")}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground cursor-pointer py-1"
              >
                {tr("Cancel")}
              </button>
            </div>
          </div>
        )}

        {/* B. PROCESSING SPINNER SCREEN */}
        {payStatus === "processing" && (
          <div className="w-full max-w-sm bg-card/95 border border-border/80 rounded-2xl p-6 shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in duration-200">
            <div className="h-14 w-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />

            <div>
              <h2 className="text-base font-extrabold text-foreground">{tr("Confirming Payment...")}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {processStep === 1 && tr("Contacting settlement gateway...")}
                {processStep === 2 && tr("Verifying payment authorization...")}
                {processStep === 3 && tr("Activating subscription features...")}
                {processStep === 4 && tr("Finalizing shop entitlements...")}
              </p>
            </div>
          </div>
        )}

        {/* C. CHECKOUT MODAL */}
        {payStatus === "idle" && (
          <div className="w-full max-w-md md:max-w-2xl bg-card/95 border border-border/80 rounded-2xl p-3 sm:p-5 shadow-2xl flex flex-col max-h-[96dvh] justify-between">
            {/* 1. TOP HEADER & SUMMARY ROW */}
            <div className="flex items-center justify-between shrink-0 pb-2 border-b border-border/60">
              <button
                type="button"
                onClick={() => setPaying(false)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>{tr("Back")}</span>
              </button>
              <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-foreground">
                {tr("Complete Subscription")}
              </h2>
              <button
                type="button"
                onClick={() => nav({ to: "/apps" })}
                aria-label="Close"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Selected Plan Summary Banner */}
            <div className="flex items-center justify-between bg-muted/50 border border-border/70 rounded-xl px-3 py-2 my-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center shrink-0">
                  <Store className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="text-xs truncate">
                  <span className="font-extrabold text-foreground mr-1.5">{plan.name} Plan</span>
                  <span className="text-muted-foreground mr-1.5">· {yearly ? tr("Yearly") : tr("Monthly")} ·</span>
                  <span className="font-extrabold text-foreground whitespace-nowrap">{currentPrice.formatted}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaying(false)}
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors shrink-0 ml-2 cursor-pointer"
              >
                {tr("Change >")}
              </button>
            </div>

            {/* 2. PAYMENT METHOD TABS (M-PESA STRICTLY FOR KENYA +254; CARD FOR ALL) */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                disabled={!canUseMpesa}
                onClick={() => {
                  if (canUseMpesa) setMethod("mobile");
                  else
                    toast.info(
                      tr(
                        "Mobile Money (M-Pesa) is currently available exclusively for Kenya (+254). Please pay with Card.",
                      ),
                    );
                }}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border text-xs font-bold transition-all",
                  method === "mobile" && canUseMpesa
                    ? "bg-blue-600/15 border-blue-500 text-foreground shadow-sm cursor-pointer"
                    : !canUseMpesa
                      ? "bg-muted/40 border-border/40 text-muted-foreground/50 cursor-not-allowed opacity-60"
                      : "bg-card/40 border-border/80 text-muted-foreground hover:text-foreground cursor-pointer",
                )}
              >
                <Smartphone className="h-3.5 w-3.5 text-blue-400" />
                <span>{tr("Mobile Money")}</span>
                {!canUseMpesa && (
                  <span className="text-[8.5px] uppercase text-amber-500/90 font-semibold ml-0.5">(+254 Only)</span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setMethod("card")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer",
                  method === "card"
                    ? "bg-blue-600/15 border-blue-500 text-foreground shadow-sm"
                    : "bg-card/40 border-border/80 text-muted-foreground hover:text-foreground",
                )}
              >
                <CreditCard className="h-3.5 w-3.5 text-blue-400" />
                <span>{tr("Card")}</span>
              </button>
            </div>

            {/* 3. CONDITIONAL FORM FIELDS */}
            <div className="flex-1 flex flex-col justify-center min-h-0 my-2">
              {method === "mobile" && canUseMpesa ? (
                <div className="space-y-2 bg-card/40 border border-border/60 rounded-xl p-3">
                  {/* African Network Dropdown: Only Safaricom is active */}
                  <div>
                    <label className="block text-[10.5px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                      {tr("Select African Network")}
                    </label>
                    <select
                      value={mobileNetwork}
                      onChange={(e) => setMobileNetwork(e.target.value)}
                      className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-foreground text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                    >
                      {MOBILE_NETWORKS.map((net) => (
                        <option key={net.id} value={net.id} disabled={!net.active}>
                          {net.name} {net.active ? `(${tr("Active")})` : `(${tr("Coming soon — Pay with Card")})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Phone Input with LOCKED +254 Kenyan Dial Code */}
                  <div>
                    <label className="block text-[10.5px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                      {tr("Phone Number (Kenya +254)")}
                    </label>
                    <div className="flex gap-1.5">
                      <div className="h-8 px-2.5 rounded-lg border border-border bg-muted/50 text-foreground text-xs font-bold flex items-center justify-center shrink-0 select-none">
                        +254 (Kenya)
                      </div>

                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        placeholder="+254 712 345 678"
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>

                  {/* Safaricom STK Push Notice */}
                  <div className="bg-muted/40 border border-border/60 rounded-lg p-2 text-[10.5px] text-muted-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                    <span>
                      {tr(
                        "An instant Safaricom STK PIN prompt will be sent directly to your phone to authorize settlement.",
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                /* Card Input Fields with International Notice */
                <div className="space-y-2 bg-card/40 border border-border/60 rounded-xl p-3">
                  {!canUseMpesa && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-[10.5px] text-amber-500 leading-snug">
                      {tr(
                        "Safaricom M-Pesa is currently exclusive to Kenya (+254). Direct mobile money for your region (e.g. Zaad, EVC Plus, MTN) is coming soon. Please settle your subscription securely via Card.",
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[10.5px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                      {tr("Card Number")}
                    </label>
                    <input
                      type="text"
                      maxLength={19}
                      value={cardNumber}
                      onChange={(e) => {
                        const val = e.target.value
                          .replace(/\D/g, "")
                          .replace(/(.{4})/g, "$1 ")
                          .trim();
                        setCardNumber(val);
                      }}
                      placeholder="4000 1234 5678 9010"
                      className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10.5px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                        {tr("Expiry (MM/YY)")}
                      </label>
                      <input
                        type="text"
                        maxLength={5}
                        value={cardExpiry}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\D/g, "");
                          if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2, 4);
                          setCardExpiry(v);
                        }}
                        placeholder="MM/YY"
                        className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10.5px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                        {tr("CVV / CVC")}
                      </label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ""))}
                        placeholder="123"
                        className="w-full h-8 px-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 4. TOTAL DUE DIRECTLY ABOVE THE PAY BUTTON */}
            <div className="shrink-0 pt-1 space-y-1.5">
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <span>{tr("Total Due:")}</span>
                <span className="font-extrabold text-foreground text-sm tracking-tight">{currentPrice.formatted}</span>
              </div>

              <ShopButton
                onClick={handlePayNow}
                className="w-full h-8 sm:h-9 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/30 rounded-xl cursor-pointer"
              >
                <span>{tr(`Pay ${currentPrice.formatted}`)}</span>
                <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
              </ShopButton>

              <button
                type="button"
                onClick={startTrial}
                className="w-full text-center text-[10px] sm:text-[11px] font-semibold text-emerald-500 hover:text-emerald-400 cursor-pointer pt-0.5 transition-colors"
              >
                {tr("Use 30-day free trial instead")}
              </button>
            </div>
          </div>
        )}
      </main>
    );
  }

  // =========================================================================
  // VIEW: 3-COLUMN PLANS OVERVIEW — ZERO-SCROLL
  // =========================================================================
  return (
    <main
      dir={dir}
      className="app-screen relative flex flex-col justify-between px-2.5 py-2 sm:px-4 md:px-8 max-w-6xl mx-auto w-full"
      style={{ minHeight: "calc(100dvh / var(--fluid-scale, 1))" }}
    >
      {/* 1. HEADER: ONE ROW TITLE + SUBTITLE + RESTORE + CLOSE ✕ */}
      <header className="flex items-center justify-between shrink-0 py-0.5 gap-2">
        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-sm sm:text-base md:text-lg font-black text-foreground whitespace-nowrap">
            {tr("Choose your plan")}
          </h1>
          <p className="text-[9.5px] sm:text-[11px] text-muted-foreground truncate">
            {tr("Unlock more features and grow your business with SHOPBOOK")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRestorePurchases}
            disabled={restoring}
            className="text-[10px] sm:text-xs font-semibold text-primary hover:underline whitespace-nowrap cursor-pointer transition-opacity disabled:opacity-50"
          >
            {restoring ? tr("Restoring...") : tr("Restore Purchases")}
          </button>
          <button
            type="button"
            onClick={() => nav({ to: "/apps" })}
            aria-label="Close"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* 2. BILLING CYCLE TOGGLE IN SOLID EMERALD GREEN */}
      <div className="flex justify-center shrink-0 my-0.5 sm:my-1">
        <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-muted/60 border border-border/80 shadow-inner w-full max-w-xs sm:max-w-sm justify-between">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              "flex-1 px-3 py-1 text-[10px] sm:text-xs font-bold rounded-full transition-all cursor-pointer text-center",
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
              "flex-1 px-3 py-1 text-[10px] sm:text-xs font-bold rounded-full transition-all cursor-pointer flex items-center justify-center gap-1",
              yearly
                ? "bg-emerald-600 text-white font-extrabold shadow-md shadow-emerald-600/30"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tr("Yearly")}</span>
            <span
              className={cn(
                "text-[8.5px] sm:text-[9.5px] font-extrabold uppercase px-1.5 py-0.2 rounded-full border transition-colors",
                yearly
                  ? "bg-white/20 text-white border-white/30"
                  : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
              )}
            >
              {tr("Save 10%")}
            </span>
          </button>
        </div>
      </div>

      {/* 3. THREE PLANS CARDS GRID (ELEVATED 3D HOVER, BOLDER BORDERS) */}
      <div className="grid grid-cols-3 gap-1.5 md:gap-3 flex-1 min-h-0 items-stretch my-1">
        {PLANS.map((p) => {
          const tColor = tone[p.id];
          const priceObj = convertUsdToCurrency(yearly ? p.yearlyUsd : p.monthlyUsd, currency);
          const isPlus = p.id === "plus";

          return (
            <div
              key={p.id}
              onClick={() => {
                setChosenPlanId(p.id);
                setPaying(true);
              }}
              className={cn(
                "relative rounded-xl border p-1.5 sm:p-2.5 md:p-3.5 flex flex-col justify-between transition-all duration-300 ease-out cursor-pointer overflow-visible text-left",
                "hover:scale-[1.05] hover:-translate-y-2 hover:z-40 hover:shadow-2xl",
                isPlus
                  ? "bg-card/90 shadow-xl border-blue-500/80 hover:border-blue-400 hover:shadow-blue-500/30 z-20"
                  : p.id === "business"
                    ? "bg-card/75 shadow-md border-border/70 hover:border-amber-400 hover:shadow-amber-500/30 z-10"
                    : "bg-card/75 shadow-md border-border/70 hover:border-slate-300 dark:hover:border-slate-200 hover:shadow-slate-500/20 z-10",
              )}
            >
              {/* TOP BADGES */}
              {p.recommended && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-30">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[7px] sm:text-[9px] font-extrabold uppercase tracking-wider bg-blue-600 text-white shadow-md shadow-blue-600/40 border border-blue-400/40 whitespace-nowrap">
                    {tr("RECOMMENDED")}
                  </span>
                </div>
              )}
              {p.best && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-30">
                  <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[7px] sm:text-[9px] font-extrabold uppercase tracking-wider bg-amber-500 text-black shadow-md shadow-amber-500/40 border border-amber-300 whitespace-nowrap">
                    {tr("BEST")}
                  </span>
                </div>
              )}

              {/* CARD HEADER */}
              <div className="text-center pt-0.5 sm:pt-1">
                <h3 className={cn("text-[10px] sm:text-sm md:text-base font-black truncate", tColor.text)}>{p.name}</h3>
                {(p as { desc?: string }).desc && (
                  <p className="text-[7.5px] sm:text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                    {tr((p as { desc?: string }).desc!)}
                  </p>
                )}

                {/* PRICE ROW */}
                <div className="mt-1 flex items-baseline justify-center gap-0.5">
                  <span className="text-xs sm:text-lg md:text-2xl font-black text-foreground tracking-tight">
                    {priceObj.formatted}
                  </span>
                  <span className="text-[7px] sm:text-[10px] text-muted-foreground font-medium">/{tr("mo")}</span>
                </div>
              </div>

              {/* FEATURES LIST */}
              <div className="flex-1 my-1.5 space-y-1 overflow-hidden">
                {p.intro && (
                  <p className="text-[7.5px] sm:text-[9.5px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40 pb-0.5">
                    {tr(p.intro)}
                  </p>
                )}
                <ul className="space-y-0.5 sm:space-y-1">
                  {p.features.map((f, idx) => (
                    <li key={idx} className="flex items-start gap-1 text-[7.5px] sm:text-[9.5px] leading-tight">
                      <Check className={cn("h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0 mt-0.5", tColor.text)} />
                      <span className="text-foreground/90 line-clamp-2">{tr(f)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* ACTION BUTTON */}
              <ShopButton
                onClick={(e) => {
                  e.stopPropagation();
                  setChosenPlanId(p.id);
                  setPaying(true);
                }}
                className={cn(
                  "w-full h-6 sm:h-7.5 md:h-8 text-[8px] sm:text-[10.5px] md:text-xs font-semibold cursor-pointer shadow-sm mt-1",
                  isPlus ? "bg-blue-600 hover:bg-blue-500 text-white" : "",
                )}
              >
                <span>{tr(`Continue with ${p.name}`)}</span>
                <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-1" />
              </ShopButton>
            </div>
          );
        })}
      </div>

      {/* 4. BOTTOM TRIAL CTA IN SOLID EMERALD GREEN */}
      <div className="shrink-0 pt-1">
        <button
          type="button"
          onClick={startTrial}
          className="w-full h-8 sm:h-9 text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-md shadow-emerald-600/30 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>{tr("Start with 30-day free trial")}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </main>
  );
}
