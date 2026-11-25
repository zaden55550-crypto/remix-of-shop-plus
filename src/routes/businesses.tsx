// The owner's businesses: see each one's identity, industry, type and locations, open one, or create another under the
// same account (no new registration or sign-in). This is a business selector, not a company-level workspace: every
// business opens into its own Apps launcher and records.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Check, LayoutGrid, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";
import { GlobalApplicationHeader } from "@/components/shopbook/global-application-header";
import { GlassPage } from "@/components/shopbook/glass-page";
import { BusinessForm } from "@/components/shopbook/business-form";
import { ShopButton } from "@/components/ui/shop-button";
import { useAccount } from "@/components/shopbook/selling";
import { useErp } from "@/components/shopbook/product-search";
import { businessSummaries, createBusiness, openBusiness, type BusinessSummary } from "@/lib/businesses";
import { locationUsage } from "@/lib/locations";
import { canRecord } from "@/lib/shopbook";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/businesses")({
  head: () => ({ meta: [{ title: "Businesses — DataQuill Solutions" }, { name: "description", content: "Open, switch between and create your businesses on DataQuill Solutions." }] }),
  component: BusinessesPage,
});

const initials = (name: string) => name.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "B";

function BusinessRow({ x, onOpen, tr }: { x: BusinessSummary; onOpen: () => void; tr: (t: string) => string }) {
  const b = x.business;
  return (
    <li className={cn("biz-row glass-card flex items-center gap-3 rounded-2xl p-3 sm:gap-4 sm:p-4", x.active && "ring-2 ring-emerald-500/70")} data-business={b.id}>
      <div aria-hidden="true" className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-base font-black text-emerald-500">{initials(b.name)}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-bold text-foreground">{b.name}</h2>
          {x.active && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-500"><Check className="h-3 w-3" />{tr("Working in")}</span>}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {x.industry ? tr(x.industry) : tr("Industry not set")}{x.businessType ? ` · ${tr(x.businessType)}` : ""}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {x.locations.length ? x.locations.map((l) => l.name).join(" · ") : tr("No locations yet")}
          </span>
          <span className="shrink-0">· {b.currency}</span>
        </p>
      </div>
      <ShopButton variant={x.active ? "ghost" : "success"} className="w-auto shrink-0 px-4" onClick={onOpen} aria-label={`${tr("Open")} ${b.name}`}>
        {x.active ? <><LayoutGrid className="h-4 w-4" />{tr("Apps")}</> : tr("Open")}
      </ShopButton>
    </li>
  );
}

function BusinessesPage() {
  const acct = useAccount("basic");
  const nav = useNavigate();
  const { tr, dir } = useLanguage();
  const s = useErp();
  const [creating, setCreating] = useState(false);
  // An employee's login belongs to one business, decided on the server; there is nothing to choose here.
  useEffect(() => { if (acct?.staff) void nav({ to: "/apps", replace: true }); }, [acct, nav]);
  if (!acct || acct.staff) return <main className="app-screen" />;

  const rows = businessSummaries(s);
  const usage = locationUsage(s);
  const current = rows.find((x) => x.active) ?? rows[0]!;
  const open = (x: BusinessSummary) => {
    try { openBusiness(s, x.business.id); void nav({ to: "/apps" }); } catch (e) { toast.error(tr((e as Error).message)); }
  };

  return (
    <main dir={dir} className="shop-app inventory-screen businesses-screen flex w-full flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <GlobalApplicationHeader title={tr("Businesses")} shop={current.business.name} moduleFirst />
      </header>
      <section className="inventory-content mx-auto w-full max-w-3xl flex-1 space-y-4 p-3 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-black text-foreground"><Building2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />{tr("Your businesses")}</h1>
            <p className="text-xs text-muted-foreground">{tr("Locations used")}: {usage.active} / {usage.max} · {tr("Shared by all your businesses")}</p>
          </div>
          <ShopButton variant="success" className="w-auto shrink-0 px-4" disabled={!canRecord(acct)} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />{tr("Create business")}
          </ShopButton>
        </div>
        <ul className="space-y-3" aria-label={tr("Your businesses")}>
          {rows.map((x) => <BusinessRow key={x.business.id} x={x} tr={tr} onOpen={() => open(x)} />)}
        </ul>
      </section>
      {creating && (
        <GlassPage label={tr("Create business")} onClose={() => setCreating(false)}>
          <h2 className="mb-3 text-lg font-black text-foreground">{tr("Create business")}</h2>
          <BusinessForm
            withLocation
            usage={usage}
            taken={rows.map((x) => x.business.name)}
            submitLabel={tr("Create business")}
            initial={{ name: "", industryFamilyId: "", businessType: "", phone: "", email: "", country: acct.country ?? "", currency: acct.currency ?? "" }}
            onCancel={() => setCreating(false)}
            onSubmit={({ details, location }) => {
              try {
                const b = createBusiness(details, location);
                setCreating(false);
                toast.success(`${tr("Business created")}: ${b.name}`);
              } catch (e) { toast.error(tr((e as Error).message)); }
            }}
          />
        </GlassPage>
      )}
    </main>
  );
}
