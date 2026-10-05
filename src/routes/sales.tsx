import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useErp } from "@/components/shopbook/product-search";
import { AppShell, Customers, PaymentsList, ReturnsList, SalesList, SalesOverview, SalesReport, Sell, moneyFor, useAccount, type SCtx } from "@/components/shopbook/selling";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/sales")({
  head: () => ({
    meta: [
      { title: "Sales — SHOPBOOK ERP" },
      { name: "description", content: "Billing, sales history, customers, payments, returns and sales reports." },
      { property: "og:title", content: "Sales — SHOPBOOK ERP" },
      { property: "og:description", content: "Every sale, customer balance, payment and return in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Sales,
});

const TABS = ["Overview", "Billing", "Sales", "Customers", "Payments", "Returns", "Reports"];

function Sales() {
  const acct = useAccount("basic");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState(TABS[0] ?? "Overview");
  if (!acct) return <main className="app-screen" />;
  const ctx: SCtx = { s, money: moneyFor(acct.currency || "KSh"), tr, shop: acct.shopName, channel: "Sales" };
  return (
    <AppShell title="Sales" tabs={TABS} tab={tab} setTab={setTab}>
      {tab === "Overview" && <SalesOverview {...ctx} />}
      {tab === "Billing" && <Sell {...ctx} />}
      {tab === "Sales" && <SalesList {...ctx} />}
      {tab === "Customers" && <Customers {...ctx} />}
      {tab === "Payments" && <PaymentsList {...ctx} />}
      {tab === "Returns" && <ReturnsList {...ctx} />}
      {tab === "Reports" && <SalesReport {...ctx} />}
    </AppShell>
  );
}
