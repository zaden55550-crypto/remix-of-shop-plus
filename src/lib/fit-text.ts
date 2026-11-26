/**
 * System-wide label fitting: one root-owned monitor measures every button and summary label against
 * its real box (not the device) and shrinks text and icons until the wording fits. If even the
 * readable minimum cannot fit, the button switches to a controlled two-line label — wording is never
 * clipped or hidden. Purely visual: it only sets inline font-size and a data-fit attribute.
 */

/** Every label whose wording can grow (other languages, long shop names): buttons and tabs, KPI and Dashboard
 *  labels, panel titles, section headings, form labels, Settings categories and the Apps header. */
const TARGETS = [
  "button", ":is(h1, h2, h3, h4).truncate", ".inventory-header h1", "[data-fit-text]",
  ".inv-kpi-label", ".inv-panel-title :is(h3, p)", ".inv-name", ".inv-meta",
  ".dash-kpi-label", ".dash-att-text > span", ".dash-panel-title", ".dash-fin-label", ".dash-header-title h1",
  ".money-heading", ".shop-chart-title", ".inventory-field > span", ".settings-nav-item > span",
  ".apps-brand", ".apps-shop-name", ".apps-label", ".app-header-bar h1",
  ".inv-kpi-value", ".dash-att-text > b", ".dash-row > b", ".dash-kpi-body .dash-chip",
].join(", ");
/** Card amounts behave as money: they may shrink further so every digit shows, and never wrap. */
// Dashboard KPI and balance figures already carry data-fit-text="money" inside, so they are not listed twice.
const MONEY = ".inv-kpi-value, .dash-att-text > b, .dash-row > b";
/** Names inside KPI cards share their row with a large icon, so they may shrink a little more to stay on one line. */
const TIGHT = ".inv-kpi-label, .dash-kpi-label, .dash-att-text > span";
const TIGHT_MIN_RATIO = 0.5;
const TIGHT_MIN_PX = 7;
/** Labels never shrink below this share of their designed size, nor below MIN_PX (long translations shrink
 *  rather than being cut). Money (data-fit-text="money") may shrink further so every digit stays visible. */
const MIN_RATIO = 0.6;
const MIN_PX = 8;
const MONEY_MIN_RATIO = 0.5;
const MONEY_MIN_PX = 6;

/** Labels that change width when the content beside them changes. */
const AROUND = ".app-header-bar h1, .inventory-tab";

const base = new WeakMap<HTMLElement, string>();
/** Width each label had after its last fit: only a different width (from outside) calls for a new fit. */
const fittedWidth = new WeakMap<HTMLElement, number>();

/** Safety guard: a label that keeps changing size because of its own fit (an animation, a layout that pushes
 *  back) pauses instead of flickering, gets one fresh fit once calm, then stays put until its text changes. */
const recent = new WeakMap<HTMLElement, { n: number; since: number }>();
const retried = new WeakSet<HTMLElement>();
function settling(el: HTMLElement) {
  const now = performance.now(), r = recent.get(el);
  if (!r || now - r.since > 1000) { recent.set(el, { n: 1, since: now }); return false; }
  r.n += 1;
  return r.n > 4;
}

function eligible(el: HTMLElement) {
  // Buttons that hold whole layouts (list rows, cards) arrange their own content.
  if (el.tagName === "BUTTON" && el.querySelector(":scope :is(div, p, ul, ol, table, h1, h2, h3, h4, .absolute, .fixed, .dash-kpi-body)")) return false;
  // Buttons whose text is designed to end in "…" (pickers such as Currency and Country) keep their own size.
  if (el.tagName === "BUTTON" && el.querySelector(":scope .truncate")) return false;
  // Image tiles have no text to fit, and freeing their height would let a tall logo stretch the row (Business Setup's 44px logos).
  if (el.matches(".bsetup-logo")) return false;
  // Rows of a pick list (currency, country: about 250 each) lay out their own text; measuring every row froze the page.
  if (el.matches("[role=option], .signup-picker-option, .dash-tx-row")) return false;
  // The Dashboard sets its own readable sizes for one page on every screen (owner, 2026-11-26): its cards and bars are never shrunk.
  if (el.closest(".dashboard-screen .dash-main")) return false;
  return el.isConnected && el.clientWidth > 0;
}

/** Sub-pixel room check: scroll metrics round away fractional overflow that still triggers an ellipsis. */
function room(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const text = range.getBoundingClientRect();
  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const k = box.width / (el.offsetWidth || 1);
  const px = (...v: string[]) => v.reduce((n, x) => n + (parseFloat(x) || 0), 0) * k;
  const w = box.width - px(cs.paddingLeft, cs.paddingRight, cs.borderLeftWidth, cs.borderRightWidth);
  const h = box.height - px(cs.paddingTop, cs.paddingBottom, cs.borderTopWidth, cs.borderBottomWidth);
  // Inventory sets its own sizes (INVENTORY TYPE in styles.css): one line of text drawn taller than its line box isn't overflow there.
  const rects = el.closest(".inventory-app") ? [...range.getClientRects()] : [];
  const tallOnly = rects.length > 0 && !rects.some((r) => r.top >= rects[0]!.bottom - 1);
  return { ratio: text.width ? w / text.width : 1, over: text.width > w + 0.05 || (!tallOnly && text.height > h + 0.5) };
}
const overflows = (el: HTMLElement) => room(el).over;

/** Returns "later" when the element is settling and should be fitted again once it is calm. */
function fit(el: HTMLElement): "later" | void {
  if (!eligible(el)) return;
  if (settling(el)) return "later";
  base.set(el, el.textContent ?? "");
  el.style.removeProperty("font-size");
  el.style.removeProperty("min-height");
  delete el.dataset["fit"];
  if (!overflows(el)) return;

  const start = parseFloat(getComputedStyle(el).fontSize) || 14;
  const money = el.dataset["fitText"] === "money" || el.matches(MONEY);
  const min = money ? Math.max(MONEY_MIN_PX, start * MONEY_MIN_RATIO)
    : el.matches(TIGHT) ? Math.max(TIGHT_MIN_PX, start * TIGHT_MIN_RATIO)
    : Math.max(MIN_PX, start * MIN_RATIO);
  const height = el.offsetHeight;
  el.dataset["fit"] = "shrink";
  let size = Math.max(min, Math.floor(start * Math.min(1, room(el).ratio) * 10) / 10);
  for (let i = 0; i < 6; i++) {
    el.style.fontSize = `${size}px`;
    if (!overflows(el) || size <= min) break;
    size = Math.max(min, size - 0.5);
  }
  // Still too wide at the readable minimum (e.g. one long translated word): a balanced two-line label rather
  // than cutting the wording. Labels that fit at any size above the minimum stay on one line. Money never wraps.
  if (overflows(el) && !money) {
    el.dataset["fit"] = "wrap";
    if (el.tagName === "BUTTON") el.style.minHeight = `${height}px`;
  }
}

export function startFitText() {
  if (typeof window === "undefined" || !("ResizeObserver" in window)) return () => {};
  const queue = new Set<HTMLElement>();
  let frame = 0;
  const flush = () => {
    frame = 0;
    const later: HTMLElement[] = [];
    queue.forEach((el) => { if (fit(el) === "later") later.push(el); fittedWidth.set(el, el.offsetWidth); });
    queue.clear();
    const retry = later.filter((el) => !retried.has(el));
    retry.forEach((el) => retried.add(el));
    if (retry.length) window.setTimeout(() => retry.forEach((el) => { recent.delete(el); schedule(el); }), 1100);
  };
  const schedule = (el: HTMLElement) => {
    queue.add(el);
    if (!frame) frame = requestAnimationFrame(flush);
  };

  const sizes = new ResizeObserver((entries) => {
    entries.forEach((e) => { const el = e.target as HTMLElement; if (fittedWidth.get(el) !== el.offsetWidth) schedule(el); });
  });
  const watch = (root: ParentNode) => {
    if (root instanceof HTMLElement && root.matches(TARGETS)) sizes.observe(root);
    root.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => sizes.observe(el));
  };
  const unwatch = (root: Node) => {
    if (!(root instanceof HTMLElement)) return;
    if (root.matches(TARGETS)) sizes.unobserve(root);
    root.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => sizes.unobserve(el));
  };

  // New screens, translated labels and changed amounts re-fit only the element whose text changed.
  const dom = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((n) => { if (n instanceof HTMLElement) { watch(n); if (n.matches(TARGETS)) queue.add(n); n.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => queue.add(el)); } });
      r.removedNodes.forEach(unwatch);
      const host = (r.target instanceof HTMLElement ? r.target : r.target.parentElement)?.closest<HTMLElement>(TARGETS);
      if (host && base.get(host) !== host.textContent) { retried.delete(host); recent.delete(host); schedule(host); }
    }
    // This runs right after the screen is written and before it is painted, so nothing is ever seen at the wrong size.
    // New content can resize the header and menus around it, and fitting one tab can resize its neighbours: hence the second pass.
    for (let pass = 0; pass < 2; pass++) {
      document.querySelectorAll<HTMLElement>(AROUND).forEach((el) => { if (fittedWidth.get(el) !== el.offsetWidth) queue.add(el); });
      if (!queue.size) break;
      if (frame) cancelAnimationFrame(frame);
      flush();
    }
  });

  watch(document.body);
  dom.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Web fonts change text widths once they load.
  document.fonts?.ready.then(() => document.querySelectorAll<HTMLElement>(TARGETS).forEach(schedule));

  return () => {
    dom.disconnect();
    sizes.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}

/** Ref for the selected tab: scrolls only its own tab row sideways so the active tab is never off-screen. */
export function revealTab(el: HTMLElement | null) {
  const row = el?.parentElement;
  if (!el || !row || row.scrollWidth <= row.clientWidth) return;
  const left = el.offsetLeft - row.offsetLeft;
  if (left < row.scrollLeft) row.scrollLeft = left;
  else if (left + el.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left + el.offsetWidth - row.clientWidth;
}
