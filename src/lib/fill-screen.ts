// Full-screen fit: from 600px wide an app screen is exactly one viewport tall and fills the whole width.
// When its content would not fit, the screen's zoom is lowered (through `--fit-zoom`) to the largest value at
// which everything fits — panels show in full and charts keep a usable height. If even the smallest
// readable zoom cannot fit (long lists), the screen keeps its normal size and its content area scrolls inside
// itself. Phones keep their own layout but still fill the page (fillSpare). Refits on resize and whenever the screen's content changes (tabs,
// data, language). Purely visual: nothing about the data changes.
import { useEffect, useLayoutEffect, type RefObject } from "react";

// Runs before the screen is painted, so its first frame is already fitted. (The server has no layout to fit.)
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

const MIN_WIDTH = 600;
/** How much a phone app screen may grow to fill the screen. */
const PHONE_GROW = 1.45;

export type ScreenFit = {
  /** Lowest zoom allowed before giving up and scrolling inside (Dashboard 0.55, apps 0.7). */
  min?: number;
  /** Elements that must show their whole content (no hidden overflow). */
  panels?: string;
  /** Charts that must keep at least `chartHeight` px. */
  charts?: string;
  chartHeight?: number;
  /** Scrolling content area that must not need to scroll. */
  scroller?: string;
};

function fits(root: HTMLElement, o: ScreenFit) {
  // No tolerance here: a single pixel over would show a scrollbar.
  if (o.scroller) for (const el of root.querySelectorAll<HTMLElement>(o.scroller)) if (el.scrollHeight > el.clientHeight) return false;
  if (o.panels) for (const el of root.querySelectorAll<HTMLElement>(o.panels)) if (el.scrollHeight > el.clientHeight + 2) return false;
  if (o.charts) for (const el of root.querySelectorAll<HTMLElement>(o.charts)) if (el.getBoundingClientRect().height < (o.chartHeight ?? 70)) return false;
  return true;
}

const CARDS = ".dash-panel, .inventory-box, .glass-section, .shop-chart-section";

function clearFill(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>("[data-filled]")) {
    el.style.removeProperty("min-height");
    el.removeAttribute("data-filled");
  }
}

/** On every screen size a page shorter than the screen hands its spare height to its charts, or else its last row of
 *  cards, so the page always reaches the bottom. A page longer than the screen is left alone. */
function fillSpare(root: HTMLElement, o: ScreenFit) {
  const area = o.scroller ? root.querySelector<HTMLElement>(o.scroller) : null;
  if (!area) return;
  const cards = [...area.querySelectorAll<HTMLElement>(CARDS)].filter((el) => el.offsetParent && !el.parentElement?.closest(CARDS));
  if (!cards.length) return;
  const bottom = (el: Element) => el.getBoundingClientRect().bottom;
  const last = cards.reduce((a, b) => (bottom(b) > bottom(a) ? b : a));
  // Anything after the last card (a row of buttons, a note) stays below it.
  let end = bottom(last);
  for (let n: Element | null = last; n && n !== area; n = n.parentElement)
    for (let sib = n.nextElementSibling; sib; sib = sib.nextElementSibling)
      if ((sib as HTMLElement).offsetParent) end = Math.max(end, bottom(sib));
  const box = area.getBoundingClientRect();
  const k = box.height / (area.offsetHeight || 1);
  // On phones the area may not have stretched yet (browsers differ on viewport units): measure against the real screen.
  const floor = window.innerWidth < MIN_WIDTH ? Math.max(box.bottom, window.innerHeight) : box.bottom;
  const spare = Math.floor(floor - parseFloat(getComputedStyle(area).paddingBottom) * k - end) - 1;
  if (spare < 4) return;
  const charts = cards.filter((el) => el.matches(".shop-chart-section"));
  const targets = charts.length ? charts : cards.filter((el) => bottom(el) > bottom(last) - 2);
  const rows = new Set(targets.map((el) => Math.round(el.getBoundingClientRect().top))).size;
  const page = document.documentElement;
  const overflow = () => Math.max(area.scrollHeight - area.clientHeight, page.scrollHeight - page.clientHeight);
  const before = overflow();
  const sized = targets.map((el) => {
    const h = el.getBoundingClientRect().height;
    const height = (h + spare / rows) / (h / (el.offsetHeight || 1));
    el.style.minHeight = `${height}px`;
    el.setAttribute("data-filled", "");
    return { el, height };
  });
  // Margins and wrappers can take part of the spare height: give back whatever would now overflow.
  const over = overflow() - before;
  if (over > 0) for (const { el, height } of sized) el.style.minHeight = `${height - Math.ceil(over / rows) - 2}px`;
}

/** Keeps `ref`'s screen filling the viewport with nothing cut off. */
export function useScreenFit(ref: RefObject<HTMLElement | null>, o: ScreenFit) {
  useBeforePaint(() => {
    let frame = 0;
    let busy = false;
    let again = false;
    const set = (root: HTMLElement, z: number) => root.style.setProperty("--fit-zoom", String(+z.toFixed(3)));
    const fit = () => {
      frame = 0;
      const root = ref.current;
      if (!root) return;
      busy = true;
      clearFill(root);
      try {
        set(root, 1);
        if (window.innerWidth < MIN_WIDTH) return;
        if (fits(root, o)) {
          // Phones (laptop view, owner 2026-11-27): a screen with room to spare grows until it fills the phone, like the Dashboard.
          const html = document.documentElement;
          if (!html.classList.contains("phone-device") || !html.classList.contains("laptop-view")) return;
          let lo = 1, hi = PHONE_GROW;
          set(root, hi);
          if (fits(root, o)) return;
          for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; set(root, mid); if (fits(root, o)) lo = mid; else hi = mid; }
          set(root, Math.max(1, lo - 0.01));
          return;
        }
        // Largest zoom at which everything fits; each step is measured before the next paint.
        let lo = o.min ?? 0.7, hi = 1;
        set(root, lo);
        if (!fits(root, o)) { set(root, 1); return; } // too long to fit readably: normal size, scroll inside
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          set(root, mid);
          if (fits(root, o)) lo = mid; else hi = mid;
        }
        // Just under the limit: scroll sizes round away a fraction of a pixel that still draws a scrollbar.
        set(root, Math.max(o.min ?? 0.7, lo - 0.01));
      } finally {
        fillSpare(root, o);
        root.setAttribute("data-fitted", "");
        // Changes during the fit run again in this frame, so the screen is never painted unfitted.
        requestAnimationFrame(() => { busy = false; if (again) { again = false; fit(); } });
      }
    };
    const schedule = () => { if (!frame && !busy) frame = requestAnimationFrame(fit); };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("shopbook-prefs", schedule); // Interface Size and Text Size
    window.visualViewport?.addEventListener("resize", schedule);
    const late = window.setTimeout(schedule, 600); // fonts and charts settle after the first paint
    const later = window.setTimeout(schedule, 1800); // slower phones
    // Text fitting and charts finish after a change, so the fit runs once more when the screen has settled.
    let settle = 0;
    const changes = new MutationObserver(() => {
      // New content is fitted right after it is written and before it is painted, so panels never jump a moment later.
      if (busy) again = true;
      else { if (frame) cancelAnimationFrame(frame); fit(); }
      window.clearTimeout(settle);
      settle = window.setTimeout(schedule, 500);
    });
    // A screen that waits for its account draws its real root a moment after this runs, so keep looking for it.
    const watch = () => { if (!ref.current) return false; changes.observe(ref.current, { childList: true, subtree: true, characterData: true }); if (frame) cancelAnimationFrame(frame); frame = 0; fit(); return true; };
    let waiting = 0;
    if (!watch()) waiting = window.setInterval(() => { if (watch()) window.clearInterval(waiting); }, 100);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("shopbook-prefs", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.clearTimeout(late);
      window.clearTimeout(later);
      window.clearTimeout(settle);
      window.clearInterval(waiting);
      changes.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
    // The options are fixed per screen; refits come from the observers above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current]);
}
