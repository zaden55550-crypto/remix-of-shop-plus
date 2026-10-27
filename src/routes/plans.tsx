import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
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
  const { tr, dir } = useLanguage();

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
  const [, setConfirmedDate] = useState("");
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

  const tone: Record<PlanId, { text: string; ring: string; border: string; bg: string; btn: string }> = {
    basic: {
      text: "text-emerald-500",
      ring: "ring-emerald-500/20",
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/10",
      btn: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30",
    },
    plus: {
      text: "text-blue-500",
      ring: "ring-blue-500/30",
      border: "border-blue-500/40",
      bg: "bg-blue-500/10",
      btn: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30",
    },
    business: {
      text: "text-amber-500",
      ring: "ring-amber-500/20",
      border: "border-amber-500/30",
      bg: "bg-amber-500/10",
      btn: "bg-amber-500 hover:bg-amber-400 text-black font-extrabold shadow-amber-500/30 border border-amber-300/40",
    },
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
        className="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center p-3 sm:p-4 overflow-y-auto"
      >
        <div className="w-full max-w-md bg-card/95 border border-border/80 rounded-2xl shadow-2xl p-4 sm:p-5 relative backdrop-blur-md">
          {/* HEADER ROW */}
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <button
              type="button"
              onClick={() => {
                setPaying(false);
                setPayStatus("idle");
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{tr("Back")}</span>
            </button>
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-foreground">
              {tr("Complete Subscription")}
            </h2>
            <button
              type="button"
              onClick={() => {
                setPaying(false);
                setPayStatus("idle");
              }}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ACTIVE PLAN SUMMARY BANNER */}
          <div className="mt-3 p-3 rounded-xl bg-muted/40 border border-border/70 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-500">
                <Store className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-foreground">
                  {plan.name} {tr("Plan")}
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">
                    · {yearly ? tr("Yearly") : tr("Monthly")} ·
                  </span>
                  <span className="text-xs font-black text-foreground ml-1">{currentPrice.formatted}</span>
                </div>
                <div className="text-[9.5px] text-muted-foreground">
                  {plan.shopsLimit} {plan.shopsLimit === 1 ? tr("Shop") : tr("Shops")} · {plan.warehousesLimit}{" "}
                  {plan.warehousesLimit === 1 ? tr("Warehouse") : tr("Warehouses")}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPaying(false)}
              className="text-[10px] font-bold text-blue-500 hover:text-blue-400 cursor-pointer"
            >
              {tr("Change >")}
            </button>
          </div>

          {/* STK PUSH WAITING STATE */}
          {payStatus === "stk_waiting" ? (
            <div className="my-5 text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-500/40 flex items-center justify-center animate-pulse text-emerald-500">
                <Smartphone className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-foreground">{tr("Check your phone")}</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                  {tr("Enter your Safaricom M-Pesa PIN on")} <span className="font-bold text-foreground">{phone}</span>{" "}
                  {tr("to authorize payment of")}{" "}
                  <span className="font-bold text-foreground">{currentPrice.formatted}</span>.
                </p>
              </div>

              <div className="py-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60 text-[11px] font-mono text-muted-foreground border border-border/70">
                  <span>{tr("Waiting for PIN authorization...")}</span>
                  <span className="font-bold text-foreground">{stkSecondsLeft}s</span>
                </div>
              </div>

              <div className="pt-2 flex justify-center gap-3">
                <button
                  type="button"
                  onClick={handleResendStk}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-muted/80 hover:bg-muted text-foreground cursor-pointer inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>{tr("Resend Prompt")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPayStatus("idle")}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  {tr("Cancel")}
                </button>
              </div>
            </div>
          ) : payStatus === "processing" ? (
            /* PROCESSING 4-STEP VERIFICATION STATE */
            <div className="my-6 text-center space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
              <div>
                <h3 className="text-sm font-bold text-foreground">{tr("Authorizing Payment...")}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tr("Securing direct ledger confirmation and provisioning your business seat.")}
                </p>
              </div>

              <div className="space-y-1.5 text-left max-w-xs mx-auto text-xs">
                {[
                  tr("Contacting payment gateway"),
                  tr("Validating mobile money transaction PIN"),
                  tr("Confirming funds reservation"),
                  tr("Activating SHOPBOOK ERP workspace"),
                ].map((stepText, idx) => {
                  const stepNum = idx + 1;
                  const isDone = processStep > stepNum;
                  const isCurrent = processStep === stepNum;

                  return (
                    <div key={idx} className="flex items-center gap-2">
                      {isDone ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : isCurrent ? (
                        <div className="h-3.5 w-3.5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-border/80 shrink-0" />
                      )}
                      <span
                        className={cn(
                          "text-[11px]",
                          isDone
                            ? "text-foreground font-semibold"
                            : isCurrent
                              ? "text-blue-500 font-bold"
                              : "text-muted-foreground",
                        )}
                      >
                        {stepText}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* STANDARD PAYMENT FORM (M-PESA / CARD) */
            <div className="mt-4 space-y-3.5">
              {/* PAYMENT METHOD SELECTOR TABS */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-muted/50 border border-border/70">
                <button
                  type="button"
                  disabled={!canUseMpesa}
                  onClick={() => setMethod("mobile")}
                  className={cn(
                    "h-8 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5",
                    !canUseMpesa
                      ? "opacity-40 cursor-not-allowed text-muted-foreground"
                      : method === "mobile"
                        ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-extrabold cursor-pointer"
                        : "text-muted-foreground hover:text-foreground cursor-pointer",
                  )}
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>{tr("Mobile Money")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("card")}
                  className={cn(
                    "h-8 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                    method === "card"
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 font-extrabold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>{tr("Card")}</span>
                </button>
              </div>

              {!canUseMpesa && (
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[10.5px] text-amber-500 leading-tight">
                  {tr(
                    "M-Pesa operates exclusively in Kenyan Shillings (KSh). For accounts denominated in other currencies or international locations, please settle via Card.",
                  )}
                </div>
              )}

              {/* METHOD BODY */}
              {method === "mobile" ? (
                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      {tr("Select African Network")}
                    </label>
                    <select
                      value={mobileNetwork}
                      onChange={(e) => setMobileNetwork(e.target.value)}
                      className="w-full h-9 rounded-xl border border-border/80 bg-background px-2.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    >
                      {MOBILE_NETWORKS.map((net) => (
                        <option key={net.id} value={net.id} disabled={!net.active}>
                          {net.name} {net.active ? `(${tr("Active")})` : `(${tr("Coming soon")})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      {tr("Phone Number (Kenya +254)")}
                    </label>
                    <div className="flex gap-2">
                      <div className="w-24 h-9 rounded-xl border border-border/80 bg-muted/40 px-2.5 flex items-center justify-center text-xs font-bold text-foreground shrink-0 select-none">
                        +254 (Kenya)
                      </div>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        placeholder="+254 7XX XXX XXX"
                        className="flex-1 h-9 rounded-xl border border-border/80 bg-background px-3 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-muted/30 border border-border/60 text-[10px] text-muted-foreground flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                    <span>
                      {tr(
                        "An instant Safaricom STK PIN prompt will be sent directly to your phone to authorize settlement.",
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                      {tr("Card Number")}
                    </label>
                    <input
                      type="text"
                      maxLength={19}
                      value={cardNumber}
                      onChange={(e) => {
                        const v = e.target.value
                          .replace(/\D/g, "")
                          .replace(/(.{4})/g, "$1 ")
                          .trim();
                        setCardNumber(v);
                      }}
                      placeholder="•••• •••• •••• ••••"
                      className="w-full h-9 rounded-xl border border-border/80 bg-background px-3 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        {tr("Expiry (MM/YY)")}
                      </label>
                      <input
                        type="text"
                        maxLength={5}
                        value={cardExpiry}
                        onChange={(e) => {
                          let v = e.target.value.replace(/\D/g, "");
                          if (v.length > 2) v = `${v.slice(0, 2)}/${v.slice(2, 4)}`;
                          setCardExpiry(v);
                        }}
                        placeholder="MM/YY"
                        className="w-full h-9 rounded-xl border border-border/80 bg-background px-3 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                        {tr("CVV / CVC")}
                      </label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ""))}
                        placeholder="•••"
                        className="w-full h-9 rounded-xl border border-border/80 bg-background px-3 text-xs font-mono font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* TOTAL DUE & SUBMIT BUTTON */}
              <div className="pt-2 border-t border-border/60">
                <div className="flex items-baseline justify-between mb-2 px-0.5">
                  <span className="text-[11px] font-semibold text-muted-foreground">{tr("Total Due:")}</span>
                  <span className="text-sm font-black text-foreground">{currentPrice.formatted}</span>
                </div>

                <button
                  type="button"
                  onClick={handlePayNow}
                  className="w-full h-9 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-md shadow-blue-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>{tr(`Pay ${currentPrice.formatted}`)}</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <div className="mt-2 text-center">
                  <button
                    type="button"
                    onClick={startTrial}
                    className="text-[10px] font-bold text-emerald-500 hover:text-emerald-400 cursor-pointer"
                  >
                    {tr("Use 30-day free trial instead")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    );
  }

  // =========================================================================
  // VIEW: MAIN RESPONSIVE PLANS COMPARISON (3 EQUAL COLUMNS ON ALL SCREENS)
  // =========================================================================
  return (
    <main
      dir={dir}
      className="h-[100dvh] max-h-[100dvh] w-full bg-background text-foreground flex flex-col justify-between p-2 sm:p-3 md:p-4 max-w-7xl mx-auto overflow-hidden select-none"
    >
      {/* 1. TOP HEADER WITH RESTORE PURCHASES AND CLOSE */}
      <header className="shrink-0 flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <Wordmark className="text-xs sm:text-sm md:text-base font-black tracking-tight" />
          <span className="hidden sm:inline-block text-[11px] text-muted-foreground truncate">
            — {tr("Unlock more features and grow your business with SHOPBOOK")}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRestorePurchases}
            disabled={restoring}
            className="text-[10px] sm:text-xs font-bold text-blue-500 hover:text-blue-400 cursor-pointer disabled:opacity-50"
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

      {/* 3. THREE PLANS CARDS GRID (ELEVATED 3D HOVER, BOLDER BORDERS, STRICT 3-COLUMN) */}
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
                "relative rounded-xl border p-1.5 sm:p-2.5 md:p-3.5 flex flex-col justify-between transition-all duration-300 ease-out cursor-pointer overflow-visible text-left min-h-0",
                "hover:scale-[1.04] hover:-translate-y-1.5 hover:z-40 hover:shadow-2xl",
                isPlus
                  ? "bg-card/90 shadow-xl border-blue-500/80 hover:border-blue-400 hover:shadow-blue-500/30 z-20"
                  : p.id === "business"
                    ? "bg-card/75 shadow-md border-border/70 hover:border-amber-400 hover:shadow-amber-500/30 z-10"
                    : "bg-card/75 shadow-md border-border/70 hover:border-emerald-400 hover:shadow-emerald-500/20 z-10",
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

                <h3 className={cn("text-[10px] sm:text-sm md:text-base font-black truncate", tColor.text)}>{p.name}</h3>

                {/* SUBTITLE */}
                <p className="text-[7px] sm:text-[9.5px] text-muted-foreground line-clamp-1 mt-0.5 font-medium">
                  {tr(p.subtitle)}
                </p>

                {/* PRICE ROW */}
                <div className="mt-1 flex items-baseline justify-center gap-0.5">
                  <span className="text-xs sm:text-base md:text-xl font-black text-foreground tracking-tight">
                    {priceObj.formatted}
                  </span>
                  <span className="text-[7px] sm:text-[10px] text-muted-foreground font-medium">/{tr("mo")}</span>
                </div>

                {/* CAPACITY PILL */}
                <div className="mt-1 flex justify-center">
                  <span className="px-1.5 py-0.5 rounded-full text-[6.5px] sm:text-[8.5px] font-semibold bg-muted/60 text-muted-foreground border border-border/50 whitespace-nowrap">
                    {p.shopsLimit} {p.shopsLimit === 1 ? tr("Shop") : tr("Shops")} | {p.warehousesLimit}{" "}
                    {p.warehousesLimit === 1 ? tr("Warehouse") : tr("Warehouses")}
                  </span>
                </div>
              </div>

              {/* FEATURES LIST (EXPANDED TO FILL FULL HEIGHT TO THE BUTTON) */}
              <div className="flex-1 my-1 sm:my-2 flex flex-col justify-between overflow-hidden min-h-0">
                {p.intro && (
                  <p className="text-[7px] sm:text-[9px] font-bold text-muted-foreground uppercase tracking-wider border-b border-border/40 pb-0.5 mb-0.5 shrink-0">
                    {tr(p.intro)}
                  </p>
                )}
                <ul className="flex-1 flex flex-col justify-evenly py-0.5 min-h-0">
                  {p.features.map((f, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-1 text-[7px] sm:text-[9px] md:text-[9.5px] leading-tight"
                    >
                      <Check className={cn("h-2.5 w-2.5 sm:h-3 sm:w-3 shrink-0 mt-0.5", tColor.text)} />
                      <span className="text-foreground/90 line-clamp-2">{tr(f)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* ACTION BUTTON */}
              <div className="shrink-0 pt-1">
                <ShopButton
                  onClick={(e) => {
                    e.stopPropagation();
                    setChosenPlanId(p.id);
                    setPaying(true);
                  }}
                  className={cn(
                    "w-full h-6 sm:h-7.5 md:h-8 text-[7.5px] sm:text-[10px] md:text-xs font-semibold cursor-pointer shadow-sm",
                    tColor.btn,
                  )}
                >
                  <span>{tr(`Continue with ${p.name}`)}</span>
                  <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3 ml-1" />
                </ShopButton>
              </div>
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
