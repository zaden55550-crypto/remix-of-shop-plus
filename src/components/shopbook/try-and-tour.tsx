// Ways to win a new owner over (owner, 2026-11-23): Try a sample shop (Log In), the sample-shop bar while inside it, English /
// Kiswahili on the first screen, a 30-second sale tour (Plans) and real customer words (shown only once some exist).
import { useEffect, useRef, useState } from "react";

import { CheckCircle2, Printer, ShoppingCart, Smartphone, Store, LogOut } from "lucide-react";
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
const unpush = () => document.querySelectorAll<HTMLElement>(".is-after-sample").forEach((e) => { e.style.paddingLeft = ""; e.classList.remove("is-after-sample"); });

export function SampleShopBar() {
  const { tr } = useLanguage();
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = () => setOn(inSampleShop() && store.signedIn());
    f(); window.addEventListener("shopbook-session", f); window.addEventListener("storage", f);
    return () => { window.removeEventListener("shopbook-session", f); window.removeEventListener("storage", f); };
  }, []);
  // Floating like ShopBot (owner, 2026-11-26): the whole bar is carried by finger or mouse (its buttons still work). Its home is the middle
  // of the free-trial strip where a page has one (the shop name in the header is never covered), otherwise the top bar just after the
  // status, with the shop name pushed after it; it goes home when another page opens.
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  // Pushed mostly off the screen it tucks away behind the edge; a small arrow there brings it back (owner, 2026-11-26).
  const [tucked, setTucked] = useState<null | { side: "left" | "right" | "top" | "bottom"; at: number }>(null);
  const [home, setHome] = useState<{ x: number; y: number } | null>(null);
  const [onStrip, setOnStrip] = useState(false);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!on) return;
    const place = () => {
      const bar = barRef.current;
      const strip = document.querySelector<HTMLElement>(".dash-strip");
      const anchor = document.querySelector(".dash-header-left, .apps-header-side");
      setOnStrip(!!strip);
      unpush();
      if (!bar || (!strip && !anchor)) { setHome(null); return; }
      const b = bar.getBoundingClientRect();
      if (strip) {
        // In the gap between Days left and Explore plans, so neither is covered.
        const r = strip.getBoundingClientRect(), first = strip.querySelector(".trial-banner.is-dashboard .trial-banner-text, .trial-banner-days")?.getBoundingClientRect(), last = strip.querySelector(".trial-banner-upgrade")?.getBoundingClientRect();
        // A narrow phone has no room between them: the bar covers the whole strip there.
        const wide = window.innerWidth >= 600, from = wide && first ? first.right : r.left, to = wide && last ? last.left : r.right;
        setHome({ x: Math.max(4, (from + to) / 2 - b.width / 2), y: Math.max(4, r.top + r.height / 2 - b.height / 2) });
        return;
      }
      const r = anchor!.getBoundingClientRect(), x = Math.max(4, Math.min(r.right + 10, window.innerWidth - b.width - 4));
      setHome({ x, y: Math.max(4, r.top + r.height / 2 - b.height / 2) });
      // The shop name starts after the bar, so part of it still shows on the right. The header may be zoomed: work in its own pixels.
      const title = document.querySelector<HTMLElement>(".dash-header-title, .apps-shop");
      if (title) { const t = title.getBoundingClientRect(), k = t.width / (title.offsetWidth || 1) || 1; title.style.paddingLeft = `${Math.max(0, (x + b.width + 10 - t.left) / k)}px`; title.classList.add("is-after-sample"); }
    };
    const goHome = () => { setPos(null); setTucked(null); window.setTimeout(place, 60); };
    place(); const t = window.setTimeout(place, 600);
    window.addEventListener("resize", place); window.addEventListener("dq-floating-home", goHome);
    return () => { unpush(); window.clearTimeout(t); window.removeEventListener("resize", place); window.removeEventListener("dq-floating-home", goHome); };
  }, [on]);
  const grab = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button")) return;
    const bar = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - bar.left, dy: e.clientY - bar.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current; if (!d) return;
    const bar = e.currentTarget.getBoundingClientRect(); d.moved = true;
    setPos({ x: Math.min(Math.max(-bar.width + 30, e.clientX - d.dx), window.innerWidth - 30), y: Math.min(Math.max(-bar.height + 12, e.clientY - d.dy), window.innerHeight - 12) });
  };
  const drop = () => {
    const d = drag.current; drag.current = null;
    const bar = barRef.current?.getBoundingClientRect();
    if (!d?.moved || !bar) return;
    const shown = (Math.min(bar.right, window.innerWidth) - Math.max(bar.left, 0)) * (Math.min(bar.bottom, window.innerHeight) - Math.max(bar.top, 0)) / (bar.width * bar.height);
    if (shown > 0.55) return;
    const side = bar.left < 0 && -bar.left >= bar.width / 3 ? "left" : bar.right > window.innerWidth && bar.right - window.innerWidth >= bar.width / 3 ? "right" : bar.top < 0 ? "top" : "bottom";
    setTucked({ side, at: side === "left" || side === "right" ? Math.min(Math.max(8, bar.top + bar.height / 2), window.innerHeight - 40) : Math.min(Math.max(8, bar.left + bar.width / 2), window.innerWidth - 40) });
  };
  // The bar is smaller on the strip: measure its home again once it has its strip size.
  useEffect(() => { if (on) window.dispatchEvent(new Event("resize")); }, [on, onStrip]);
  // Moved or tucked away, the shop name gets its whole space back.
  useEffect(() => { if (pos || tucked) unpush(); }, [pos, tucked]);
  const bringBack = () => { setTucked(null); setPos(null); window.dispatchEvent(new Event("resize")); };
  const at = pos ?? home;
  useEffect(() => { document.documentElement.classList.toggle("in-sample", on); return () => document.documentElement.classList.remove("in-sample"); }, [on]);
  if (!on) return null;
  const leave = (to: "/" | "/signup") => { leaveSampleShop(); setOn(false); window.location.replace(to); };
  if (tucked) {
    const Arrow = tucked.side === "left" ? "›" : tucked.side === "right" ? "‹" : tucked.side === "top" ? "⌄" : "⌃";
    const style = tucked.side === "left" ? { left: 0, top: tucked.at } : tucked.side === "right" ? { right: 0, top: tucked.at } : tucked.side === "top" ? { top: 0, left: tucked.at } : { bottom: 0, left: tucked.at };
    return <button type="button" className={`sample-tab is-${tucked.side}`} style={style} onClick={bringBack} title={tr("Show the sample shop bar")} aria-label={tr("Show the sample shop bar")}>{Arrow}</button>;
  }
  return <div ref={barRef} className={cn("sample-bar", at && "is-moved", onStrip && !pos && "is-on-strip")} role="status" title={tr("Drag to move")} data-short={tr("Sample shop")} style={at ? { left: at.x, top: at.y, right: "auto", bottom: "auto", transform: "none" } : undefined}
    onPointerDown={grab} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop}>
    <span className="sample-grip"><Store aria-hidden /></span><span><b>{tr("Sample shop")}</b> · {tr("Nothing here is real")}</span>
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

