// The public one-page website (owner, 2026-11-23): what DataQuill Solutions does, the plans, Try a sample shop, and how to reach us.
// Share /welcome on WhatsApp status, Facebook or TikTok. It reads the real plans (PLANS) and the real support contacts (SUPPORT).
import { createFileRoute, Link } from "@tanstack/react-router";
import { BarChart3, Boxes, CloudOff, MessageCircle, Receipt, Smartphone, Store, Users } from "lucide-react";
import { toast } from "sonner";
import { BrandRing } from "@/components/shopbook/ui";
import { LangQuick, SaleTour, Testimonials } from "@/components/shopbook/try-and-tour";
import { useLanguage } from "@/hooks/use-language";
import { SUPPORT } from "@/lib/i18n";
import { startSampleShop } from "@/lib/sample-shop";
import { PLANS, planAllowanceLines } from "@/lib/shopbook";

export const Route = createFileRoute("/welcome")({
  head: () => ({ meta: [{ title: "DataQuill Solutions · Run your shop from your phone" }, { name: "description", content: "Sales, stock, M-Pesa, staff and accounts for shops in one app. Works offline. Try a sample shop free." }] }),
  component: Welcome,
});

const FEATURES = [
  { icon: Receipt, title: "Sell fast", text: "A quick till with barcodes, receipts by print, WhatsApp or SMS." },
  { icon: Smartphone, title: "M-Pesa built in", text: "Cash, M-Pesa and bank in one place; send the customer an M-Pesa prompt." },
  { icon: Boxes, title: "Know your stock", text: "Low stock alerts, stock counts by phone and what to order next." },
  { icon: CloudOff, title: "Works offline", text: "Keep selling without internet; it syncs when you are back online." },
  { icon: Users, title: "Staff you can trust", text: "Logins and PINs per person, and alerts for big discounts and short cash." },
  { icon: Store, title: "Many shops", text: "Shops and warehouses with their own stock, prices and tills." },
  { icon: BarChart3, title: "Reports that help", text: "Profit, sales by payment method and a daily summary to your WhatsApp." },
  { icon: MessageCircle, title: "Credit book", text: "See who owes you and send a polite reminder in one tap." },
] as const;

function Welcome() {
  const { tr } = useLanguage();
  const sample = () => { try { startSampleShop(); window.location.assign("/dashboard"); } catch (e) { toast.error(tr(e instanceof Error ? e.message : "The sample shop can't open here")); } };
  return <main className="welcome">
    <header className="welcome-top">
      <b className="welcome-brand">DATAQUILL SOLUTIONS</b>
      <span className="welcome-top-right"><LangQuick /><Link to="/" className="welcome-login">{tr("Log In")}</Link></span>
    </header>

    <section className="welcome-hero">
      <div>
        <h1>{tr("Run your whole shop from one app")}</h1>
        <p>{tr("Sales, stock, M-Pesa, staff and accounts together. Works on your phone, tablet or laptop, even without internet.")}</p>
        <div className="welcome-cta">
          <button type="button" className="welcome-btn is-try" onClick={sample}>{tr("Try a sample shop")}</button>
          <Link to="/signup" className="welcome-btn is-start">{tr("Start 30-day free trial")}</Link>
        </div>
        <small>{tr("No card needed · no automatic billing")}</small>
      </div>
      <div className="welcome-ring"><BrandRing size={240} /></div>
    </section>

    <section className="welcome-features" aria-label={tr("What it does")}>
      {FEATURES.map((f) => <article key={f.title}><f.icon aria-hidden /><h3>{tr(f.title)}</h3><p>{tr(f.text)}</p></article>)}
    </section>

    <section className="welcome-tour"><h2>{tr("See a sale in 30 seconds")}</h2><SaleTour /></section>

    <section className="welcome-plans" aria-label={tr("Plans")}>
      <h2>{tr("Simple plans")}</h2>
      <div>{PLANS.map((p) => <article key={p.id}><h3>{p.name}</h3><p className="welcome-price">${p.monthlyUsd}<small>{tr("/mo")}</small></p>{planAllowanceLines(p).map((l) => <p key={l}>{tr(l)}</p>)}</article>)}</div>
      <Link to="/signup" className="welcome-btn is-start">{tr("Start 30-day free trial")}</Link>
    </section>

    <Testimonials />

    <footer className="welcome-foot">
      <a href={`https://wa.me/${SUPPORT.whatsapp}`} target="_blank" rel="noreferrer" className="welcome-btn is-wa"><MessageCircle aria-hidden /> {tr("Chat with us on WhatsApp")}</a>
      <span>{SUPPORT.phone} · <a href={`mailto:${SUPPORT.email}`}>{SUPPORT.email}</a></span>
      <span><Link to="/terms">{tr("Terms & Conditions")}</Link> · <Link to="/privacy">{tr("Privacy Policy")}</Link></span>
    </footer>
  </main>;
}
