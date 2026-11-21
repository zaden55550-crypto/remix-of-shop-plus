import { LANGS, type Lang } from './i18n';
import { isTranslatedText, knownTranslation } from './interface-translations';

// Page-wide safety net, mounted once in __root: any visible English phrase that a screen printed without tr()
// is shown in the chosen language when the dictionary knows it. Only exact dictionary phrases change, so
// product, customer and shop names, numbers and typed values stay as entered. The English is remembered,
// so switching language (or back to English) always starts from the original text.
// Opt out with translate="no", class "notranslate" or data-no-translate on any element.

const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'] as const;
const SKIP = 'script,style,noscript,textarea,code,pre,svg,[contenteditable="true"],[translate="no"],.notranslate,[data-no-translate],[data-exact]';

type Seen = { en: string; shown: string };
const texts = new WeakMap<Text, Seen>();
const attrs = new WeakMap<Element, Map<string, Seen>>();

function currentLang(): Lang {
  let saved: string | null = null;
  try { saved = localStorage.getItem('shopbook.language'); } catch { /* storage blocked */ }
  return LANGS.find((l) => l === saved) ?? 'English';
}

// "Name *", "Total:", "Loading…" — translate the words and keep the decoration around them.
const EDGE = /^([\s•·*(\[]*)(.*?)([\s:*…).\]]*)$/s;
function translatePhrase(lang: Lang, source: string): string | undefined {
  const match = source.match(EDGE);
  if (!match) return undefined;
  const [, lead = '', core = '', tail = ''] = match;
  if (!core || !/[A-Za-z]/.test(core)) return undefined;
  if (isTranslatedText(lang, core)) return undefined;
  const direct = knownTranslation(lang, core);
  if (direct !== undefined) return lead + direct + tail;
  // The dictionary may hold the phrase with its own full stop or ellipsis ("Loading…", "Search sales...").
  const whole = source.trim();
  if (whole !== core) {
    const full = knownTranslation(lang, whole);
    if (full !== undefined) return source.slice(0, source.indexOf(whole)) + full + source.slice(source.indexOf(whole) + whole.length);
  }
  return undefined;
}

function skipped(el: Element | null) {
  return !el || !!el.closest(SKIP);
}

function doText(node: Text, lang: Lang) {
  const raw = node.nodeValue ?? '';
  const seen = texts.get(node);
  // React wrote new text since we last translated it: that is the new English.
  const source = seen && raw === seen.shown ? seen.en : raw;
  if (!/[A-Za-z]/.test(source)) return;
  if (skipped(node.parentElement)) return;
  const out = lang === 'English' ? undefined : translatePhrase(lang, source);
  const shown = out ?? source;
  if (shown !== raw) node.nodeValue = shown;
  if (out !== undefined || seen) texts.set(node, { en: source, shown });
}

function doAttrs(el: Element, lang: Lang) {
  for (const name of ATTRS) {
    if (!el.hasAttribute(name)) continue;
    const raw = el.getAttribute(name) ?? '';
    let map = attrs.get(el);
    const seen = map?.get(name);
    const source = seen && raw === seen.shown ? seen.en : raw;
    if (!/[A-Za-z]/.test(source) || skipped(el)) continue;
    const out = lang === 'English' ? undefined : translatePhrase(lang, source);
    const shown = out ?? source;
    if (shown !== raw) el.setAttribute(name, shown);
    if (out !== undefined || seen) { if (!map) { map = new Map(); attrs.set(el, map); } map.set(name, { en: source, shown }); }
  }
}

function walk(root: Node, lang: Lang) {
  if (root.nodeType === Node.TEXT_NODE) { doText(root as Text, lang); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.matches(SKIP)) return;
  doAttrs(el, lang);
  const tree = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.nodeType === Node.ELEMENT_NODE && (n as Element).matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = tree.nextNode(); n; n = tree.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) doText(n as Text, lang); else doAttrs(n as Element, lang);
  }
}

export function startDomTranslate() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  let lang = currentLang();
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') doText(r.target as Text, lang);
      else if (r.type === 'attributes') doAttrs(r.target as Element, lang);
      else r.addedNodes.forEach((n) => walk(n, lang));
    }
    observer.takeRecords(); // our own writes above don't need another pass
  });
  const start = () => observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  const refresh = () => {
    const next = currentLang();
    if (next === lang) return;
    lang = next;
    observer.disconnect();
    walk(document.body, lang);
    start();
  };
  // Screens using tr() re-render on the same event; wait a frame so their new text is in place first.
  const onChange = () => requestAnimationFrame(refresh);
  walk(document.body, lang);
  start();
  window.addEventListener('shopbook-language', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    observer.disconnect();
    window.removeEventListener('shopbook-language', onChange);
    window.removeEventListener('storage', onChange);
  };
}
