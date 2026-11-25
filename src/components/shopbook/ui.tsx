import { toast } from "sonner";
import { createPortal } from "react-dom";
import { authMessage, passkeyCancelled, passkeyMessage, passkeysEnabled, passkeysSupported, signInPasskey, signInProvider } from "@/lib/auth-service";
import emblemAsset from "@/assets/auth-brand-emblem.jpg.asset.json";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
  useSyncExternalStore,
} from "react";
import {
  Apple as AppleIcon,
  Camera,
  Eye,
  EyeOff,
  Fingerprint,
  Globe,
  Minus,
  Move,
  Plus,
  Save,
  Moon,
  Sun,
  Search,
  X,
  MapPin,
  Coins,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { LANGS } from "@/lib/i18n";
import { RING_ICONS } from "@/lib/shopbook";
import { ShopButton } from "@/components/ui/shop-button";
import { cn } from "@/lib/utils";
import {
  ALL_WORLD_LANGUAGES,
  searchLanguages,
  searchCurrencies,
  searchCountries,
  findByCurrency,
  findByCountry,
  type WorldCountryCurrency,
} from "@/lib/world-data";

/* -------------------------------------------------------
   /* -------------------------------------------------------
   Theme Hook & ThemeToggle (Sun & Moon Switcher)
------------------------------------------------------- */

const THEME_KEY = "shopbook.theme",
  THEME_EVENT = "shopbook-theme-change";
const readDark = () => {
  const saved = localStorage.getItem(THEME_KEY);
  return saved ? saved === "dark" : true;
};
const applyDark = (dark: boolean) => {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
};
/** Pages without the theme switch (Terms, Privacy, Forgot Password, Verify email) still open in the person's saved light or dark. */
export function useSavedTheme() {
  useEffect(() => { try { applyDark(readDark()); } catch { /* storage blocked: keep the default */ } }, []);
}
const subscribeTheme = (changed: () => void) => {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) changed();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, changed);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, changed);
  };
};

/** The saved choice is the only source, so the toggle's icon can never disagree with the theme on screen. */
export function useTheme() {
  const dark = useSyncExternalStore(subscribeTheme, readDark, () => true);
  useEffect(() => applyDark(dark), [dark]);

  const toggle = () => {
    const next = !readDark();
    localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    applyDark(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  return { dark, toggle };
}
/* -------------------------------------------------------
   Dual Sun & Moon Switcher (Both Icons Always Visible)
-------------------------------------------------------- */
export function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <div
      className="auth-theme-toggle inline-flex items-center gap-0.5 rounded-full border border-border/80 bg-card/80 p-0.5 shadow-xs backdrop-blur-sm"
      role="group"
      aria-label="Theme switcher"
    >
      <button
        type="button"
        onClick={() => {
          if (dark) toggle();
        }}
        className={cn(
          "auth-theme-toggle-button flex h-6 w-6 items-center justify-center rounded-full transition-all",
          !dark
            ? "bg-amber-500/20 text-amber-500 shadow-xs"
            : "text-muted-foreground/60 hover:text-foreground",
        )}
        title="Light theme"
        aria-label="Light theme"
      >
        <Sun className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          if (!dark) toggle();
        }}
        className={cn(
          "auth-theme-toggle-button flex h-6 w-6 items-center justify-center rounded-full transition-all",
          dark
            ? "bg-indigo-500/25 text-indigo-400 shadow-xs"
            : "text-muted-foreground/60 hover:text-foreground",
        )}
        title="Dark theme"
        aria-label="Dark theme"
      >
        <Moon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* -------------------------------------------------------
   TopBar: Language on Far-Left, Sun & Moon on Far-Right
-------------------------------------------------------- */
export function TopBar() {
  const { language, setLanguage, tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
      // Like every other pop-up: Escape closes it.
      const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }
    setQuery("");
    return undefined;
  }, [open]);

  const filtered = searchLanguages(query);
  const currentLang = ALL_WORLD_LANGUAGES.find(
    (l) => l.name === language || l.native === language,
  ) ?? {
    name: language,
    native: language,
    code: "en",
  };

  const handlePickLanguage = (langName: string, dir?: "ltr" | "rtl") => {
    // Only the 11 translated interface languages can be saved; others would silently revert to English on reload.
    const lang = LANGS.find((l) => l === langName);
    if (!lang) {
      toast.info(tr("This language is not available yet"));
      return;
    }
    setLanguage(lang);
    if (dir) {
      document.documentElement.dir = dir;
    }
    setOpen(false);
  };

  return (
    <header className="relative flex w-full items-center justify-between px-2 py-1">
      {/* Top Left: Language Selector */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="auth-language-selector flex items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-2.5 py-1 text-xs font-semibold text-foreground shadow-xs backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-card"
        title={tr("Change language")}
      >
        <Globe className="h-3.5 w-3.5 text-primary" />
        <span className="truncate max-w-[120px]">{currentLang.native}</span>
        <Search className="ml-0.5 h-3 w-3 text-muted-foreground opacity-60" />
      </button>

      {/* Top Right: Dual Sun & Moon */}
      <ThemeToggle />

      {/* Language Search Modal */}
      {open && (
        <div className="glass-scrim fixed inset-0 z-50 flex items-start justify-center p-4 pt-12" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="glass-card w-full max-w-sm rounded-2xl border border-border p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">{tr("Select Language")}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tr("Close")}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("Search 130+ languages...")}
                className="w-full rounded-lg border border-border bg-background py-1.5 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-hidden"
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1">
              {filtered.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {tr("No languages found")}
                </p>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.code + item.name}
                    type="button"
                    onClick={() => handlePickLanguage(item.name, item.dir)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                      language === item.name
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "hover:bg-muted text-foreground",
                    )}
                  >
                    <span>{item.native}</span>
                    <span className="text-[11px] opacity-70">{item.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

/* -------------------------------------------------------
   Searchable 3-Character Currency Picker (Half Column)
------------------------------------------------------- */

type SignupPickerPosition = { left: number; top: number; width: number; maxHeight: number };

function useSignupPickerPopover() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<SignupPickerPosition | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPosition(null);
      return;
    }

    const placePopover = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const pageZoomValue = Number.parseFloat(getComputedStyle(document.documentElement).zoom);
      const pageZoom = Number.isFinite(pageZoomValue) && pageZoomValue > 0 ? pageZoomValue : 1;
      const viewportWidth = (document.documentElement.clientWidth || window.innerWidth) / pageZoom;
      const viewportHeight = window.innerHeight / pageZoom;
      const anchorRight = rect.right / pageZoom;
      const anchorTop = rect.top / pageZoom;
      const anchorBottom = rect.bottom / pageZoom;
      const width = Math.min(196, Math.max(0, viewportWidth - 16));
      const below = Math.max(0, viewportHeight - anchorBottom - 14);
      const above = Math.max(0, anchorTop - 14);
      const opensBelow = below >= 144 || below >= above;
      const available = opensBelow ? below : above;
      const maxHeight = Math.max(96, Math.min(180, available));
      const top = opensBelow
        ? Math.min(viewportHeight - 8 - maxHeight, anchorBottom + 6)
        : Math.max(8, anchorTop - maxHeight - 6);
      const left = Math.max(8, Math.min(anchorRight - width, viewportWidth - width - 8));
      setPosition({ left, top, width, maxHeight });
    };

    placePopover();
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    window.addEventListener("resize", placePopover);
    document.addEventListener("scroll", placePopover, true);
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)))
        return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("resize", placePopover);
      document.removeEventListener("scroll", placePopover, true);
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return { open, setOpen, query, setQuery, triggerRef, inputRef, popoverRef, position };
}

export function SearchableCurrencyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (currencyCode: string, countryCode?: string) => void;
}) {
  const { tr } = useLanguage();
  const { open, setOpen, query, setQuery, triggerRef, inputRef, popoverRef, position } =
    useSignupPickerPopover();

  const current = findByCurrency(value) ?? {
    currencyCode: (value || "KSH").toUpperCase().slice(0, 3),
    currencyName: value,
    currencySymbol: value,
    countryCode: "KEN",
    countryName: "Kenya",
  };

  const filtered = searchCurrencies(query);

  return (
    <div className="signup-col-picker">
      <label htmlFor="signup-currency-btn" className="signup-field-label">
        {tr("Currency")}
      </label>

      {/* 3-Character Currency Button */}
      <button
        id="signup-currency-btn"
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="signup-currency-options"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-card px-2.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-all hover:border-primary/50"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Coins className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-bold text-primary font-mono tracking-wide">
            {current.currencyCode}
          </span>
          <span className="text-muted-foreground text-[11px] truncate">
            ({current.currencySymbol})
          </span>
        </span>
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            className="signup-picker-popover"
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            <div className="signup-picker-menu">
              <div className="signup-picker-heading">{tr("Select Currency")}</div>

              {/* Search Input Box */}
              <div className="signup-picker-search-wrap">
                <Search className="signup-picker-search-icon" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tr("Search by code (e.g. KSH, USD, SOM) or name...")}
                  className="signup-picker-search"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="signup-picker-clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Scrollable Currency List */}
              <div
                id="signup-currency-options"
                role="listbox"
                aria-label={tr("Currency")}
                className="signup-picker-list"
              >
                {filtered.length === 0 ? (
                  <p className="signup-picker-empty">{tr("No currency found")}</p>
                ) : (
                  filtered.map((item) => {
                    const isSelected = item.currencyCode === current.currencyCode;
                    return (
                      <button
                        key={item.currencyCode + item.countryCode}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(item.currencyCode, item.countryCode);
                          setOpen(false);
                        }}
                        className={cn("signup-picker-option", isSelected && "is-selected")}
                      >
                        <span className="signup-picker-option-main">
                          <span className="signup-picker-code">{item.currencyCode}</span>
                          <span className="signup-picker-option-copy">
                            <span className="signup-picker-option-name">{item.currencyName}</span>
                            <span className="signup-picker-option-detail">
                              {item.countryName} ({item.countryCode})
                            </span>
                          </span>
                        </span>
                        <span className="signup-picker-symbol">{item.currencySymbol}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* -------------------------------------------------------
   Searchable 3-Character Country Picker (Half Column)
------------------------------------------------------- */

export function SearchableCountryPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (countryCode: string, currencyCode?: string) => void;
}) {
  const { tr } = useLanguage();
  const { open, setOpen, query, setQuery, triggerRef, inputRef, popoverRef, position } =
    useSignupPickerPopover();

  const current = findByCountry(value) ?? {
    countryCode: (value || "KEN").toUpperCase().slice(0, 3),
    countryName: value,
    currencyCode: "KSH",
    currencyName: "Kenyan Shilling",
    currencySymbol: "KSh",
  };

  const filtered = searchCountries(query);

  return (
    <div className="signup-col-picker">
      <label htmlFor="signup-country-btn" className="signup-field-label">
        {tr("Country")}
      </label>

      {/* 3-Character Country Button */}
      <button
        id="signup-country-btn"
        type="button"
        ref={triggerRef}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="signup-country-options"
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-card px-2.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-all hover:border-primary/50"
      >
        <span className="flex items-center gap-1.5 truncate">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-bold text-primary font-mono tracking-wide">
            {current.countryCode}
          </span>
          <span className="text-muted-foreground text-[11px] truncate">
            {current.countryName}
          </span>
        </span>
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popoverRef}
            className="signup-picker-popover"
            style={{
              left: position.left,
              top: position.top,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
          >
            <div className="signup-picker-menu">
              <div className="signup-picker-heading">{tr("Select Country")}</div>

              {/* Search Input Box */}
              <div className="signup-picker-search-wrap">
                <Search className="signup-picker-search-icon" aria-hidden="true" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={tr("Search by country (e.g. KEN, USA, SOM) or name...")}
                  className="signup-picker-search"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="signup-picker-clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Scrollable Country List */}
              <div
                id="signup-country-options"
                role="listbox"
                aria-label={tr("Country")}
                className="signup-picker-list"
              >
                {filtered.length === 0 ? (
                  <p className="signup-picker-empty">{tr("No country found")}</p>
                ) : (
                  filtered.map((item) => {
                    const isSelected = item.countryCode === current.countryCode;
                    return (
                      <button
                        key={item.countryCode + item.currencyCode}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          onChange(item.countryCode, item.currencyCode);
                          setOpen(false);
                        }}
                        className={cn("signup-picker-option", isSelected && "is-selected")}
                      >
                        <span className="signup-picker-option-main">
                          <span className="signup-picker-code">{item.countryCode}</span>
                          <span className="signup-picker-option-name">{item.countryName}</span>
                        </span>
                        <span className="signup-picker-symbol">
                          {item.currencyCode} ({item.currencySymbol})
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/* -------------------------------------------------------
   Rotating BrandRing with Orbiting App Icons
------------------------------------------------------- */

/** The DataQuill Solutions mark: a Z monogram with the name under it, drawn in code so no old SHOPPLUS artwork shows. Used in the logo
 *  circle on Log In / Create Account and in the Business Setup header. Replace with the final logo file when it exists. */
export function ZakrioMark({ compact = false, size }: { compact?: boolean; size?: number }) {
  return (
    <span className={compact ? "zakrio-mark is-compact" : "zakrio-mark"} aria-hidden="true" style={size ? ({ "--mark-size": `${size}px` } as CSSProperties) : undefined}>
      {/* The DataQuill Solutions logo (public/brand/dataquill-logo.png); until the file is there, "DQ" drawn in code. */}
      <img className="zakrio-mark-logo" src="/brand/dataquill-logo.png" alt="" onLoad={(e) => e.currentTarget.parentElement?.classList.add("has-logo")} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      <span className="zakrio-mark-z">DQ</span>
      {!compact && <span className="zakrio-mark-name">DATAQUILL</span>}
    </span>
  );
}

export function BrandRing({ size = 180 }: { size?: number }) {
  const icons = RING_ICONS;
  const count = icons.length;
  const orbitRadiusPercent = 36.5;

  return (
    <div
      className="auth-brand-emblem"
      style={{ "--emblem-size": `${size}px` } as CSSProperties}
      aria-label="DataQuill Solutions"
    >
      <div className="auth-brand-emblem-core">
        <ZakrioMark size={size} />
      </div>

      <div className="auth-brand-orbit spin-slow" aria-hidden="true">
        {icons.map((src, i) => {
          const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
          const x = (50 + orbitRadiusPercent * Math.cos(angle)).toFixed(3);
          const y = (50 + orbitRadiusPercent * Math.sin(angle)).toFixed(3);
          return (
            <div key={i} className="auth-orbit-icon" style={{ left: `${x}%`, top: `${y}%` }}>
              <img
                src={src}
                alt=""
                className="auth-orbit-img counter-spin"
                loading="eager"
                decoding="async"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   LogoCropPicker with Interactive Pan & Zoom
------------------------------------------------------- */

export function LogoCropPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (v: string) => void;
}) {
  const { tr } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [rawImage, setRawImage] = useState<string | null>(null);

  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setRawImage(r.result as string);
      setScale(1);
      setOffset({ x: 0, y: 0 });
      setEditing(true);
    };
    r.readAsDataURL(f);
    // Cleared so choosing the same photo again (after Cancel) still opens the crop window.
    e.target.value = "";
  };

  // Pointer events, so a finger on a phone drags the logo as well as a mouse.
  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      setOffset({
        x: dragStart.current.ox + (e.clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.clientY - dragStart.current.y),
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  const saveCropped = () => {
    if (!rawImage) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.beginPath();
      ctx.arc(128, 128, 128, 0, Math.PI * 2);
      ctx.clip();

      // Drawn exactly as the preview shows it: the whole image fitted inside the circle (contain), moved by the same drag,
      // scaled from the 224px preview to the 256px saved logo.
      const aspect = img.width / img.height;
      const k = 256 / 224;
      const drawW = (aspect >= 1 ? 256 : 256 * aspect) * scale;
      const drawH = (aspect >= 1 ? 256 / aspect : 256) * scale;
      const dx = (256 - drawW) / 2 + offset.x * k;
      const dy = (256 - drawH) / 2 + offset.y * k;

      ctx.drawImage(img, dx, dy, drawW, drawH);
      const out = canvas.toDataURL("image/png");
      onChange(out);
      setEditing(false);
      setRawImage(null);
    };
    img.src = rawImage;
  };

  return (
    <div className="signup-upload-card">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        aria-label={tr("Upload Shop Logo")}
        onChange={onFile}
        className="sr-only"
      />

      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        className="signup-upload-btn group focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {value ? (
          <img src={value} alt="Shop logo" className="h-full w-full object-contain" />
        ) : (
          <div className="signup-upload-placeholder">
            <Camera className="signup-upload-icon transition-transform group-hover:scale-110" />
            <span className="signup-upload-text">{tr("Upload Logo")}</span>
          </div>
        )}
      </div>

      {editing && rawImage && createPortal(
        <div className="glass-scrim fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="glass-card flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-foreground">
              {tr("Position & Crop Shop Logo")}
            </h3>

            <div
              className="relative h-56 w-56 cursor-move touch-none overflow-hidden rounded-full border-2 border-primary/60 bg-muted/30 shadow-inner"
              onPointerDown={startDrag}
            >
              <img
                src={rawImage}
                alt="Crop preview"
                draggable={false}
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  transformOrigin: "center center",
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  userSelect: "none",
                }}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <Move className="h-5 w-5 text-foreground/20" />
              </div>
            </div>

            <div className="flex w-full items-center justify-center gap-3 px-4">
              <button
                type="button"
                onClick={() => setScale((s) => Math.max(0.6, s - 0.15))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
                aria-label={tr("Zoom out")}
              >
                <Minus className="h-4 w-4" />
              </button>
              <input
                type="range"
                min="0.6"
                max="3"
                step="0.05"
                value={scale}
                onChange={(e) => setScale(Number.parseFloat(e.target.value))}
                className="h-1.5 flex-1 accent-primary"
                aria-label={tr("Zoom")}
              />
              <button
                type="button"
                onClick={() => setScale((s) => Math.min(3, s + 0.15))}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-foreground hover:bg-muted"
                aria-label={tr("Zoom in")}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex w-full gap-2 pt-1">
              <ShopButton
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setRawImage(null);
                }}
                className="flex-1"
              >
                {tr("Cancel")}
              </ShopButton>
              <ShopButton type="button" onClick={saveCropped} className="flex-1">
                <Save className="mr-1.5 h-4 w-4" /> {tr("Save")}
              </ShopButton>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* -------------------------------------------------------
   Unified Form Field Component
------------------------------------------------------- */

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  password?: boolean;
  label?: string | undefined;
  error?: string | undefined;
}

export function Field({
  icon,
  password,
  label,
  error,
  className,
  id: explicitId,
  ...rest
}: FieldProps) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;
  const [show, setShow] = useState(false);
  // Password boxes warn while Caps Lock is on, read from the key events themselves (works on every keyboard layout).
  const [caps, setCaps] = useState(false);
  const { tr: trCaps } = useLanguage();
  const capsFrom = (e: React.KeyboardEvent<HTMLInputElement>) => { if (password && typeof e.getModifierState === "function") setCaps(e.getModifierState("CapsLock")); };

  return (
    <div className={cn("signup-field", className)}>
      {label && (
        <label htmlFor={id} className="signup-field-label">
          {label}
        </label>
      )}

      <div className="signup-field-input-wrap">
        {icon && <span className="signup-field-icon">{icon}</span>}

        <input
          id={id}
          type={password ? (show ? "text" : "password") : (rest.type ?? "text")}
          className={cn(
            "signup-field-input",
            icon && "has-icon",
            password && "has-action",
            className,
          )}
          {...rest}
          onKeyDown={(e) => { capsFrom(e); rest.onKeyDown?.(e); }}
          onKeyUp={(e) => { capsFrom(e); rest.onKeyUp?.(e); }}
          onBlur={(e) => { setCaps(false); rest.onBlur?.(e); }}
        />

        {password && caps && <span className="signup-caps" role="status">{trCaps("Caps Lock is on")}</span>}

        {password && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="signup-field-action"
            tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="signup-error">
          {error}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------
   DataQuill Solutions Wordmark
------------------------------------------------------- */

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("text-center text-lg font-extrabold tracking-tight", className)}>
      DataQuill <span className="text-primary">Systems</span>
    </div>
  );
}

/* -------------------------------------------------------
   SocialButtons: Google, Apple & Email
------------------------------------------------------- */

/** How this device signed in last (Google, Apple or email), so Log In can point to it. Display only. */
const LAST_SIGN_IN = "shopbook.lastSignIn";
/** Passkey shows on Log In only once one has been added (owner, 2026-11-24): most owners have never heard of passkeys. */
const PASSKEY_HERE = "shopbook.passkeyHere";
export const devicePasskey = () => { try { return localStorage.getItem(PASSKEY_HERE) === "1"; } catch { return false; } };
export const markDevicePasskey = (on: boolean) => { try { if (on) localStorage.setItem(PASSKEY_HERE, "1"); else localStorage.removeItem(PASSKEY_HERE); } catch { /* a hint only */ } };
export const rememberSignIn = (how: "google" | "apple" | "email" | "passkey") => { try { localStorage.setItem(LAST_SIGN_IN, how); } catch { /* a hint only */ } };
const lastSignIn = () => { try { return localStorage.getItem(LAST_SIGN_IN); } catch { return null; } };

/** Whether Lovable's Google/Apple sign-in service can be reached here. It is served only by the Lovable-hosted site; a copy running on
 *  this computer (localhost, 127.0.0.1) never has it. Hosted sites are never probed: the service may not answer a bare check, and
 *  a wrong "no" would block real sign-ins, so there the button always goes straight to Google or Apple. */
async function oauthAvailable() {
  return !/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/.test(window.location.hostname);
}

/** Google and Apple on one line, the same on Log In and Create Account. Email and password is the page's own form, so there is no
 *  separate Email button. A first Google or Apple sign-in creates the business (Log In finishes every sign-in). Log In also shows
 *  Passkey (fingerprint, face or screen lock) where the browser supports it; the sign-in it opens is finished by Log In too. */
export function SocialButtons({ passkey = false }: { passkey?: boolean } = {}) {
  // Read after mount: the server can't see this device's storage, so reading it during the first render broke hydration.
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => { setLast(lastSignIn()); }, []);
  const { tr } = useLanguage();
  const [signingWith, setSigningWith] = useState<"google" | "apple" | "passkey" | null>(null);
  // Passkey shows only when the server has passkeys switched on and one was added in Settings (or last used) on this device.
  // Asked after mount, so server rendering never differs.
  const [passkeyOn, setPasskeyOn] = useState(false);
  const canPasskey = passkey && passkeyOn && (devicePasskey() || last === "passkey");
  useEffect(() => {
    let live = true;
    if (passkey) void passkeysEnabled().then((on) => { if (live) setPasskeyOn(on); });
    return () => { live = false; };
  }, [passkey]);

  const handlePasskey = async () => {
    if (!passkeyOn) { toast(tr("Passkey sign-in is coming soon. For now, log in with your email, Google or Apple.")); return; }
    if (!passkeysSupported()) { toast.error(tr("This browser doesn't support passkeys. Try an up-to-date Chrome, Safari or Edge.")); return; }
    if (!navigator.onLine) { toast.error(tr("Passkeys need internet. Log in with your email and password.")); return; }
    if (!(await oauthAvailable())) { toast.error(tr("Passkeys work on your published site, not on this test copy.")); return; }
    setSigningWith("passkey");
    try {
      await signInPasskey();
      rememberSignIn("passkey");
      // Signed in online: Log In's own sign-in watcher opens the business (or the employee's shop) from here.
    } catch (err: unknown) {
      if (!passkeyCancelled(err)) toast.error(tr(passkeyMessage(err)));
    } finally {
      setSigningWith(null);
    }
  };

  const handleOAuth = async (provider: "google" | "apple") => {
    try {
      setSigningWith(provider);
      // Google and Apple go through Lovable's sign-in service, which only exists on the Lovable-hosted site (preview, published
      // address or custom domain). A test copy on this computer (localhost) has no such page: say so instead of opening a 404.
      if (!(await oauthAvailable())) {
        toast.error(tr("Google and Apple sign-in work on your published site, not on this test copy. Here, log in with your email and password."));
        return;
      }
      rememberSignIn(provider);
      const result = await signInProvider(provider, `${window.location.origin}/`);
      // A full-page redirect leaves this page by itself. A pop-up (Lovable's preview) signs in here instead: hand over to Log In,
      // which finishes every sign-in (a first one creates the business) — Create Account would otherwise just sit there.
      if (!("redirected" in result && result.redirected) && window.location.pathname !== "/") window.location.assign("/");
    } catch (err: unknown) {
      toast.error(tr(authMessage(err)));
    } finally {
      setSigningWith(null);
    }
  };

  return (
    <div className="auth-social-wrap">
      <div className={cn("auth-social-row auth-social-two", canPasskey && "auth-social-passkey")}>
        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={signingWith !== null}
          className={cn("auth-btn-social auth-btn-google", last === "google" && "is-last")}
        >
          {last === "google" && <span className="auth-last-used">{tr("Last used")}</span>}
          <svg
            className="auth-social-icon h-4 w-4 shrink-0"
            width="16"
            height="16"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span className="auth-social-label">{signingWith === "google" ? "..." : "Google"}</span>
        </button>

        <button
          type="button"
          onClick={() => handleOAuth("apple")}
          disabled={signingWith !== null}
          className={cn("auth-btn-social auth-btn-apple", last === "apple" && "is-last")}
        >
          {last === "apple" && <span className="auth-last-used">{tr("Last used")}</span>}
          <AppleIcon className="auth-social-icon" />
          <span className="auth-social-label">{signingWith === "apple" ? "..." : "Apple"}</span>
        </button>

        {canPasskey && <button
          type="button"
          onClick={() => void handlePasskey()}
          disabled={signingWith !== null}
          title={tr("Log in with your fingerprint, face or screen lock")}
          className={cn("auth-btn-social auth-btn-passkey", last === "passkey" && "is-last")}
        >
          {last === "passkey" && <span className="auth-last-used">{tr("Last used")}</span>}
          <Fingerprint className="auth-social-icon" aria-hidden />
          <span className="auth-social-label">{signingWith === "passkey" ? "..." : tr("Passkey")}</span>
        </button>}
      </div>
    </div>
  );
}
