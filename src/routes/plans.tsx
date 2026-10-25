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

// African mobile money networks: Safaricom M-Pesa active, others coming soon
const MOBILE_NETWORKS = [
  { id: "safaricom", name: "Safaricom M-Pesa", country: "Kenya", active: true },
  { id: "airtel_ke", name: "Airtel Money (Kenya)", country: "Kenya", active: false },
  { id: "mtn_ug", name: "MTN MoMo (Uganda)", country: "Uganda", active: false },
  { id: "airtel_ug", name: "Airtel Money (Uganda)", country: "Uganda", active: false },
  { id: "evc_plus", name: "EVC Plus / Hormuud", country: "Somalia", active: false },
  { id: "zaad", name: "Zaad / Telesom", country: "Somaliland", active: false },
  { id: "sahal", name: "Sahal / Golis", country: "Puntland", active: false },
  { id: "mpesa_tz", name: "Vodacom M-Pesa (Tanzania)", country: "Tanzania", active: false },
  { id: "airtel_tz", name: "Airtel Money (Tanzania)", country: "Tanzania", active: false },
  { id: "telebirr", name: "Telebirr (Ethiopia)", country: "Ethiopia", active: false },
  { id: "mtn_rw", name: "MTN Mobile Money (Rwanda)", country: "Rwanda", active: false },
];

const COUNTRY_DIAL_OPTIONS = [
  { code: "+254", country: "Kenya (KEN)" },
  { code: "+252", country: "Somalia (SOM)" },
  { code: "+256", country: "Uganda (UGA)" },
  { code: "+255", country: "Tanzania (TZA)" },
  { code: "+250", country: "Rwanda (RWA)" },
  { code: "+251", country: "Ethiopia (ETH)" },
  { code: "+257", country: "Burundi (BDI)" },
  { code: "+211", country: "South Sudan (SSD)" },
  { code: "+234", country: "Nigeria (NGA)" },
  { code: "+233", country: "Ghana (GHA)" },
  { code: "+27", country: "South Africa (ZAF)" },
  { code: "+1", country: "USA / Canada" },
  { code: "+44", country: "United Kingdom" },
  { code: "+971", country: "UAE (Dubai)" },
];

function getDialByCountry(countryCode?: string): string {
  const c = (countryCode || "").toUpperCase();
  if (c === "KEN" || c === "KENYA") return "+254";
  if (c === "SOM" || c === "SOMALIA") return "+252";
  if (c === "UGA" || c === "UGANDA") return "+256";
  if (c === "TZA" || c === "TANZANIA") return "+255";
  if (c === "RWA" || c === "RWANDA") return "+250";
  if (c === "ETH" || c === "ETHIOPIA") return "+251";
  if (c === "BDI" || c === "BURUNDI") return "+257";
  if (c === "SSD") return "+211";
  if (c === "NGA" || c === "NIGERIA") return "+234";
  if (c === "GHA" || c === "GHANA") return "+233";
  if (c === "ZAF") return "+27";
  if (c === "USA") return "+1";
  if (c === "GBR") return "+44";
  if (c === "ARE") return "+971";
  return "+254";
}

function Plans() {
  const nav = useNavigate();
  const { tr, t, dir } = useLanguage();

  const [yearly, setYearly] = useState(false);
  const [chosenPlanId, setChosenPlanId] = useState<PlanId>("plus");
  const [paying, setPaying] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Payment form state
  const [method, setMethod] = useState<"mobile" | "card">("mobile");
  const [mobileNetwork, setMobileNetwork] = useState("safaricom");
  const [selectedDial, setSelectedDial] = useState("+254");
  const [phone, setPhone] = useState("+254 ");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");

  // Payment execution state
  const [payStatus, setPayStatus] = useState<"idle" | "stk_waiting" | "processing" | "success">("idle");
  const [processStep, setProcessStep] = useState(1);
  const [confirmedDate, setConfirmedDate] = useState("");
  const [stkSecondsLeft, setStkSecondsLeft] = useState(45);

  const acct = store.get();
  const currency = acct?.currency || "KSH";

  useEffect(() => {
    const defaultDial = getDialByCountry(acct?.country);
    setSelectedDial(defaultDial);

    if (acct?.phone) {
      const clean = acct.phone.trim();
      if (clean.startsWith("+")) {
        setPhone(clean);
        const match = COUNTRY_DIAL_OPTIONS.find((opt) => clean.startsWith(opt.code));
        if (match) setSelectedDial(match.code);
      } else {
        const withoutZero = clean.replace(/^0+/, "");
        setPhone(`${defaultDial} ${withoutZero}`);
      }
    } else {
      setPhone(`${defaultDial} `);
    }
  }, [acct?.country, acct?.phone]);

  const handlePhoneChange = (inputVal: string) => {
    let raw = inputVal;
    if (!raw.startsWith(selectedDial)) {
      raw = selectedDial + " " + raw.replace(/^\+?\d*/, "").trim();
    }
    const rest = raw.slice(selectedDial.length).replace(/^[ \t0]+/, "");
    setPhone(`${selectedDial} ${rest}`);
  };

  const plan = PLANS.find((p) => p.id === chosenPlanId) || PLANS[1]!;
  const currentPrice = convertUsdToCurrency(yearly ? plan.yearlyUsd : plan.monthlyUsd, currency);
  const kshEquivalent = convertUsdToCurrency(yearly ? plan.yearlyUsd : plan.monthlyUsd, "KSH");

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

  // Payment workflow with auto-redirect to /apps
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

      // Automatically move straight to the business apps screen
      setTimeout(() => {
        nav({ to: "/apps" });
      }, 700);
    }, 1800);
  };

  const handlePayNow = () => {
    if (method === "mobile") {
      const activeNet = MOBILE_NETWORKS.find((n) => n.id === mobileNetwork);
      if (!activeNet?.active) {
        toast.info(tr("Direct integration for this network is coming soon. Please choose Safaricom M-Pesa or Card."));
        return;
      }

      const cleanPhone = phone.replace(/[\s-]/g, "");
      if (!cleanPhone.startsWith("+") || cleanPhone.length < 10) {
        toast.error(tr("Enter your mobile number following the prefilled country code (e.g. +254 7...)"));
        return;
      }

      // Launch STK push countdown simulation
      setStkSecondsLeft(45);
      setPayStatus("stk_waiting");

      // Auto-confirm after simulated PIN entry (snappy 2.5 seconds)
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

  const handleRestorePurchases = async () => {
    setRestoring(true);
    try {
      const a = store.get();
      await new Promise((res) => setTimeout(res, 600));

      if (a?.plan && a.plan !== "trial") {
        toast.success(tr(`Active ${a.plan.toUpperCase()} subscription restored!`));
        nav({ to: "/apps" });
      } else {
        toast.info(tr("No active paid subscription found on this account."));
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleDialChange = (newDial: string) => {
    setSelectedDial(newDial);
    const existingRest = phone.slice(selectedDial.length).trim();
    setPhone(`${newDial} ${existingRest}`);
  };

  // =========================================================================
  // VIEW: CHECKOUT SCREEN
  // =========================================================================
  if (paying) {
    return (
      <main
        dir={dir}
        className="app-screen relative flex flex-col justify-between px-3 py-2 sm:px-6 md:px-8 max-w-lg md:max-w-4xl lg:max-w-5xl xl:max-w-6xl mx-auto w-full"
        style={{ minHeight: "calc(100dvh / var(--fluid-scale, 1))" }}
      >
        {/* CHECKOUT HEADER WITH BACK ON LEFT AND ✕ EXIT ON RIGHT */}
        <header className="flex items-center justify-between shrink-0 py-0.5">
          <ShopButton
            variant="ghost"
            onClick={() => {
              if (payStatus === "processing") return;
              setPaying(false);
              setPayStatus("idle");
            }}
            aria-label={t("back")}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </ShopButton>

          <Wordmark className="text-sm font-black" />

          <ShopButton
            variant="ghost"
            onClick={() => {
              if (payStatus === "processing") return;
              nav({ to: "/apps" });
            }}
            aria-label="Exit"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4.5 w-4.5" />
          </ShopButton>
        </header>

        {/* 1. STK PUSH WAITING SCREEN */}
        {payStatus === "stk_waiting" ? (
          <div className="flex-1 flex flex-col items-center justify-center p-3 text-center min-h-0 space-y-3">
            <div className="relative w-16 h-16 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-3 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <Smartphone className="h-7 w-7 text-emerald-400 animate-pulse" />
            </div>

            <div>
              <h2 className="text-base font-black text-foreground">{tr("STK Push Sent to Your Phone")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr("Please check screen on")} <span className="font-bold text-foreground">{phone.trim()}</span>
              </p>
            </div>

            <div className="w-full max-w-xs md:max-w-md bg-emerald-950/30 border border-emerald-500/40 rounded-xl p-3 text-xs space-y-1.5 text-left">
              <p className="text-emerald-300 font-semibold text-[11.5px]">
                {tr("1. Check for the Safaricom SIM prompt on your phone.")}
              </p>
              <p className="text-emerald-300 font-semibold text-[11.5px]">
                {tr("2. Enter your M-Pesa PIN to complete payment.")}
              </p>
              <p className="text-muted-foreground text-[10.5px]">
                {tr("Amount:")}{" "}
                <span className="font-bold text-foreground">
                  {currency === "KSH"
                    ? currentPrice.formatted
                    : `${kshEquivalent.formatted} (~${currentPrice.formatted})`}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <span className="text-[11px] font-bold text-muted-foreground">
                {tr("Prompt expires in:")} <span className="text-emerald-400 font-mono text-xs">{stkSecondsLeft}s</span>
              </span>
              <button
                type="button"
                onClick={handleResendStk}
                className="text-[11px] font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{tr("Resend STK")}</span>
              </button>
            </div>
          </div>
        ) : payStatus === "processing" ? (
          /* 2. PROCESSING SCREEN */
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
                  {tr("Redirecting to your apps...")}
                </span>
              </div>
            </div>
          </div>
        ) : payStatus === "success" ? (
          /* 3. SUCCESS SCREEN (FALLBACK) */
          <div className="flex-1 flex flex-col items-center justify-center p-3 text-center min-h-0 space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
              <Check className="h-7 w-7 stroke-[3]" />
            </div>

            <div>
              <h2 className="text-base font-black text-foreground">{tr("Subscription Confirmed!")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr("Your business now has full unlimited access.")}
              </p>
            </div>

            <div className="w-full max-w-xs md:max-w-md bg-card/80 border border-border rounded-xl p-3 text-xs space-y-1.5 text-left">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("Plan Activated")}:</span>
                <span className="font-bold text-foreground">
                  {plan.name} ({yearly ? tr("Yearly") : tr("Monthly")})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("Amount Paid")}:</span>
                <span className="font-extrabold text-foreground">{currentPrice.formatted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("Payment Channel")}:</span>
                <span className="font-semibold text-foreground">
                  {method === "mobile" ? "Safaricom M-Pesa" : "Card"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{tr("Date")}:</span>
                <span className="font-medium text-foreground">{confirmedDate}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs md:max-w-md pt-1">
              <ShopButton className="flex-1 h-9 bg-primary font-bold" onClick={() => nav({ to: "/apps" })}>
                {tr("Open My Business Apps")}
              </ShopButton>
              <ShopButton
                variant="outline"
                className="h-9 gap-1.5"
                onClick={() => toast.info(tr("Receipt sent to registered email!"))}
              >
                <Receipt className="h-3 w-3" />
                <span>{tr("View Receipt")}</span>
              </ShopButton>
            </div>
          </div>
        ) : (
          /* 4. MAIN UNIFIED CHECKOUT FORM — ZERO-SCROLL */
          <div className="flex-1 flex flex-col justify-between py-1 space-y-2 min-h-0">
            {/* 1. SINGLE-ROW SUMMARY */}
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
                className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors shrink-0 ml-2 cursor-pointer"
              >
                {tr("Change >")}
              </button>
            </div>

            {/* 2. PAYMENT METHOD TABS (MOBILE MONEY & CARD ONLY) */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMethod("mobile")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg border text-xs font-bold transition-all cursor-pointer",
                  method === "mobile"
                    ? "bg-blue-600/15 border-blue-500 text-foreground shadow-sm"
                    : "bg-card/40 border-border/80 text-muted-foreground hover:text-foreground",
                )}
              >
                <Smartphone className="h-3.5 w-3.5 text-blue-400" />
                <span>{tr("Mobile Money")}</span>
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
            <div className="flex-1 flex flex-col justify-center min-h-0">
              {method === "mobile" ? (
                <div className="space-y-2 bg-card/40 border border-border/60 rounded-xl p-3">
                  {/* African Network Dropdown */}
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
                          {net.name} {net.active ? `(${tr("Active")})` : `(${tr("Coming soon")})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Phone Input with Mandatory Auto-Selected Country Dial Code */}
                  <div>
                    <label className="block text-[10.5px] font-bold text-muted-foreground mb-1 uppercase tracking-wider">
                      {tr("Phone Number (Auto-detected Country Code)")}
                    </label>
                    <div className="flex gap-1.5">
                      {/* Compact Dial Code Selector */}
                      <select
                        value={selectedDial}
                        onChange={(e) => handleDialChange(e.target.value)}
                        className="h-8 px-2 rounded-lg border border-border bg-background text-foreground text-xs font-bold focus:outline-none focus:ring-1 focus:ring-primary shrink-0 cursor-pointer"
                      >
                        {COUNTRY_DIAL_OPTIONS.map((opt) => (
                          <option key={opt.code} value={opt.code}>
                            {opt.code} — {opt.country}
                          </option>
                        ))}
                      </select>

                      {/* Locked Prefix Mobile Number Input */}
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        placeholder={`${selectedDial} 712 345 678`}
                        className="flex-1 min-w-0 h-8 px-2.5 rounded-lg border border-border bg-background text-foreground font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>

                  {/* Safaricom STK Push Notice */}
                  <div className="bg-muted/40 border border-border/60 rounded-lg p-2 text-[10.5px] text-muted-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 animate-pulse" />
                    <span>
                      {tr("An instant STK PIN prompt will be sent directly to your phone to authorize settlement.")}
                    </span>
                  </div>

                  {/* Cross-border note if paying in non-KSH currency with M-Pesa */}
                  {currency !== "KSH" && (
                    <p className="text-[10px] text-amber-500/90 font-medium px-1">
                      {tr("Note: Safaricom M-Pesa settles in KSh equivalent")} (~{kshEquivalent.formatted}).{" "}
                      {tr("For exact")} {currency} {tr("settlement, switch to Card.")}
                    </p>
                  )}
                </div>
              ) : (
                /* Card Input Fields */
                <div className="space-y-2 bg-card/40 border border-border/60 rounded-xl p-3">
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
      {/* 1. HEADER: ONE ROW TITLE + SUBTITLE + RESTORE */}
      <header className="flex items-center justify-between shrink-0 py-0.5 gap-2">
        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-sm sm:text-base md:text-lg font-black text-foreground whitespace-nowrap">
            {tr("Choose your plan")}
          </h1>
          <p className="text-[9.5px] sm:text-[11px] text-muted-foreground truncate">
            {tr("Unlock more features and grow your business with SHOPBOOK")}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRestorePurchases}
          disabled={restoring}
          className="text-[10px] sm:text-xs font-semibold text-primary hover:underline whitespace-nowrap cursor-pointer transition-opacity disabled:opacity-50"
        >
          {restoring ? tr("Restoring...") : tr("Restore Purchases")}
        </button>
      </header>

      {/* 2. BILLING CYCLE TOGGLE */}
      <div className="flex justify-center shrink-0 my-0.5 sm:my-1">
        <div className="inline-flex items-center gap-1 p-0.5 rounded-full bg-muted/60 border border-border/80 shadow-inner w-full max-w-xs sm:max-w-sm justify-between">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              "flex-1 px-3 py-1 text-[10px] sm:text-xs font-bold rounded-full transition-all cursor-pointer text-center",
              !yearly ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tr("Monthly")}
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={cn(
              "flex-1 px-3 py-1 text-[10px] sm:text-xs font-bold rounded-full transition-all cursor-pointer flex items-center justify-center gap-1",
              yearly ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span>{tr("Yearly")}</span>
            <span className="text-[8.5px] sm:text-[9.5px] font-extrabold uppercase px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              {tr("Save 10%")}
            </span>
          </button>
        </div>
      </div>

      {/* 3. THREE PLANS CARDS GRID (3 COLUMNS ON ALL SCREENS) */}
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
                "relative rounded-xl border p-1.5 sm:p-2.5 md:p-3.5 flex flex-col justify-between transition-all duration-200 cursor-pointer overflow-visible text-left",
                isPlus
                  ? "bg-card/90 shadow-xl border-blue-500/80 hover:border-blue-400 hover:scale-[1.02] z-20"
                  : "bg-card/60 shadow-md border-border/70 hover:border-foreground/40 hover:scale-[1.01] z-10",
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
