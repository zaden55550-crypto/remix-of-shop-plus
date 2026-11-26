// One page on every screen (owner, 2026-11-26): the Dashboard's text size (--d-fs, which every size on the page follows) is set to
// the largest value at which the whole page fits the screen with no scrolling, never above the size its CSS gives for that
// screen and never below `min`. The transactions list takes the height left and scrolls inside its own box. A screen too
// short even at `min` (a phone held sideways) gets `data-scroll` and its content scrolls instead. Display only.
import { useEffect, useLayoutEffect, type RefObject } from "react";

const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function useFitFont(ref: RefObject<HTMLElement | null>, o: { scroller: string; min?: number }) {
  useBeforePaint(() => {
    let frame = 0, busy = false;
    const fits = (root: HTMLElement) => {
      const area = root.querySelector<HTMLElement>(o.scroller);
      return !area || area.scrollHeight <= area.clientHeight + 1;
    };
    const fit = () => {
      frame = 0;
      const root = ref.current;
      if (!root || busy) return;
      busy = true;
      try {
        root.style.removeProperty("--d-fs");
        root.removeAttribute("data-scroll");
        const cap = parseFloat(getComputedStyle(root).fontSize) || 14;
        if (fits(root)) return;
        const min = o.min ?? 9;
        const set = (px: number) => root.style.setProperty("--d-fs", `${px.toFixed(2)}px`);
        set(min);
        if (!fits(root)) { root.style.removeProperty("--d-fs"); root.setAttribute("data-scroll", ""); return; }
        let lo = min, hi = cap;
        for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; set(mid); if (fits(root)) lo = mid; else hi = mid; }
        set(lo);
      } finally {
        root.setAttribute("data-fitted", "");
        requestAnimationFrame(() => { busy = false; });
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(fit); };
    fit();
    window.addEventListener("resize", schedule);
    window.addEventListener("shopbook-prefs", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    const late = window.setTimeout(schedule, 600), later = window.setTimeout(schedule, 1800);
    // New records, a tab, Show More/Less or a language change refit; the page's own size change does not (attributes aren't watched).
    const changes = new MutationObserver(schedule);
    let waiting = 0;
    const watch = () => { if (!ref.current) return false; changes.observe(ref.current, { childList: true, subtree: true, characterData: true }); schedule(); return true; };
    if (!watch()) waiting = window.setInterval(() => { if (watch()) window.clearInterval(waiting); }, 100);
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("shopbook-prefs", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.clearTimeout(late); window.clearTimeout(later); window.clearInterval(waiting);
      changes.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current]);
}
