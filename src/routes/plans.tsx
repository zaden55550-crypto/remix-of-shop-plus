import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Check, ChevronLeft, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Field, Wordmark } from "@/components/shopbook/ui";
import { ShopButton } from "@/components/ui/shop-button";
import { PLANS, fmtKsh, store, type PlanId } from "@/lib/shopbook";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Choose Your Plan — SHOPBOOK ERP" },
      { name: "description", content: "Compare Basic, Plus and Business SHOPBOOK plans, or start a free 30-day full ERP trial." },
      { property: "og:title", content: "Choose Your Plan — SHOPBOOK ERP" },
      { property: "og:description", content: "Compare SHOPBOOK plans or start a free 30-day trial." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Plans,
});

const tone: Record<PlanId, { border: string; text: string; surface: string; badge: string }> = {
  basic: {
    border: "border-plan-basic",
    text: "text-plan-basic",
    surface: "bg-plan-basic/8",
    badge: "bg-plan-basic text-plan-contrast",
  },
  plus: {
    border: "border-plan-plus",
    text: "text-plan-plus",
    surface: "bg-plan-plus/8",
    badge: "bg-plan-plus text-primary-foreground",
  },
  business: {
    border: "border-plan-business",
    text: "text-plan-business",
    surface: "bg-plan-business/8",
    badge: "bg-plan-business text-primary-foreground",
  },
};

function Plans() {
  const nav = useNavigate();
  const router = useRouter();
  const [yearly, setYearly] = useState(false);
  const [selected, setSelected] = useState<PlanId>("business");
  const [paying, setPaying] = useState(false);
  const [phone, setPhone] = useState("");
  const plan = useMemo(() => PLANS.find((item) => item.id === selected) ?? PLANS[0], [selected]);

  if (!plan) return null;

  const price = yearly ? plan.yearly : plan.monthly;
  const startTrial = () => {
    store.update({ plan: "trial", trialStart: Date.now() });
    nav({ to: "/opening" });
  };
  const requestPayment = () => {
    const cleaned = phone.replace(/\s+/g, "");
    if (!/^(?:\+?254|0)?[17]\d{8}$/.test(cleaned)) {
      toast.error("Enter a valid Kenyan M-Pesa phone number");
      return;
    }
    toast("Online payments are coming soon. Start the free trial for now — your data stays when you upgrade.");
  };

  if (paying) {
    return (
      <main className="app-screen px-5 pb-8 pt-4">
        <ShopButton variant="bare" onClick={() => setPaying(false)} aria-label="Back" className="mb-2 h-10 w-10 p-0">
          <ChevronLeft />
        </ShopButton>
        <Wordmark />
        <h1 className="mt-5 text-2xl font-bold">Pay with M-Pesa</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {plan.name} plan · {fmtKsh(price)} / month{yearly ? `, billed as ${fmtKsh(price * 12)} yearly` : ""}
        </p>
        <div className="mt-6 space-y-3">
          <Field icon={<Smartphone className="h-5 w-5" />} type="tel" inputMode="tel" placeholder="M-Pesa phone number" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <ShopButton variant="success" onClick={requestPayment}>Send payment request</ShopButton>
          <ShopButton variant="outline" onClick={startTrial}>Use the 30-day free trial instead</ShopButton>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Your plan is only activated after payment is confirmed.</p>
      </main>
    );
  }

  return (
    <main className="app-screen px-3 pb-7 pt-4">
      <div className="relative">
        <ShopButton variant="bare" onClick={() => router.history.back()} aria-label="Back" className="absolute left-0 top-[-0.45rem] h-10 w-10 p-0">
          <ChevronLeft />
        </ShopButton>
        <Wordmark />
      </div>

      <h1 className="mt-3 text-center text-[26px] font-bold leading-tight">Choose Your Plan</h1>
      <p className="mx-auto mt-1 max-w-xs text-center text-sm leading-snug text-muted-foreground">
        Unlock more features and grow your<br />business with SHOPBOOK
      </p>

      <div className="mx-auto mt-4 grid w-full max-w-[300px] grid-cols-2 rounded-full border border-border bg-card/60 p-1 text-[12px]">
        <ShopButton variant="bare" onClick={() => setYearly(false)} className={cn("h-8 rounded-full px-2 text-xs", !yearly ? "bg-success text-success-foreground plan-switch-glow" : "text-muted-foreground")}>
          Monthly
        </ShopButton>
        <ShopButton variant="bare" onClick={() => setYearly(true)} className={cn("h-8 rounded-full px-2 text-xs", yearly ? "bg-success text-success-foreground plan-switch-glow" : "text-muted-foreground")}>
          Yearly (Save 10%)
        </ShopButton>
      </div>

      <div className="mt-5 grid grid-cols-3 items-stretch gap-1.5">
        {PLANS.map((item) => {
          const active = selected === item.id;
          const itemTone = tone[item.id];
          const shownPrice = yearly ? item.yearly : item.monthly;
          return (
            <ShopButton
              key={item.id}
              variant="bare"
              onClick={() => setSelected(item.id)}
              aria-pressed={active}
              className={cn(
                "relative h-auto min-h-[350px] w-full flex-col items-stretch justify-start gap-0 rounded-lg border-2 px-2 py-3 text-left",
                itemTone.border,
                itemTone.surface,
                active && "plan-card-active",
              )}
            >
              {yearly && <span className={cn("absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[9px] font-extrabold", itemTone.badge)}>Save 10%</span>}
              {item.best && <span className="absolute -right-0.5 -top-3 whitespace-nowrap rounded-full bg-badge-gold px-2 py-0.5 text-[8px] font-extrabold text-plan-contrast">BEST OPTION</span>}
              <div className={cn("text-center text-[15px] font-extrabold uppercase", itemTone.text)}>{item.name}</div>
              <div className="mt-1 whitespace-nowrap text-center text-[17px] font-extrabold leading-none">{fmtKsh(shownPrice)}</div>
              <div className="mt-1 text-center text-[10px] font-medium">/ month</div>
              <div className={cn("mt-2 min-h-10 rounded-md border px-1 py-1.5 text-center text-[9px] leading-tight", itemTone.border)}>
                {yearly ? <><span className="block">Billed yearly</span><span>({fmtKsh(shownPrice * 12)} / year)</span></> : <span>{fmtKsh(item.yearly)} / month<br />(Billed yearly)</span>}
              </div>
              <p className="min-h-14 py-3 text-center text-[11px] font-medium leading-tight">{item.tagline}</p>
              <span className={cn("mb-2 h-px w-full", item.id === "basic" ? "bg-plan-basic" : item.id === "plus" ? "bg-plan-plus" : "bg-plan-business")} />
              {item.intro && <span className="mb-1 text-[9px] font-semibold leading-tight">{item.intro}</span>}
              <ul className="space-y-1 text-[9px] font-normal leading-tight">
                {item.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
              {active && <span className="absolute bottom-2 right-2 grid h-5 w-5 place-items-center rounded-full bg-success text-success-foreground"><Check className="h-3 w-3" /></span>}
            </ShopButton>
          );
        })}
      </div>

      <ShopButton className="mt-4" onClick={() => setPaying(true)}>
        Continue with {plan.name} Plan <ArrowRight className="h-4 w-4" />
      </ShopButton>

      <div className="my-3 flex items-center gap-3 text-xs font-semibold"><span className="h-px flex-1 bg-muted-foreground/60" />OR<span className="h-px flex-1 bg-muted-foreground/60" /></div>

      <ShopButton variant="success" onClick={startTrial}>
        Get Started with Your 30-Day Free Trial <ArrowRight className="h-4 w-4" />
      </ShopButton>
      <p className="mt-2 text-center text-[11px] text-muted-foreground">No payment required&nbsp;&nbsp; • &nbsp;&nbsp;Cancel anytime</p>
    </main>
  );
}