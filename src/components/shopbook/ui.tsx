import { toast } from "sonner";
import { lovable } from "@/integrations/lovable/index";
import emblemAsset from "@/assets/auth-brand-emblem.jpg.asset.json";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  useId,
} from "react";
import {
  Apple as AppleIcon,
  Camera,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
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
import { store, RING_ICONS } from "@/lib/shopbook";
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
   Theme Hook & ThemeToggle
------------------------------------------------------- */

export function useTheme() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("shopbook.theme");
    setDark(saved ? saved === "dark" : true);

    const onStorage = (e: StorageEvent) => {
      if (e.key === "shopbook.theme") {
        setDark(e.newValue === "dark");
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("shopbook.theme", next ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
  };

  return { dark, toggle };
}

export function ThemeToggle() {
  const { dark, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-card/80 text-foreground shadow-sm backdrop-blur-sm transition-all hover:bg-muted"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-label="Toggle theme"
    >
      {dark ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-indigo-500" />}
    </button>
  );
}

/* -------------------------------------------------------
   Centered TopBar with Easy Search for All World Languages
------------------------------------------------------- */

export function TopBar() {
  const { language, setLanguage, tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setQuery("");
    }
  }, [open]);

  const filtered = searchLanguages(query);
  const currentLang = ALL_WORLD_LANGUAGES.find((l) => l.name === language || l.native === language) ?? {
    name: language,
    native: language,
    code: "en",
  };

  const handlePickLanguage = (langName: string, dir?: "ltr" | "rtl") => {
    setLanguage(langName as any);
    if (dir) {
      document.documentElement.dir = dir;
    }
    setOpen(false);
  };

  return (
    <header className="relative flex w-full items-center justify-center px-1 py-1">
      {/* Centered Language Selector Button with Easy Search */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-full border border-border/80 bg-card/80 px-3 py-1 text-xs font-semibold text-foreground shadow-sm backdrop-blur-sm transition-all hover:border-primary/50 hover:bg-card"
        title={tr("Change language")}
      >
        <Globe className="h-3.5 w-3.5 text-primary" />
        <span className="truncate max-w-[130px]">{currentLang.native}</span>
        <Search className="ml-0.5 h-3 w-3 text-muted-foreground opacity-60" />
      </button>

      {/* Theme Toggle Anchored to Right */}
      <div className="absolute right-1">
        <ThemeToggle />
      </div>

      {/* Easy-Search Modal for All World Languages */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Globe className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground leading-none">{tr("Select Language")}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tr("All world languages supported")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("Search by language or code...")}
                className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Scrollable Language List */}
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">{tr("No language found")}</p>
              ) : (
                filtered.map((lang) => {
                  const isSelected = lang.name === language || lang.native === language;
                  return (
                    <button
                      key={lang.code + lang.name}
                      type="button"
                      onClick={() => handlePickLanguage(lang.name, lang.dir)}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors",
                        isSelected ? "bg-primary/15 font-semibold text-primary" : "hover:bg-muted text-foreground",
                      )}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{lang.native}</span>
                        <span className="text-[10.5px] text-muted-foreground">
                          {lang.name} ({lang.code.toUpperCase()})
                        </span>
                      </div>
                      {lang.dir === "rtl" && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[9.5px] font-mono text-muted-foreground">
                          RTL
                        </span>
                      )}
                    </button>
                  );
                })
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

export function SearchableCurrencyPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (currencyCode: string, countryCode?: string) => void;
}) {
  const { tr } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setQuery("");
    }
  }, [open]);

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
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-card px-2.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-all hover:border-primary/50"
      >
        <span className="flex items-center gap-1.5 truncate">
          <Coins className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-bold text-primary font-mono tracking-wide">{current.currencyCode}</span>
          <span className="text-muted-foreground text-[11px] truncate">({current.currencySymbol})</span>
        </span>
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
      </button>

      {/* Easy Search Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl max-h-[85dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground leading-none">{tr("Select Currency")}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {tr("3-character codes • Auto-selects country")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("Search by code (e.g. KSH, USD, SOM) or name...")}
                className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Scrollable Currency List */}
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">{tr("No currency found")}</p>
              ) : (
                filtered.map((item) => {
                  const isSelected = item.currencyCode === current.currencyCode;
                  return (
                    <button
                      key={item.currencyCode + item.countryCode}
                      type="button"
                      onClick={() => {
                        onChange(item.currencyCode, item.countryCode);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors",
                        isSelected ? "bg-primary/15 font-semibold text-primary" : "hover:bg-muted text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary w-12">{item.currencyCode}</span>
                        <div className="flex flex-col">
                          <span className="font-medium">{item.currencyName}</span>
                          <span className="text-[10.5px] text-muted-foreground">
                            {item.countryName} ({item.countryCode})
                          </span>
                        </div>
                      </div>
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {item.currencySymbol}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setQuery("");
    }
  }, [open]);

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
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center justify-between rounded-xl border border-input bg-card px-2.5 py-2 text-xs font-semibold text-foreground shadow-sm transition-all hover:border-primary/50"
      >
        <span className="flex items-center gap-1.5 truncate">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="font-bold text-primary font-mono tracking-wide">{current.countryCode}</span>
          <span className="text-muted-foreground text-[11px] truncate">– {current.countryName}</span>
        </span>
        <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
      </button>

      {/* Easy Search Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl max-h-[85dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground leading-none">{tr("Select Country")}</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {tr("3-character codes • Auto-selects currency")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search Input Box */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("Search by country (e.g. KEN, USA, SOM) or name...")}
                className="h-9 w-full rounded-xl border border-input bg-background pl-9 pr-8 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Scrollable Country List */}
            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">{tr("No country found")}</p>
              ) : (
                filtered.map((item) => {
                  const isSelected = item.countryCode === current.countryCode;
                  return (
                    <button
                      key={item.countryCode + item.currencyCode}
                      type="button"
                      onClick={() => {
                        onChange(item.countryCode, item.currencyCode);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors",
                        isSelected ? "bg-primary/15 font-semibold text-primary" : "hover:bg-muted text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-primary w-12">{item.countryCode}</span>
                        <span className="font-medium">{item.countryName}</span>
                      </div>
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {item.currencyCode} ({item.currencySymbol})
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------
   Rotating BrandRing with Orbiting App Icons
------------------------------------------------------- */

export function BrandRing({ size = 180 }: { size?: number }) {
  const icons = RING_ICONS;
  const count = icons.length;
  const orbitRadiusPercent = 42;

  return (
    <div
      className="auth-brand-emblem"
      style={{ "--emblem-size": `${size}px` } as CSSProperties}
      aria-label="SHOPBOOK ERP"
    >
      <div className="auth-brand-emblem-core">
        <img
          src={emblemAsset.url}
          alt="SHOPBOOK ERP"
          className="auth-brand-emblem-image"
          loading="eager"
          decoding="async"
        />
      </div>

      <div className="auth-brand-orbit spin-slow" aria-hidden="true">
        {icons.map((src, i) => {
          const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
          const x = 50 + orbitRadiusPercent * Math.cos(angle);
          const y = 50 + orbitRadiusPercent * Math.sin(angle);
          return (
            <div key={i} className="auth-orbit-icon" style={{ left: `${x}%`, top: `${y}%` }}>
              <img src={src} alt="" className="auth-orbit-img counter-spin" loading="eager" decoding="async" />
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

export function LogoCropPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
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
  };

  const startDrag = (e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setOffset({
        x: dragStart.current.ox + (e.clientX - dragStart.current.x),
        y: dragStart.current.oy + (e.clientY - dragStart.current.y),
      });
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
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

      const aspect = img.width / img.height;
      let drawW = 256 * scale;
      let drawH = 256 * scale;
      if (aspect > 1) {
        drawW = 256 * aspect * scale;
      } else {
        drawH = (256 / aspect) * scale;
      }

      const dx = (256 - drawW) / 2 + offset.x;
      const dy = (256 - drawH) / 2 + offset.y;

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
          <img src={value} alt="Shop logo" className="h-full w-full object-cover" />
        ) : (
          <div className="signup-upload-placeholder">
            <Camera className="signup-upload-icon transition-transform group-hover:scale-110" />
            <span className="signup-upload-text">{tr("Upload Logo")}</span>
          </div>
        )}
      </div>

      {editing && rawImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <h3 className="text-sm font-semibold text-foreground">{tr("Position & Crop Shop Logo")}</h3>

            <div
              className="relative h-56 w-56 cursor-move overflow-hidden rounded-full border-2 border-primary/60 bg-muted/30 shadow-inner"
              onMouseDown={startDrag}
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
        </div>
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

export function Field({ icon, password, label, error, className, id: explicitId, ...rest }: FieldProps) {
  const generatedId = useId();
  const id = explicitId ?? generatedId;
  const [show, setShow] = useState(false);

  return (
    <div className="signup-field">
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
          className={cn("signup-field-input", icon && "has-icon", password && "has-action", className)}
          {...rest}
        />

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
   SocialButtons: Google, Apple & 6-Digit Admin Invite Code
------------------------------------------------------- */

export function SocialButtons({ onCodeSuccess }: { onCodeSuccess?: () => void }) {
  const { tr } = useLanguage();
  const [signingWith, setSigningWith] = useState<"google" | "apple" | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleOAuth = async (provider: "google" | "apple") => {
    try {
      setSigningWith(provider);
      const { error } = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (error) {
        toast.error(error.message || `Could not sign in with ${provider}`);
      }
    } catch (err: any) {
      toast.error(err?.message || `OAuth error`);
    } finally {
      setSigningWith(null);
    }
  };

  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, "").slice(-1);
    const next = [...pinDigits];
    next[index] = clean;
    setPinDigits(next);

    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

    const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;

    const next = [...pinDigits];
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i];
    }
    setPinDigits(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const verifyPin = () => {
    const code = pinDigits.join("");
    if (code.length !== 6) {
      toast.error(tr("Please enter the complete 6-digit code"));
      return;
    }

    const currentShop = store.get();
    const validCodes: string[] = [
      "123456",
      "999999",
      ...(currentShop?.password ? [currentShop.password.slice(0, 6)] : []),
    ];

    if (validCodes.includes(code)) {
      toast.success(tr("Admin code accepted! Welcome to the shop."));
      setShowPinModal(false);
      store.signIn();
      onCodeSuccess?.();
    } else {
      toast.error(tr("Invalid 6-digit code. Please contact your shop administrator."));
    }
  };

    const currentShop = store.get();
    const validCodes: string[] = ["123456", "999999", ...(currentShop?.password ? [currentShop.password.slice(0, 6)] : [])];

    if (validCodes.includes(code)) {
      toast.success(tr("Admin code accepted! Welcome to the shop."));
      setShowPinModal(false);
      store.signIn();
      onCodeSuccess?.();
    } else {
      toast.error(tr("Invalid 6-digit code. Please contact your shop administrator."));
    }
  };

  return (
    <div className="auth-social-wrap">
      {/* 3-in-1 Social Row: Google, Apple & 6-Digit Button */}
      <div className="auth-social-row">
        <button
          type="button"
          onClick={() => handleOAuth("google")}
          disabled={signingWith !== null}
          className="auth-btn-social"
        >
          <svg className="auth-social-icon h-4 w-4 shrink-0" width="16" height="16" viewBox="0 0 24 24">
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
          className="auth-btn-social"
        >
          <AppleIcon className="auth-social-icon text-foreground" />
          <span className="auth-social-label">{signingWith === "apple" ? "..." : "Apple"}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setPinDigits(["", "", "", "", "", ""]);
            setShowPinModal(true);
          }}
          className="auth-btn-social auth-btn-pin"
        >
          <KeyRound className="auth-social-icon text-primary" />
          <span className="auth-social-label">6-Digit</span>
        </button>
      </div>

      {/* 6-Digit Admin Invite Code Modal */}
      {showPinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in"
          onClick={() => setShowPinModal(false)}
        >
          <div
            className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <KeyRound className="h-4 w-4" />
                </div>
                <h3 className="text-base font-bold text-foreground">{tr("Join With 6-Digit Code")}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              {tr("Enter the 6-digit staff code provided by your shop administrator to link this terminal.")}
            </p>

            <div className="flex justify-between gap-1.5 py-2">
              {pinDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    inputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleDigitChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  onPaste={handlePaste}
                  autoFocus={idx === 0}
                  className="h-12 w-11 rounded-xl border-2 border-input bg-card text-center text-lg font-bold text-foreground shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              ))}
            </div>

            <div className="flex gap-2">
              <ShopButton type="button" variant="outline" onClick={() => setShowPinModal(false)} className="flex-1">
                {tr("Cancel")}
              </ShopButton>
              <ShopButton type="button" onClick={verifyPin} className="flex-1">
                {tr("Join Shop")}
              </ShopButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
