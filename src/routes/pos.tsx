import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useErp } from "@/components/shopbook/product-search";
import { AppShell, Cash, SalesList, SalesReport, Sell, moneyFor, useAccount, type SCtx } from "@/components/shopbook/selling";
import { useLanguage } from "@/hooks/use-language";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "POS — SHOPBOOK ERP" },
      { name: "description", content: "Fast point of sale: scan, cart, payment, receipt and cash-up." },
      { property: "og:title", content: "POS — SHOPBOOK ERP" },
      { property: "og:description", content: "Sell fast with search, scan, split payments, part payments and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pos,
});

const TABS = ["Sell", "Transactions", "Cash", "Reports"];

function Pos() {
  const acct = useAccount("basic");
  const { tr } = useLanguage();
  const s = useErp();
  const [tab, setTab] = useState(TABS[0] ?? "Sell");
  if (!acct) return <main className="app-screen" />;
  const ctx: SCtx = { s, money: moneyFor(acct.currency || "KSh"), tr, shop: acct.shopName, channel: "POS" };
  return (
    <AppShell title="POS" tabs={TABS} tab={tab} setTab={setTab}>
      {tab === "Sell" && <Sell {...ctx} />}
      {tab === "Transactions" && <SalesList {...ctx} onlyChannel="POS" />}
      {tab === "Cash" && <Cash {...ctx} />}
      {tab === "Reports" && <SalesReport {...ctx} onlyChannel="POS" />}
    </AppShell>
  );
}
