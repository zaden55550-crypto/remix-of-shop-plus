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
  X,
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

type MobileNetwork =
  "mpesa" | "evc" | "zaad" | "airtel" | "mtn" | "orange" | "tigo" | "vodafone" | "telebirr" | "ecocash";

interface CountryDialOption {
  code: string;
  dial: string;
  name: string;
  defaultNet: MobileNetwork;
}

const COUNTRY_DIAL_OPTIONS: CountryDialOption[] = [
  { code: "KEN", dial: "+254", name: "Kenya (+254)", defaultNet: "mpesa" },
  { code: "SOM", dial: "+252", name: "Somalia (+252)", defaultNet: "evc" },
  { code: "UGA", dial: "+256", name: "Uganda (+256)", defaultNet: "mtn" },
  { code: "TZA", dial: "+255", name: "Tanzania (+255)", defaultNet: "tigo" },
  { code: "RWA", dial: "+250", name: "Rwanda (+250)", defaultNet: "mtn" },
  { code: "ETH", dial: "+251", name: "Ethiopia (+251)", defaultNet: "telebirr" },
  { code: "SSD", dial: "+211", name: "South Sudan (+211)", defaultNet: "mtn" },
  { code: "DJI", dial: "+253", name: "Djibouti (+253)", defaultNet: "orange" },
  { code: "NGA", dial: "+234", name: "Nigeria (+234)", defaultNet: "mtn" },
  { code: "GHA", dial: "+233", name: "Ghana (+233)", defaultNet: "mtn" },
  { code: "ZAF", dial: "+27", name: "South Africa (+27)", defaultNet: "vodafone" },
  { code: "USA", dial: "+1", name: "United States (+1)", defaultNet: "mpesa" },
  { code: "GBR", dial: "+44", name: "United Kingdom (+44)", defaultNet: "mpesa" },
  { code: "ARE", dial: "+971", name: "UAE (+971)", defaultNet: "mpesa" },
];

const MOBILE_NETWORKS: { id: MobileNetwork; name: string; country: string; active: boolean }[] = [
  { id: "mpesa", name: "Safaricom M-Pesa", country: "Kenya / East Africa", active: true },
  { id: "evc", name: "EVC Plus / Hormuud", country: "Somalia", active: true },
  { id: "zaad", name: "Zaad / Telesom", country: "Somalia & Somaliland", active: true },
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

  // Country Dial Code Auto-Selected From Login
  const [selectedDial, setSelectedDial] = useState<string>("+254");

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
    } else {
      const detected = detectUserCountry();
      if (detected?.currencyCode) {
        setCurrency(detected.currencyCode);
      }
    }

    // Auto-select dial code from account country (e.g. KEN -> +254, SOM -> +252)
    const match = COUNTRY_DIAL_OPTIONS.find((c) => c.code === (acct?.country || "KEN"));
    if (match) {
      setSelectedDial(match.dial);
      setMobileNetwork(match.defaultNet);
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
      const activeNet = MOBILE_NETWORKS.find((n) => n.id === mobileNetwork);
      if (!activeNet?.active) {
        toast.info(tr("Direct integration for this network is coming soon. Please choose an active network or Card."));
        return;
      }

      // Mandatory validation: number must include country code (e.g. +254..., +252...)
      const fullPhone = phone.trim().startsWith("+")
        ? phone.trim()
        : `${selectedDial}${phone.trim().replace(/^0+/, "")}`;
      const cleanPhone = fullPhone.replace(/[\s-]/g, "");

      if (!cleanPhone.startsWith("+") || cleanPhone.length < 10) {
        toast.error(tr("Enter a valid mobile number with 3-digit country code (e.g. +254... or +252...)"));
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
      } else {
        toast.info(tr("No active paid subscription found on this account."));
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleDialChange = (newDial: string) => {
    setSelectedDial(newDial);
    const match = COUNTRY_DIAL_OPTIONS.find((c) => c.dial === newDial);
    if (match) {
      setMobileNetwork(match.defaultNet);
    }
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
                  {tr("Confirming active SHOPBOOK session")}
                </span>
              </div>
            </div>
          </div>
        ) : payStatus === "success" ? (
          /* SUCCESS SCREEN */
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
                <span className="font-semibold text-foreground">{method === "mobile" ? "Mobile Money" : "Card"}</span>
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
          /* MAIN UNIFIED CHECKOUT FORM — ZERO-SCROLL */
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

            {/* 2. PAYMENT METHOD TABS (MOBILE MONEY & CARD) */}
            <div className="grid grid-cols-2 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setMethod("mobile")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border transition-all text-center cursor-pointer",
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
                  "flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg border transition-all text-center cursor-pointer",
                  method === "card"
                    ? "border-blue-500 bg-blue-950/50 shadow-md shadow-blue-500/30 text-blue-400 font-bold"
                    : "border-border/70 bg-[#0C1629] text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span className="text-[11px] leading-tight">{tr("Card")}</span>
              </button>
            </div>

            {/* 3. FORM CONTENT BOX */}
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
                      className="w-full h-8 text-xs px-2 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
                    >
                      {MOBILE_NETWORKS.map((net) => (
                        <option key={net.id} value={net.id}>
                          {net.name} ({net.country}) {net.active ? `— Active` : `— Coming soon`}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                      {tr("Mobile Number (With Country Code)")}
                    </label>

                    {/* TWO-COLUMN PHONE ROW: AUTO-SELECTED COUNTRY CODE + LOCAL NUMBER */}
                    <div className="flex gap-1.5">
                      <select
                        value={selectedDial}
                        onChange={(e) => handleDialChange(e.target.value)}
                        className="h-8 w-28 text-xs px-1.5 rounded-lg border border-border bg-background text-foreground focus:outline-none focus:border-blue-500 font-semibold cursor-pointer shrink-0"
                        title={tr("Country Dial Code")}
                      >
                        {COUNTRY_DIAL_OPTIONS.map((c) => (
                          <option key={c.code} value={c.dial}>
                            {c.dial} ({c.code})
                          </option>
                        ))}
                      </select>

                      <div className="flex-1">
                        <Field
                          icon={<Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
                          type="tel"
                          placeholder={`${selectedDial} 7...`}
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md bg-blue-950/40 border border-blue-500/30 p-2 flex items-start gap-1.5 text-[10px] text-blue-300">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
                    <span>
                      {mobileNetwork === "mpesa"
                        ? tr("You will receive an STK Push prompt on this phone. Enter your M-Pesa PIN to complete.")
                        : mobileNetwork === "evc" || mobileNetwork === "zaad"
                          ? tr("You will receive an automated USSD prompt on this phone. Confirm payment to activate.")
                          : tr("Enter your registered mobile money phone number to receive payment authorization.")}
                    </span>
                  </div>
                </div>
              )}

              {/* TAB 2: Card Payment */}
              {method === "card" && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                      {tr("Cardholder Name")}
                    </label>
                    <Field
                      type="text"
                      placeholder="e.g. John Doe"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                      {tr("Card Number")}
                    </label>
                    <Field
                      icon={<CreditCard className="h-3.5 w-3.5 text-muted-foreground" />}
                      type="text"
                      placeholder="4000 1234 5678 9010"
                      value={cardNumber}
                      onChange={(e) => handleCardNumberChange(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground mb-0.5 block">
                        {tr("Expiry (MM/YY)")}
                      </label>
                      <Field
                        type="text"
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
                        icon={<Lock className="h-3 w-3 text-muted-foreground" />}
                        type="password"
                        placeholder="123"
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* BOTTOM ACTIONS INSIDE BOX */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                <div className="text-[11px] leading-tight">
                  <span className="text-muted-foreground block text-[9.5px] uppercase">{tr("Total Due")}</span>
                  <span className="font-extrabold text-foreground text-xs sm:text-sm">{currentPrice.formatted}</span>
                </div>

                <ShopButton
                  onClick={handlePayNow}
                  className="h-8 px-4 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>
                    {method === "mobile"
                      ? tr(`Pay with ${MOBILE_NETWORKS.find((n) => n.id === mobileNetwork)?.name || "Mobile"}`)
                      : tr("Pay with Card")}
                  </span>
                </ShopButton>
              </div>
            </div>

            {/* 4. FOOTER NOTE */}
            <p className="text-[9.5px] text-muted-foreground text-center shrink-0">
              {tr("Secured with 256-bit encryption. Cancel or modify anytime.")}
            </p>
          </div>
        )}
      </main>
    );
  }

  // =========================================================================
  // VIEW: MAIN OVERVIEW PLANS (3 COLUMNS ON MOBILE, STRICT ZERO-SCROLL)
  // =========================================================================
  return (
    <main
      dir={dir}
      className="app-screen relative flex flex-col justify-between px-2 sm:px-4 md:px-6 py-1 sm:py-2 select-none"
      style={{ minHeight: "calc(100dvh / var(--fluid-scale, 1))" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between shrink-0 py-0.5">
        <ShopButton
          variant="ghost"
          onClick={() => router.history.back()}
          aria-label={t("back")}
          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronLeft className="h-5 w-5 rtl:rotate-180" />
        </ShopButton>
        <Wordmark className="text-sm font-black" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={restoring}
            onClick={handleRestorePurchases}
            className="text-[9.5px] font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
            title={tr("Check and restore your previous active subscription")}
          >
            {restoring ? tr("Restoring...") : tr("Restore Purchases")}
          </button>
          <button
            type="button"
            onClick={() => setCurrency((c) => (c === "USD" ? store.get()?.currency || "KSH" : "USD"))}
            className="text-[9.5px] font-bold px-2.5 py-0.5 rounded-full border border-border bg-card/70 text-foreground/80 hover:bg-card cursor-pointer"
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

      {/* Monthly / Yearly Billing Toggle */}
      <div className="flex items-center justify-center shrink-0 my-0.5 w-full">
        <div className="grid grid-cols-2 rounded-xl border border-border bg-card/80 p-0.5 text-xs w-full max-w-sm sm:max-w-md shadow-sm">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              "py-1.5 px-3 rounded-lg text-xs font-semibold transition-all text-center cursor-pointer",
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
              "py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer",
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

      {/* 3 Pricing Cards Side-by-Side (3 Columns On All Screens) */}
      <div className="grid grid-cols-3 gap-1.5 md:gap-3 flex-1 min-h-0 my-0.5 items-stretch relative">
        {PLANS.map((p) => {
          const priceObj = convertUsdToCurrency(yearly ? p.yearlyUsd : p.monthlyUsd, currency);
          const tColor = tone[p.id];
          const isPlus = p.id === "plus";

          return (
            <div
              key={p.id}
              onClick={() => {
                setChosenPlanId(p.id);
                setPaying(true);
              }}
              className={cn(
                "relative rounded-xl border bg-card/95 transition-all duration-300 flex flex-col justify-between overflow-visible cursor-pointer",
                "px-1.5 py-1.5 sm:px-3 sm:py-2.5",
                isPlus
                  ? "border-2 border-blue-500 shadow-lg shadow-blue-500/20 z-10"
                  : "border-border/80 hover:border-foreground/40",
                "hover:-translate-y-1 hover:shadow-xl hover:z-20 hover:border-2",
                p.id === "basic" && "hover:border-emerald-500 hover:shadow-emerald-500/20",
                p.id === "plus" && "hover:border-blue-400 hover:shadow-blue-500/30",
                p.id === "business" && "hover:border-amber-500 hover:shadow-amber-500/20",
              )}
            >
              {/* Badges */}
              {p.recommended && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-1.5 py-0.2 sm:px-2 sm:py-0.5 text-[7px] sm:text-[9.5px] font-extrabold uppercase tracking-wide text-white shadow-sm whitespace-nowrap z-30">
                  {tr("RECOMMENDED")}
                </span>
              )}
              {p.best && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-1.5 py-0.2 sm:px-2 sm:py-0.5 text-[7px] sm:text-[9.5px] font-extrabold uppercase tracking-wide text-slate-950 shadow-sm whitespace-nowrap z-30">
                  {tr("BEST")}
                </span>
              )}

              {/* Card Header */}
              <div className="shrink-0 text-center pt-0.5">
                <h3 className="text-[10px] sm:text-xs md:text-sm font-bold truncate text-foreground">{p.name}</h3>
                <div className="flex items-baseline justify-center gap-0.5 mt-0.5">
                  <span className="text-xs sm:text-lg md:text-2xl font-black text-foreground whitespace-nowrap">
                    {priceObj.formatted}
                  </span>
                  <span className="text-[8px] sm:text-[10px] text-muted-foreground whitespace-nowrap">
                    / {yearly ? tr("yr") : tr("mo")}
                  </span>
                </div>
                {yearly && (
                  <p className="text-[7px] sm:text-[9px] text-emerald-400 font-medium truncate mt-0.2">
                    {tr("yearly save 10%")}
                  </p>
                )}
              </div>

              {/* Action Button */}
              <div className="my-1 shrink-0 px-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setChosenPlanId(p.id);
                    setPaying(true);
                  }}
                  className={cn(
                    "w-full rounded-md text-[8px] sm:text-[11px] font-semibold transition-all flex items-center justify-center gap-0.5 cursor-pointer",
                    "py-1 px-1 sm:py-1.5 sm:px-2",
                    isPlus
                      ? "bg-blue-600 hover:bg-blue-500 text-white shadow-sm shadow-blue-600/30 font-bold"
                      : "border border-border/80 bg-background/80 hover:bg-accent text-foreground",
                  )}
                >
                  <span className="truncate">{tr(`Continue with ${p.name}`)}</span>
                  <ArrowRight className="h-2 w-2 sm:h-3 sm:w-3 shrink-0" />
                </button>
              </div>

              {/* Features List */}
              <div className="space-y-0.5 sm:space-y-1 text-[8px] sm:text-[9.5px] border-t border-border/60 pt-1 flex-1 overflow-hidden">
                {p.intro && (
                  <div className="text-[7px] sm:text-[8.5px] font-bold text-muted-foreground uppercase tracking-wide truncate">
                    {p.intro}
                  </div>
                )}
                {p.features.map((f, i) => (
                  <div key={i} className="flex items-start gap-1 leading-tight">
                    <Check
                      className={cn(
                        "h-2 w-2 sm:h-2.5 sm:w-2.5 shrink-0 mt-0.5",
                        p.id === "basic" && "text-emerald-400",
                        p.id === "plus" && "text-blue-400",
                        p.id === "business" && "text-amber-400",
                      )}
                    />
                    <span className="line-clamp-2 text-foreground/90">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Solid Emerald Green Free Trial Button */}
      <div className="shrink-0 my-0.5 pt-0.5">
        <button
          type="button"
          onClick={startTrial}
          className="w-full py-2 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all text-center bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <span>{tr("Start with 30-day free trial")}</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </main>
  );
}
