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
  ShieldCheck,
  Info,
  Store,
  ExternalLink,
  Receipt,
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

type PaymentMethod = "mobile" | "card" | "bank" | "paypal";
type MobileNetwork = "mpesa" | "airtel";
type BankChoice = "kcb" | "equity" | "coop" | "stanbic";

function Plans() {
  const { t, tr, dir } = useLanguage();
  const nav = useNavigate();
  const router = useRouter();

  const [yearly, setYearly] = useState(false);
  const [paying, setPaying] = useState(false);
  const [chosenPlanId, setChosenPlanId] = useState<PlanId>("plus");
  const [restoring, setRestoring] = useState(false);
  const [currency, setCurrency] = useState<string>("KSH");

  // Payment Form States
  const [method, setMethod] = useState<PaymentMethod>("mobile");
  const [mobileNetwork, setMobileNetwork] = useState<MobileNetwork>("mpesa");
  const [phone, setPhone] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [selectedBank, setSelectedBank] = useState<BankChoice>("kcb");
  const [copiedBank, setCopiedBank] = useState(false);

  // Status Lifecycle: "idle" -> "processing" -> "success"
  const [payStatus, setPayStatus] = useState<"idle" | "processing" | "success">("idle");
  const [processStep, setProcessStep] = useState(1);
  const [confirmedDate, setConfirmedDate] = useState("");

  const bankReference = useMemo(() => `SB-${Math.floor(10000 + Math.random() * 90000)}`, []);

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

  const copyBankDetails = () => {
    const bankDetails =
      selectedBank === "kcb"
        ? "Bank: KCB Bank, Account: 1234 5678 9012, Branch: Nairobi Branch, Name: Shopbook Ltd"
        : "Bank: Equity Bank, Account: 0810 2938 4910, Branch: Upper Hill, Name: Shopbook Ltd";
    navigator.clipboard?.writeText(`${bankDetails}, Ref: ${bankReference}`);
    setCopiedBank(true);
    toast.success(tr("Bank details and payment reference copied!"));
    setTimeout(() => setCopiedBank(false), 2500);
  };

  const runPaymentWorkflow = () => {
    setPayStatus("processing");
    setProcessStep(1);

    setTimeout(() => setProcessStep(2), 700);
    setTimeout(() => setProcessStep(3), 1500);
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
      toast.success(tr(`Payment confirmed! ${plan.name} plan is now active.`));
    }, 2300);
  };

  const handlePayNow = () => {
    if (method === "mobile") {
      const cleanPhone = phone.replace(/[\s-]/g, "");
      if (cleanPhone.length < 9) {
        toast.error(tr("Enter a valid phone number"));
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
  // PAYMENT PAGE (Screen 1 to 5)
  // -------------------------------------------------------------
  if (paying) {
    return (
      <main
        dir={dir}
        className="app-screen min-h-[100dvh] max-h-[100dvh] overflow-y-auto flex flex-col justify-between px-3 py-2.5 md:py-3.5 w-full max-w-md mx-auto box-border"
      >
        {/* Top Header */}
        <header className="flex items-center justify-between shrink-0 mb-2">
          <ShopButton
            variant="bare"
            onClick={() => {
              if (payStatus === "processing") {
                setPayStatus("idle");
              } else {
                setPaying(false);
                setPayStatus("idle");
              }
            }}
            aria-label={t("back")}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
          </ShopButton>
          <Wordmark className="text-sm font-black" />
          <div className="w-7" />
        </header>

        {/* PROCESSING & SUCCESS VIEW (Screen 5) */}
        {payStatus === "processing" ? (
          <div className="my-auto rounded-xl border border-blue-500/50 bg-[#0B1528] p-5 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="relative flex items-center justify-center w-20 h-20 rounded-full border-2 border-blue-500/40 bg-blue-950/40 animate-pulse">
              <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 border-transparent animate-spin" />
              <Smartphone className="h-8 w-8 text-blue-400" />
            </div>

            <div>
              <h2 className="text-base font-bold text-foreground">{tr("Processing Payment")}</h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-[260px]">
                {method === "mobile"
                  ? tr("Please check your phone and enter your PIN to complete the payment.")
                  : tr("Verifying payment transaction with gateway...")}
              </p>
            </div>

            <div className="w-full text-left space-y-2 py-2 text-xs">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn("h-4 w-4 shrink-0", processStep >= 1 ? "text-blue-400" : "text-muted-foreground/40")}
                />
                <span className={processStep >= 1 ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {method === "mobile" ? tr("Payment request sent to your phone") : tr("Payment initiated securely")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn("h-4 w-4 shrink-0", processStep >= 2 ? "text-blue-400" : "text-muted-foreground/40")}
                />
                <span className={processStep >= 2 ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {tr("Waiting for confirmation...")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn("h-4 w-4 shrink-0", processStep >= 3 ? "text-blue-400" : "text-muted-foreground/40")}
                />
                <span className={processStep >= 3 ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {tr("Verifying payment")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className={cn("h-4 w-4 shrink-0", processStep >= 4 ? "text-emerald-400" : "text-muted-foreground/40")}
                />
                <span className={processStep >= 4 ? "text-foreground font-medium" : "text-muted-foreground"}>
                  {tr("Activating your subscription")}
                </span>
              </div>
            </div>

            <ShopButton
              variant="bare"
              onClick={() => setPayStatus("idle")}
              className="text-xs text-muted-foreground hover:text-destructive underline py-1"
            >
              {tr("Cancel Payment")}
            </ShopButton>
          </div>
        ) : payStatus === "success" ? (
          <div className="my-auto rounded-xl border border-emerald-500/50 bg-[#0B1528] p-5 shadow-2xl flex flex-col items-center text-center space-y-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 shadow-lg shadow-emerald-500/30">
              <Check className="h-8 w-8 stroke-[3]" />
            </div>

            <div>
              <h2 className="text-lg font-black text-foreground">{tr("Payment Successful!")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tr("Your")} {plan.name} {tr("Plan is now active.")}
              </p>
            </div>

            <div className="w-full rounded-lg border border-border/80 bg-background/50 p-3 space-y-2 text-xs">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Plan")}</span>
                <span className="font-semibold text-foreground">
                  {plan.name} ({yearly ? tr("Yearly") : tr("Monthly")})
                </span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Amount Paid")}</span>
                <span className="font-bold text-foreground">{currentPrice.formatted}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Payment Method")}</span>
                <span className="font-semibold text-foreground uppercase">{method}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Date")}</span>
                <span className="font-medium text-foreground">{confirmedDate}</span>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>{tr("Status")}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/40">
                  {tr("Active")}
                </span>
              </div>
            </div>

            <div className="w-full space-y-2 pt-1">
              <ShopButton
                variant="primary"
                onClick={() => nav({ to: "/apps" })}
                className="w-full py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
              >
                <span>{tr("Go to Apps")}</span>
                <ArrowRight className="h-4 w-4" />
              </ShopButton>
              <ShopButton
                variant="bare"
                onClick={() => toast.info(tr("Receipt saved to account records."))}
                className="w-full py-1 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
              >
                <Receipt className="h-3.5 w-3.5" />
                <span>{tr("View Receipt")}</span>
              </ShopButton>
            </div>
          </div>
        ) : (
          /* MAIN UNIFIED CHECKOUT FORM */
          <div className="space-y-3 pb-2">
            <div className="text-center">
              <h1 className="text-base font-bold text-foreground">{tr("Complete Your Subscription")}</h1>
              <p className="text-[11px] text-muted-foreground">{tr("Choose a payment method to activate your plan")}</p>
            </div>

            {/* 1. Compact Top Summary */}
            <div className="rounded-lg border border-blue-500/30 bg-[#0E1A32] p-2.5 flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-md bg-blue-600/30 border border-blue-500/40 text-blue-400">
                  <Store className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">
                    {plan.name} {tr("Plan")}
                  </div>
                  <div className="text-[10px] text-muted-foreground leading-tight">
                    {yearly ? tr("Yearly") : tr("Monthly")}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-extrabold text-foreground">{currentPrice.formatted}</div>
                <button
                  type="button"
                  onClick={() => setPaying(false)}
                  className="text-[10.5px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                >
                  {tr("Change >")}
                </button>
              </div>
            </div>

            {/* 2. Four Categories in One Horizontal Row */}
            <div>
              <div className="text-[10.5px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 px-0.5">
                {tr("Select Payment Method")}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setMethod("mobile")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-1 rounded-lg border transition-all text-center",
                    method === "mobile"
                      ? "border-blue-500 bg-blue-950/50 shadow-md shadow-blue-500/30 text-blue-400"
                      : "border-border/70 bg-[#0C1629] text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <Smartphone className="h-4 w-4 mb-1" />
                  <span className="text-[10px] font-semibold leading-tight line-clamp-2">{tr("Mobile Payment")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("card")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-1 rounded-lg border transition-all text-center",
                    method === "card"
                      ? "border-blue-500 bg-blue-950/50 shadow-md shadow-blue-500/30 text-blue-400"
                      : "border-border/70 bg-[#0C1629] text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <CreditCard className="h-4 w-4 mb-1" />
                  <span className="text-[10px] font-semibold leading-tight">{tr("Card")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("bank")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-1 rounded-lg border transition-all text-center",
                    method === "bank"
                      ? "border-blue-500 bg-blue-950/50 shadow-md shadow-blue-500/30 text-blue-400"
                      : "border-border/70 bg-[#0C1629] text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <Building2 className="h-4 w-4 mb-1" />
                  <span className="text-[10px] font-semibold leading-tight line-clamp-2">{tr("Bank Transfer")}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMethod("paypal")}
                  className={cn(
                    "flex flex-col items-center justify-center py-2 px-1 rounded-lg border transition-all text-center",
                    method === "paypal"
                      ? "border-blue-500 bg-blue-950/50 shadow-md shadow-blue-500/30 text-blue-400"
                      : "border-border/70 bg-[#0C1629] text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  <span className="text-xs font-black italic mb-1 font-serif">P</span>
                  <span className="text-[10px] font-semibold leading-tight">{tr("PayPal")}</span>
                </button>
              </div>
            </div>

            {/* 3. Form Content */}
            <div className="rounded-xl border border-border/80 bg-[#0B1528] p-3.5 space-y-3 shadow-md">
              {/* TAB 1: Mobile Payment */}
              {method === "mobile" && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5 pb-1">
                    <div className="w-7 h-7 rounded-md bg-blue-950/60 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                      <Smartphone className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-foreground leading-tight">{tr("Mobile Payment")}</h2>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {tr("Pay with M-Pesa, Airtel Money, T-Kash and other mobile networks.")}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold text-muted-foreground mb-1 block">
                      {tr("Select Network")}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMobileNetwork("mpesa")}
                        className={cn(
                          "py-2 px-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-colors",
                          mobileNetwork === "mpesa"
                            ? "border-emerald-500 bg-emerald-950/30 font-bold text-emerald-400"
                            : "border-border bg-card/60 text-foreground/80 hover:bg-card",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>M-Pesa</span>
                        </span>
                        {mobileNetwork === "mpesa" && <Check className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setMobileNetwork("airtel")}
                        className={cn(
                          "py-2 px-2.5 rounded-lg border text-left flex items-center justify-between text-xs transition-colors",
                          mobileNetwork === "airtel"
                            ? "border-red-500 bg-red-950/30 font-bold text-red-400"
                            : "border-border bg-card/60 text-foreground/80 hover:bg-card",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-red-500" />
                          <span>Airtel Money</span>
                        </span>
                        {mobileNetwork === "airtel" && <Check className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold text-muted-foreground mb-1 block">
                      {tr("Phone Number")}
                    </label>
                    <Field
                      icon={<Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
                      type="tel"
                      placeholder="0712 345 678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>

                  <div className="rounded-lg bg-blue-950/40 border border-blue-500/30 p-2 flex items-start gap-2 text-[10.5px] text-blue-300">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
                    <span>
                      {tr("You will receive a payment prompt on this number. Enter your PIN to complete the payment.")}
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: Card Payment */}
              {method === "card" && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5 pb-1">
                    <div className="w-7 h-7 rounded-md bg-blue-950/60 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-foreground leading-tight">{tr("Card Payment")}</h2>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {tr("Pay with Visa, Mastercard and other cards.")}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold text-muted-foreground mb-1 block">
                      {tr("Cardholder Name")}
                    </label>
                    <Field
                      type="text"
                      placeholder={tr("Enter cardholder name")}
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold text-muted-foreground mb-1 block">
                      {tr("Card Number")}
                    </label>
                    <Field
                      icon={<CreditCard className="h-3.5 w-3.5 text-muted-foreground" />}
                      type="text"
                      inputMode="numeric"
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={(e) => handleCardNumberChange(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10.5px] font-semibold text-muted-foreground mb-1 block">
                        {tr("Expiry Date")}
                      </label>
                      <Field
                        type="text"
                        inputMode="numeric"
                        placeholder="MM / YY"
                        value={cardExpiry}
                        onChange={(e) => handleExpiryChange(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10.5px] font-semibold text-muted-foreground mb-1 block">
                        {tr("CVV")}
                      </label>
                      <Field
                        icon={<Lock className="h-3 w-3 text-muted-foreground" />}
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="123"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-border bg-card/60 text-muted-foreground">
                      VISA
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-border bg-card/60 text-muted-foreground">
                      Mastercard
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-border bg-card/60 text-muted-foreground">
                      AMEX
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 3: Bank Transfer */}
              {method === "bank" && (
                <div className="space-y-2.5">
                  <div className="flex items-start gap-2.5 pb-1">
                    <div className="w-7 h-7 rounded-md bg-blue-950/60 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-foreground leading-tight">{tr("Bank Transfer")}</h2>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {tr("Transfer from your bank account.")}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10.5px] font-semibold text-muted-foreground mb-1 block">
                      {tr("Select Bank")}
                    </label>
                    <select
                      value={selectedBank}
                      onChange={(e) => setSelectedBank(e.target.value as BankChoice)}
                      className="w-full h-8 text-xs px-2 rounded-lg border border-border bg-background text-foreground"
                    >
                      <option value="kcb">KCB Bank (522522)</option>
                      <option value="equity">Equity Bank (247247)</option>
                      <option value="coop">Cooperative Bank (400200)</option>
                      <option value="stanbic">Stanbic Bank (600100)</option>
                    </select>
                  </div>

                  <div className="rounded-lg border border-border/80 bg-background/50 p-2.5 space-y-1.5 text-xs">
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>{tr("Account Name")}</span>
                      <span className="font-semibold text-foreground">Shopbook Ltd</span>
                    </div>
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>{tr("Account Number")}</span>
                      <span className="font-mono font-bold text-foreground">
                        {selectedBank === "kcb" ? "1234 5678 9012" : "0810 2938 4910"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>{tr("Bank Name")}</span>
                      <span className="font-semibold text-foreground">
                        {selectedBank === "kcb" ? "KCB Bank" : "Equity Bank"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-muted-foreground">
                      <span>{tr("Payment Reference")}</span>
                      <span className="font-mono font-bold text-blue-400">{bankReference}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={copyBankDetails}
                    className="w-full flex items-center justify-center gap-1.5 py-1 text-[11px] text-blue-400 hover:text-blue-300 font-semibold transition-colors"
                  >
                    {copiedBank ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    <span>{copiedBank ? tr("Copied to clipboard") : tr("Copy Details")}</span>
                  </button>

                  <div className="rounded-lg bg-blue-950/40 border border-blue-500/30 p-2 flex items-start gap-2 text-[10.5px] text-blue-300">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />
                    <span>
                      {tr(
                        "Make the transfer and click 'I Have Paid' below. Your subscription will be activated once payment is verified.",
                      )}
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 4: PayPal */}
              {method === "paypal" && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5 pb-1">
                    <div className="w-7 h-7 rounded-md bg-blue-950/60 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 font-serif font-black italic">
                      P
                    </div>
                    <div>
                      <h2 className="text-xs font-bold text-foreground leading-tight">{tr("Pay with PayPal")}</h2>
                      <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {tr("You will be redirected to PayPal to complete the payment securely.")}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-blue-500/40 bg-gradient-to-br from-[#0c2044] to-[#081226] p-4 flex flex-col items-center justify-center text-center shadow-inner">
                    <span className="text-2xl font-serif font-black italic text-blue-400 mb-1">PayPal</span>
                    <span className="text-[11px] text-muted-foreground">{tr("Fast, secure global checkout")}</span>
                  </div>

                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <span>{tr("Pay with your PayPal account")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <span>{tr("Use your PayPal balance or linked card")}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <span>{tr("Secure and encrypted payment")}</span>
                    </li>
                  </ul>
                </div>
              )}

              {/* Summary Row */}
              <div className="pt-2 border-t border-border/70 flex justify-between items-center text-xs">
                <div>
                  <span className="text-muted-foreground">{tr("Plan")}: </span>
                  <span className="font-semibold text-foreground">
                    {plan.name} ({yearly ? tr("Yearly") : tr("Monthly")})
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{tr("Amount")}: </span>
                  <span className="font-bold text-foreground">{currentPrice.formatted}</span>
                </div>
              </div>

              {/* Action Button */}
              <ShopButton
                variant="primary"
                onClick={handlePayNow}
                className="w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 shadow-md bg-blue-600 hover:bg-blue-500"
              >
                {method === "bank" ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span>{tr("I Have Paid")}</span>
                  </>
                ) : method === "paypal" ? (
                  <>
                    <ExternalLink className="h-4 w-4" />
                    <span>{tr("Pay with PayPal ↗")}</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" />
                    <span>
                      {method === "mobile" && mobileNetwork === "mpesa"
                        ? tr("Pay Now with M-Pesa")
                        : method === "mobile" && mobileNetwork === "airtel"
                          ? tr("Pay Now with Airtel Money")
                          : tr("Pay Now")}
                    </span>
                  </>
                )}
              </ShopButton>

              {/* Trust Badge */}
              <div className="flex items-center justify-center gap-1.5 pt-0.5 text-[10px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>{tr("Secure Payment — Your payment is encrypted and secure")}</span>
              </div>
            </div>
          </div>
        )}

        <div className="h-1" />
      </main>
    );
  }

  // -------------------------------------------------------------
  // PLANS OVERVIEW GRID
  // -------------------------------------------------------------
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

      {/* 3 Pricing Cards Grid: Dominant Plus & High-Impact Hover */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 md:gap-3 flex-1 min-h-0 mt-3 mb-1 items-stretch group">
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
                "relative rounded-xl border bg-card/85 p-3 md:p-3.5 flex flex-col justify-between transition-all duration-200 cursor-pointer overflow-visible",
                p.id === "plus" ? "md:-translate-y-1 md:scale-[1.015] z-10" : "z-0",
                tColors.border,
                // Dominant high-contrast hover styles
                "hover:!-translate-y-3.5 hover:!scale-[1.03] hover:!z-30 group-hover:opacity-75 hover:!opacity-100",
                p.id === "basic" &&
                  "hover:border-2.5 hover:border-emerald-400 hover:shadow-2xl hover:shadow-emerald-500/40",
                p.id === "plus" && "hover:border-3 hover:border-blue-400 hover:shadow-2xl hover:shadow-blue-500/60",
                p.id === "business" &&
                  "hover:border-2.5 hover:border-amber-400 hover:shadow-2xl hover:shadow-amber-500/40",
              )}
            >
              {p.recommended && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-20 text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-600 text-white shadow-lg shadow-blue-500/50 ring-2 ring-background">
                  {tr("RECOMMENDED")}
                </span>
              )}
              {p.best && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-20 text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-600 text-white shadow-lg shadow-amber-500/50 ring-2 ring-background">
                  {tr("BEST")}
                </span>
              )}

              {/* Card Header & Price */}
              <div>
                <div className="flex items-center justify-between">
                  <h2 className={cn("text-xs md:text-sm font-black uppercase tracking-wide", tColors.text)}>
                    {p.name}
                  </h2>
                </div>

                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-xl md:text-2xl font-black tracking-tight">{priceObj.formatted}</span>
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
                      <Check className={cn("h-3 w-3 shrink-0 mt-0.5 stroke-[2.5]", tColors.text)} />
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
                  className="w-full h-7 md:h-7.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[10.5px] md:text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 shadow-sm shrink-0"
                >
                  <span>
                    {tr("Continue with")} {p.name}
                  </span>
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
