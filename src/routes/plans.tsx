import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Field, Wordmark } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { PLANS, fmtKsh, store, type PlanId } from "@/lib/shopbook";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Choose Your Plan — SHOPBOOK ERP" },
      {
        name: "description",
        content: "Compare Basic, Plus and Business SHOPBOOK plans, or start a free 30-day full ERP trial.",
      },
      { property: "og:title", content: "Choose Your Plan — SHOPBOOK ERP" },
      { property: "og:description", content: "Compare SHOPBOOK plans or start a free 30-day trial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Plans,
});

const tone: Record<PlanId, { border: string; text: string; surface: string; headerBg: string }> = {
  basic: {
    border: "border-emerald-500/60",
    text: "text-emerald-400",
    surface: "bg-emerald-950/20",
    headerBg: "bg-emerald-500/10",
  },
  plus: {
    border: "border-blue-500",
    text: "text-blue-400",
    surface: "bg-blue-950/30",
    headerBg: "bg-blue-500/15",
  },
  business: {
    border: "border-purple-500/60",
    text: "text-purple-400",
    surface: "bg-purple-950/20",
    headerBg: "bg-purple-500/10",
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
  const plan = useMemo(() => PLANS.find((item) => item.id === selected) ?? PLANS[1], [selected]);

  const price = yearly ? plan.yearly : plan.monthly;

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

  const requestPayment = () => {
    const cleaned = phone.replace(/\s+/g, "");
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(cleaned)) {
      toast.error(tr("Enter a valid Kenyan M-Pesa phone number"));
      return;
    }
    toast(tr("Online payments are coming soon. Start the free trial for now — your data stays when you upgrade."));
  };

  if (paying) {
    return (
      <main
        dir={dir}
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

          <h1 className="mt-2 text-center text-xl font-bold">{tr("Pay with M-Pesa")}</h1>
          <p className="mt-0.5 text-center text-xs text-muted-foreground">
            {t("planSuffix", plan.name)} · {fmtKsh(price)} {tr("/ month")}
            {yearly && (
              <>
                {" "}
                · {tr("Billed yearly")}: {fmtKsh(price * 12)}
              </>
            )}
          </p>

          <div className="mt-4 space-y-2.5">
            <Field
              icon={<Smartphone className="h-4 w-4" />}
              type="tel"
              inputMode="tel"
              placeholder={tr("M-Pesa phone number")}
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
      className="app-screen h-[100dvh] max-h-[100dvh] overflow-hidden flex flex-col justify-between px-2.5 py-1.5 md:py-2.5 md:max-w-4xl mx-auto box-border"
    >
      {/* Top Header: Back + Wordmark */}
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
        <div className="w-7" />
      </header>

      {/* Title & Subtitle */}
      <div className="text-center shrink-0 my-0.5">
        <h1 className="text-sm md:text-base font-bold leading-tight">{tr("Choose Your Plan")}</h1>
        <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
          {tr("Unlock more features and grow your business with SHOPBOOK")}
        </p>
      </div>

      {/* Monthly / Yearly Switch */}
      <div className="mx-auto shrink-0 mb-1 grid w-full max-w-[210px] grid-cols-2 rounded-full border border-border bg-card/70 p-0.5 text-[10px]">
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

      {/* 3 Plans Columns Grid */}
      <div className="grid grid-cols-3 gap-1.5 flex-1 min-h-0 items-stretch my-0.5">
        {PLANS.map((item) => {
          const isMid = item.id === "plus";
          const itemTone = tone[item.id];
          const shownPrice = yearly ? item.yearly : item.monthly;

          return (
            <div
              key={item.id}
              className={cn(
                "relative flex flex-col justify-between rounded-lg border p-1.5 text-start transition-all",
                isMid ? "border-2 border-blue-500 shadow-md shadow-blue-500/10" : itemTone.border,
                itemTone.surface,
              )}
            >
              {/* RECOMMENDED Badge for Middle Plan */}
              {isMid && (
                <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-2 py-0.2 text-[8px] font-black uppercase tracking-wider text-white shadow-xs whitespace-nowrap">
                  RECOMMENDED
                </span>
              )}

              {/* Card Header Content */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div
                  className={cn(
                    "text-center text-[10px] md:text-xs font-black uppercase tracking-wider",
                    isMid && "mt-1",
                    itemTone.text,
                  )}
                >
                  {item.name}
                </div>

                <div className="mt-0.5 text-center text-xs md:text-sm font-black leading-tight">
                  {fmtKsh(shownPrice)}
                </div>
                <div className="text-center text-[8px] text-muted-foreground leading-none">{tr("/ month")}</div>

                <div className="my-1 border-t border-border/40" />

                <div className="text-center text-[8.5px] text-muted-foreground leading-tight truncate mb-1">
                  {tr(item.tagline)}
                </div>

                {/* Features Bullets */}
                <ul className="flex-1 min-h-0 overflow-y-auto space-y-0.5 text-[8.5px] leading-tight text-foreground/90 pr-0.5">
                  {item.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1">
                      <span className={cn("shrink-0 font-bold", itemTone.text)}>•</span>
                      <span className="truncate">{tr(feature)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Individual Blue Continue Button with Arrow */}
              <ShopButton
                type="button"
                className="mt-1.5 w-full flex items-center justify-center gap-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-semibold py-1.5 px-0.5 text-[9px] shadow-sm transition-all"
                onClick={() => handleSelectPlan(item.id)}
              >
                <span>{tr("Continue with {x}", item.name)}</span>
                <ArrowRight className="h-2.5 w-2.5 shrink-0" />
              </ShopButton>
            </div>
          );
        })}
      </div>

      {/* Bottom Trial Action */}
      <footer className="shrink-0 pt-1 text-center">
        <ShopButton
          variant="success"
          className="w-full max-w-sm mx-auto flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-3 text-[11px] font-bold shadow-md"
          onClick={startTrial}
        >
          <span>{tr("Get Started with Your 30-Day Free Trial")}</span>
          <ArrowRight className="h-3 w-3" />
        </ShopButton>
        <p className="mt-0.5 text-center text-[8.5px] text-muted-foreground leading-none">
          {tr("No payment required • Cancel anytime")}
        </p>
      </footer>
    </main>
  );
}
