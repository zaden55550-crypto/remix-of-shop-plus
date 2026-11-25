// Ways to win a new owner over (owner, 2026-11-23): Try a sample shop (Log In), the sample-shop bar while inside it, English /
// Kiswahili on the first screen, a 30-second sale tour (Plans) and real customer words (shown only once some exist).
import { useEffect, useState } from "react";

import { CheckCircle2, Printer, RotateCw, ShoppingCart, Smartphone, Store, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/hooks/use-language";
import { inSampleShop, leaveSampleShop, sampleBlocked, startSampleShop } from "@/lib/sample-shop";
import { store } from "@/lib/shopbook";
import { TESTIMONIALS } from "@/lib/testimonials";
import { cn } from "@/lib/utils";

/** Log In: open the sample shop without signing up. */
export function SampleShopButton() {
  const { tr } = useLanguage();
  const open = () => {
    // A full reload so nothing of the device's own business (such as its online sign-in) stays in memory during the sample.
    try { startSampleShop(); window.location.assign("/dashboard"); }
    catch (e) { toast.error(tr(e instanceof Error ? e.message : "The sample shop can't open here")); }
  };
  return <button type="button" className="sample-shop-btn" onClick={open} title={tr(sampleBlocked() ?? "A full sample shop with products and sales. Nothing you do there is real.")}>
    <Store aria-hidden /> <span><b>{tr("Try a sample shop")}</b><small>{tr("No sign-up · tap around every app")}</small></span>
  </button>;
}

/** Shown on every page while inside the sample shop. */
export function SampleShopBar() {
  const { tr } = useLanguage();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(inSampleShop() && store.signedIn());
    f(); window.addEventListener("shopbook-session", f); window.addEventListener("storage", f);
    return () => { window.removeEventListener("shopbook-session", f); window.removeEventListener("storage", f); };
  }, []);
  if (!on) return null;
  const leave = (to: "/" | "/signup") => { leaveSampleShop(); setOn(false); window.location.replace(to); };
  return <div className="sample-bar" role="status" data-short={tr("Sample shop")}>
    <Store aria-hidden /><span><b>{tr("Sample shop")}</b> · {tr("Nothing here is real")}</span>
    <button type="button" className="is-go" onClick={() => leave("/signup")}>{tr("Create my business")}</button>
    <button type="button" className="is-leave" onClick={() => leave("/")} title={tr("Leave the sample shop")}><LogOut aria-hidden /> {tr("Exit")}</button>
  </div>;
}

/** English / Kiswahili on the first screen; every other language stays in the language menu. */
export function LangQuick() {
  const { language, setLanguage } = useLanguage();
  return <div className="lang-quick" role="group" aria-label="Language / Lugha" translate="no">
    {(["English", "Swahili"] as const).map((l) => <button key={l} type="button" aria-pressed={language === l} className={cn(language === l && "is-on")} onClick={() => setLanguage(l)}>{l === "Swahili" ? "Kiswahili" : "English"}</button>)}
  </div>;
}

const FRAMES = [
  { icon: ShoppingCart, title: "Tap what the customer buys", text: "Sugar 2 kg, Bread, Milk 500 ml go into the cart. Prices come from your shop." },
  { icon: Smartphone, title: "Customer pays by M-Pesa", text: "A payment prompt goes to the customer's phone. They enter their PIN." },
  { icon: CheckCircle2, title: "Paid, confirmed", text: "The sale is marked paid, stock goes down and the money shows in M-Pesa." },
  { icon: Printer, title: "Receipt printed or sent", text: "Print it, or send it by WhatsApp or SMS. Today's totals update on the Dashboard." },
] as const;
const CART = [["Sugar 2 kg", 360], ["Bread", 65], ["Milk 500 ml", 60]] as const;

/** A 30-second animated sale: four scenes of about 7 seconds each, looping; tap a step to jump to it. */
export function SaleTour() {
  const { tr } = useLanguage();
  const [i, setI] = useState(0);
  useEffect(() => { const t = window.setTimeout(() => setI((i + 1) % FRAMES.length), 7500); return () => window.clearTimeout(t); }, [i]);
  const total = CART.reduce((a, [, p]) => a + p, 0);
  return <div className="sale-tour">
    <ol className="sale-tour-steps">{FRAMES.map((f, k) => <li key={k}><button type="button" className={cn(k === i && "is-on", k < i && "is-done")} onClick={() => setI(k)}><f.icon aria-hidden /> <span>{tr(f.title)}</span></button></li>)}</ol>
    <div className="sale-tour-stage" key={i}>
      <div className="sale-tour-screen">
        {i === 0 && <ul className="sale-tour-cart">{CART.map(([n, p], k) => <li key={n} style={{ animationDelay: `${0.6 + k * 1.2}s` }}><span>{n}</span><b>KSh {p}</b></li>)}<li className="is-total" style={{ animationDelay: "4.4s" }}><span>{tr("Total")}</span><b>KSh {total}</b></li></ul>}
        {i === 1 && <div className="sale-tour-phone"><div className="sale-tour-prompt"><b>M-PESA</b><p>{tr("Pay")} KSh {total} · Mama Njeri Shop</p><span className="sale-tour-pin">● ● ● ●</span><em>{tr("Send")}</em></div></div>}
        {i === 2 && <div className="sale-tour-paid"><CheckCircle2 aria-hidden /><b>{tr("Paid")} · KSh {total}</b><small>M-Pesa · QJK7X2LM9P</small><span>{tr("Stock")}: Sugar 2 kg 24 → 23</span></div>}
        {i === 3 && <div className="sale-tour-receipt"><b>Mama Njeri Shop</b>{CART.map(([n, p]) => <p key={n}><span>{n}</span><span>{p}</span></p>)}<p className="is-total"><span>{tr("Total")}</span><span>KSh {total}</span></p><small>{tr("Paid by")} M-Pesa · {tr("Thank you!")}</small></div>}
      </div>
      <div className="sale-tour-text"><h4>{i + 1}. {tr(FRAMES[i]!.title)}</h4><p>{tr(FRAMES[i]!.text)}</p></div>
    </div>
    <div className="sale-tour-bar"><span style={{ width: `${((i + 1) / FRAMES.length) * 100}%` }} /></div>
  </div>;
}

/** Real customers' words; renders nothing until TESTIMONIALS has entries. */
export function Testimonials() {
  if (!TESTIMONIALS.length) return null;
  return <section className="testimonials" aria-label="What shop owners say">
    {TESTIMONIALS.slice(0, 3).map((t) => <figure key={t.name + t.business}>
      {t.photo && <img src={t.photo} alt="" loading="lazy" />}
      <blockquote>“{t.quote}”</blockquote>
      <figcaption><b>{t.name}</b> · {t.business}, {t.town}</figcaption>
    </figure>)}
  </section>;
}

/** A phone held upright shows the laptop view very small: once per device, suggest turning it sideways. */
export function RotateHint() {
  const { tr, language } = useLanguage();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => {
      let seen = false; try { seen = localStorage.getItem("shopbook.rotateHint") === "1"; } catch { /* show */ }
      const phone = Math.min(window.screen.width, window.screen.height) < 600, upright = window.matchMedia("(orientation: portrait)").matches;
      // Business Setup shows its own tip (one-page-fit.tsx).
      setOn(!seen && phone && upright && window.location.pathname !== "/setup" && document.documentElement.classList.contains("laptop-view"));
    };
    const t = window.setTimeout(f, 800); window.addEventListener("orientationchange", f); window.addEventListener("resize", f);
    return () => { window.clearTimeout(t); window.removeEventListener("orientationchange", f); window.removeEventListener("resize", f); };
  }, []);
  if (!on) return null;
  const close = () => { try { localStorage.setItem("shopbook.rotateHint", "1"); } catch { /* this visit only */ } setOn(false); };
  return <div className="rotate-hint" role="status"><RotateCw aria-hidden /><span>{tr("Turn your phone sideways for a bigger view")}{language !== "Swahili" && <small lang="sw">Geuza simu yako ilale upande</small>}</span><button type="button" onClick={close}>{tr("Got it")}</button></div>;
}
