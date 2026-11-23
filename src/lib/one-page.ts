// One page, never scrolling (owner, 2026-11-23): Log In, Create Account, Plans and Business Setup, and every window opened on them,
// always fit the screen on phones, iPads and laptops. When their content is taller than the screen, the content is drawn smaller
// (CSS zoom on the scroller's children, everything together) until nothing scrolls. It never grows content past its normal size
// and never goes below MIN_SCALE, so text stays readable. Setup on a phone held upright asks to turn the phone sideways instead.
export const ONE_PAGE_ROUTES = ["/", "/signup", "/plans", "/setup"];
const PAGES = ".auth-split-page, .plans-page, .bsetup-page";
const MIN_SCALE = 0.5;

export const isOnePageRoute = (pathname: string) => ONE_PAGE_ROUTES.includes(pathname);

const scrolls = (e: Element) => /auto|scroll|hidden/.test(getComputedStyle(e).overflowY);
/** How many pixels of content are hidden below the box, in the box itself or any scrolling list inside it. */
function overflowOf(box: HTMLElement) {
  let over = Math.max(0, box.scrollHeight - box.clientHeight);
  for (const e of box.querySelectorAll<HTMLElement>("*")) {
    if (e.clientHeight < 40 || e.closest("[role=dialog]") !== box.closest("[role=dialog]")) continue;
    if (!scrolls(e) || getComputedStyle(e).overflowY === "hidden") continue;
    over = Math.max(over, e.scrollHeight - e.clientHeight);
  }
  // The whole document scrolling counts too (a page whose body grew past the screen).
  if (box.matches(PAGES)) over = Math.max(over, document.documentElement.scrollHeight - document.documentElement.clientHeight);
  // A window taller than the screen makes its backdrop scroll instead of itself.
  const host = box.closest("[role=dialog]")?.parentElement;
  if (host && host !== document.body) over = Math.max(over, host.scrollHeight - host.clientHeight);
  return over > 2 ? over : 0;
}
const zoomOf = (e: HTMLElement) => Number(e.style.getPropertyValue("zoom") || 1) || 1;
function setZoom(box: HTMLElement, z: number) {
  for (const c of box.children) if (c instanceof HTMLElement && getComputedStyle(c).position !== "fixed") c.style.setProperty("zoom", z === 1 ? "" : z.toFixed(3));
}

/** Shrinks one box's content until it fits (a few passes, because padding and gaps outside the children don't shrink). */
export function fitBox(box: HTMLElement) {
  const first = box.firstElementChild as HTMLElement | null;
  let z = first ? zoomOf(first) : 1;
  for (let i = 0; i < 6; i++) {
    const over = overflowOf(box);
    if (!over) break;
    const room = box.clientHeight || window.innerHeight;
    const next = Math.max(MIN_SCALE, z * Math.min(0.99, room / (room + over)));
    if (next >= z - 0.001) break;
    z = next; setZoom(box, z);
  }
  box.dataset["fit"] = z.toFixed(3);
}

/** Drops any earlier shrinking, so a bigger window (or a turned phone) gets the full size back. */
export function resetBox(box: HTMLElement) { setZoom(box, 1); delete box.dataset["fit"]; }

/** Fits the page and every open window on it. */
export function fitOnePage(reset = false) {
  const boxes = [...document.querySelectorAll<HTMLElement>(PAGES), ...[...document.querySelectorAll<HTMLElement>("[role=dialog]")].map((d) => {
    // A window's own scroller is the window itself or its first scrolling child (GlassPage keeps its body in .glass-page-body).
    const inner = d.querySelector<HTMLElement>(".glass-page-body");
    return inner ?? d;
  })];
  for (const b of boxes) { if (reset) resetBox(b); fitBox(b); }
}

/** Setup on a phone held upright: too small to use, so the phone should be turned sideways. */
export function phoneUpright() {
  if (typeof window === "undefined") return false;
  const small = Math.min(window.screen.width, window.screen.height) < 600;
  return small && window.matchMedia("(orientation: portrait)").matches && window.screen.height > window.screen.width;
}
