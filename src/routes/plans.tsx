import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
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
      { name: "description", content: "Basic, Plus or Business plans for your shop, or start a free 30-day full ERP trial." },
      { property: "og:title", content: "Choose Your Plan — SHOPBOOK ERP" },
      { property: "og:description", content: "Pick a SHOPBOOK plan or start a free 30-day trial." },
    ],
  }),
  component: Plans,
});

const tone: Record<PlanId, string> = {
  basic: "border-plan-basic text-plan-basic",
  plus: "border-plan-plus text-plan-plus",
  business: "border-plan-business text-plan-business",
};

function Plans() {
  const nav = useNavigate();
  const router = useRouter();
  const [yearly, setYearly] = useState(false);
  const [sel, setSel] = useState<PlanId>("business");
  const [paying, setPaying] = useState(false);
  const [phone, setPhone] = useState("");
  const plan = PLANS.find((p) => p.id === sel)!;
  const price = yearly ? plan.yearly : plan.monthly;

  const startTrial = () => { store.update({ plan: "trial", trialStart: Date.now() }); nav({ to: "/opening" }); };

  if (paying) {
    return (
      <main className="app-screen px-5 pb-8 pt-4">
        <button onClick={() => setPaying(false)} aria-label="Back" className="mb-2"><ChevronLeft /></button>
        <Wordmark />
        <h1 className="mt-4 text-2xl font-bold">Pay with M-Pesa</h1>
        <p className="text-sm text-muted-foreground">{plan.name} plan · {fmtKsh(price)} / month{yearly ? ", billed yearly" : ""}</p>
        <div className="mt-5 space-y-3">
          <Field icon={<Smartphone className="h-5 w-5" />} type="tel" placeholder="M-Pesa phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <ShopButton variant="success" onClick={() => toast("Online payments are coming soon. Start the free trial for now — your data stays when you upgrade.")}>
            Send payment request
          </ShopButton>
          <ShopButton variant="outline" onClick={startTrial}>Use the 30-day free trial instead</ShopButton>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Your plan is only activated after the payment is confirmed.</p>
      </main>
    );
  }

  return (
    <main className="app-screen px-4 pb-8 pt-4">
      <div className="relative">
        <button onClick={() => router.history.back()} aria-label="Back" className="absolute left-0 top-0"><ChevronLeft /></button>
        <Wordmark />
      </div>
      <h1 className="mt-3 text-center text-2xl font-bold">Choose Your Plan</h1>
      <p className="text-center text-sm text-muted-foreground">Unlock more features and grow your business with SHOPBOOK.</p>

      <div className="mx-auto mt-4 flex w-fit rounded-full border border-border bg-card/60 p-1 text-sm">
        {[false, true].map((y) => (
          <button key={String(y)} onClick={() => setYearly(y)}
            className={cn("rounded-full px-4 py-1.5 font-medium", yearly === y ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            {y ? "Yearly · Save 10%" : "Monthly"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {PLANS.map((p) => (
          <button key={p.id} onClick={() => setSel(p.id)}
            className={cn("relative rounded-xl border-2 bg-card/60 px-1.5 py-3 text-center transition",
              sel === p.id ? cn(tone[p.id], "glow") : "border-border")}>
            {p.best && <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-badge-gold px-2 py-0.5 text-[9px] font-bold text-foreground dark:text-background">BEST OPTION</span>}
            <div className={cn("text-sm font-extrabold uppercase", tone[p.id].split(" ")[1])}>{p.name}</div>
            <div className="mt-1 text-base font-bold text-foreground">{fmtKsh(yearly ? p.yearly : p.monthly)}</div>
            <div className="text-[11px] text-muted-foreground">/ month</div>
          </button>
        ))}
      </div>

      <section className={cn("mt-3 rounded-2xl border-2 bg-card/60 p-4", tone[sel].split(" ")[0])}>
        <div className={cn("text-lg font-extrabold uppercase", tone[sel].split(" ")[1])}>{plan.name} Plan</div>
        <div className="text-sm text-muted-foreground">{plan.tagline}</div>
        {plan.intro && <div className="mt-2 text-sm font-medium">{plan.intro}</div>}
        <ul className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[13px]">
          {plan.features.map((f) => (
            <li key={f} className="flex items-start gap-1.5"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />{f}</li>
          ))}
        </ul>
      </section>

      <ShopButton className="mt-4" onClick={() => setPaying(true)}>Continue with {plan.name} Plan <ArrowRight className="h-4 w-4" /></ShopButton>

      <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />OR<span className="h-px flex-1 bg-border" /></div>

      <div className="rounded-2xl border border-success/50 bg-success/10 p-3">
        <div className="text-center text-sm font-bold">30-Day Full ERP Trial</div>
        <div className="mb-2 text-center text-xs text-muted-foreground">All 13 apps unlocked</div>
        <ShopButton variant="success" onClick={startTrial}>Get Started with Your 30-Day Free Trial <ArrowRight className="h-4 w-4" /></ShopButton>
        <p className="mt-2 text-center text-xs text-muted-foreground">No payment required • Cancel anytime</p>
      </div>
    </main>
  );
}
