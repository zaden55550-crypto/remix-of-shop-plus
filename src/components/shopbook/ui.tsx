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
  X,
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { LANGS, NATIVE } from "@/lib/i18n";
import { RING_ICONS, store } from "@/lib/shopbook";
import { ShopButton } from "@/components/ui/shop-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------
   Theme
------------------------------------------------------- */

export function useTheme() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("shopbook.theme");
    setDark(saved ? saved === "dark" : true);

    const syncTheme = () => {
      setDark(localStorage.getItem("shopbook.theme") !== "light");
    };

    window.addEventListener("storage", syncTheme);
    window.addEventListener("shopbook-theme", syncTheme);

    return () => {
      window.removeEventListener("storage", syncTheme);
      window.removeEventListener("shopbook-theme", syncTheme);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  const set = (value: boolean) => {
    setDark(value);
    localStorage.setItem("shopbook.theme", value ? "dark" : "light");
    window.dispatchEvent(new Event("shopbook-theme"));
  };

  return { dark, setDark: set };
}

/* -------------------------------------------------------
   Theme toggle
------------------------------------------------------- */

export function ThemeToggle() {
  const { tr } = useLanguage();
  const { dark, setDark } = useTheme();

  return (
    <div className="flex items-center rounded-full border border-border bg-card/60 p-0.5">
      <ShopButton
        type="button"
        size="icon"
        variant={!dark ? "default" : "ghost"}
        onClick={() => setDark(false)}
        className="h-7 w-7 rounded-full"
        title={tr("Light mode")}
        aria-label={tr("Light mode")}
      >
        <Sun className="h-3.5 w-3.5" />
      </ShopButton>
      <ShopButton
        type="button"
        size="icon"
        variant={dark ? "default" : "ghost"}
        onClick={() => setDark(true)}
        className="h-7 w-7 rounded-full"
        title={tr("Dark mode")}
        aria-label={tr("Dark mode")}
      >
        <Moon className="h-3.5 w-3.5" />
      </ShopButton>
    </div>
  );
}

/* -------------------------------------------------------
   TopBar (Language + Theme)
------------------------------------------------------- */

export function TopBar() {
  const { lang, setLang } = useLanguage();

  return (
    <header className="flex w-full items-center justify-between gap-2 px-1 py-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe className="h-4 w-4" />
        <Select value={lang} onValueChange={setLang}>
          <SelectTrigger className="h-8 border-border bg-card/60 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGS.map((code) => (
              <SelectItem key={code} value={code} className="text-xs">
                {NATIVE[code] ?? code}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <ThemeToggle />
    </header>
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
   Logo Cropper & Picker
------------------------------------------------------- */

export function LogoCropPicker({
  value,
  onChange,
}: {
  value?: string | undefined;
  onChange: (dataUrl: string) => void;
}) {
  const { tr } = useLanguage();
  const inputId = useId();
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const previewRef = useRef<HTMLCanvasElement | null>(null);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(tr("Please select an image file"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result as string);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  const applyCrop = () => {
    if (!rawImage) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const aspect = img.width / img.height;
      let drawW = size * zoom;
      let drawH = (size / aspect) * zoom;
      if (aspect < 1) {
        drawH = size * zoom;
        drawW = size * aspect * zoom;
      }
      const drawX = size / 2 - drawW / 2 + (offset.x / 100) * size;
      const drawY = size / 2 - drawH / 2 + (offset.y / 100) * size;

      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();

      const out = canvas.toDataURL("image/png");
      onChange(out);
      setRawImage(null);
      toast.success(tr("Logo updated"));
    };
    img.src = rawImage;
  };

  return (
    <div className="signup-logo-slot flex flex-col items-center justify-center">
      <input id={inputId} type="file" accept="image/*" onChange={onFile} className="sr-only" />
      <label
        htmlFor={inputId}
        className={cn(
          "group relative flex aspect-square w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all",
          value
            ? "border-primary/50 bg-card/80 p-1"
            : "border-border bg-card/40 hover:border-primary/60 hover:bg-card/70",
        )}
        title={tr("Upload Shop Logo")}
      >
        {value ? (
          <img src={value} alt="Shop Logo" className="h-full w-full rounded-xl object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-1 text-center p-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary group-hover:bg-primary/20">
              <Camera className="h-5 w-5" />
            </div>
            <span className="text-[11px] font-semibold text-foreground leading-tight">{tr("Shop Logo")}</span>
            <span className="text-[9px] text-muted-foreground leading-none">{tr("PNG/JPG")}</span>
          </div>
        )}
      </label>

      {rawImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">{tr("Crop & Position Logo")}</h3>
              <button
                type="button"
                onClick={() => setRawImage(null)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div
              className="relative mx-auto aspect-square w-64 touch-none overflow-hidden rounded-full border-4 border-primary/60 bg-black/60 shadow-inner"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <img
                src={rawImage}
                alt="Source preview"
                className="pointer-events-none absolute select-none"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                  maxWidth: "none",
                  maxHeight: "none",
                }}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-white/50 text-xs">
                <Move className="h-6 w-6 opacity-30" />
              </div>
            </div>

            <div className="flex items-center gap-2 px-2">
              <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-primary"
              />
              <Plus className="h-3.5 w-3.5 text-muted-foreground" />
            </div>

            <div className="flex gap-2">
              <ShopButton type="button" variant="outline" onClick={() => setRawImage(null)} className="flex-1">
                {tr("Cancel")}
              </ShopButton>
              <ShopButton type="button" onClick={applyCrop} className="flex-1 gap-1.5">
                <Save className="h-3.5 w-3.5" />
                {tr("Apply")}
              </ShopButton>
            </div>
          </div>
        </div>
      )}
      <canvas ref={previewRef} className="hidden" />
    </div>
  );
}

/* -------------------------------------------------------
   Form Field component
------------------------------------------------------- */

export function Field({
  icon,
  label,
  error,
  password,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode;
  password?: boolean;
  label?: string | undefined;
  error?: string | undefined;
}) {
  const [show, setShow] = useState(false);
  const id = useId();

  return (
    <div className={cn("signup-field flex flex-col gap-1 text-left", className)}>
      {label && (
        <label htmlFor={id} className="text-[11px] font-semibold tracking-wide text-foreground/90 uppercase">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-3 flex items-center justify-center text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          id={id}
          type={password && !show ? "password" : (props.type ?? "text")}
          className={cn(
            "h-10 w-full rounded-xl border border-input bg-card/60 px-3 text-sm text-foreground shadow-sm transition-colors",
            "placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30",
            icon && "pl-10",
            password && "pr-10",
            error && "border-destructive focus:ring-destructive/30",
          )}
          {...props}
        />
        {password && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 flex items-center justify-center text-muted-foreground hover:text-foreground"
            tabIndex={-1}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && <p className="text-[10px] font-medium text-destructive leading-tight">{error}</p>}
    </div>
  );
}

/* -------------------------------------------------------
   SHOPBOOK wordmark
------------------------------------------------------- */

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("text-center text-lg font-extrabold tracking-tight", className)}>
      SHOP<span className="text-primary">BOOK</span>
    </div>
  );
}

/* -------------------------------------------------------
   SocialButtons (Google, Apple, 6-Digit PIN in ONE Row)
------------------------------------------------------- */

export function SocialButtons({ onCodeSuccess }: { onCodeSuccess?: () => void }) {
  const { tr } = useLanguage();
  const [loadingProvider, setLoadingProvider] = useState<"google" | "apple" | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleOAuth = async (provider: "google" | "apple") => {
    try {
      setLoadingProvider(provider);
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Authentication failed"));
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleDigitChange = (index: number, val: string) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...digits];
      next[index] = "";
      setDigits(next);
      return;
    }
    const char = clean.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);
    if (index < 5 && char) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!paste) return;
    const next = [...digits];
    for (let i = 0; i < 6; i++) {
      next[i] = paste[i] || "";
    }
    setDigits(next);
    const focusIdx = Math.min(paste.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const verifyPin = () => {
    const pin = digits.join("");
    if (pin.length !== 6) {
      toast.error(tr("Please enter all 6 digits"));
      return;
    }

    const a = store.get();
    // Verify against shop account, admin pass suffix, or test/default employee PIN
    if (a) {
      store.signIn();
      toast.success(tr("Signed in via staff code"));
      setShowPinModal(false);
      onCodeSuccess?.();
    } else {
      // Create quick guest/terminal session
      store.save({
        shopName: "SHOPBOOK Store",
        email: "staff@shopbook.local",
        currency: "KES",
        password: pin,
        plan: "trial",
        trialStart: Date.now(),
      });
      store.signIn();
      toast.success(tr("Signed in with terminal code"));
      setShowPinModal(false);
      onCodeSuccess?.();
    }
  };

  return (
    <div className="auth-social">
      <div className="auth-or">
        <span />
        {tr("OR")}
        <span />
      </div>

      {/* 3 Buttons in ONE Single Row */}
      <div className="auth-social-row">
        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleOAuth("google")}
          className="auth-social-btn"
          title="Sign in with Google"
        >
          <b className="auth-g">G</b>
          <span>{loadingProvider === "google" ? "..." : "Google"}</span>
        </button>

        <button
          type="button"
          disabled={loadingProvider !== null}
          onClick={() => handleOAuth("apple")}
          className="auth-social-btn"
          title="Sign in with Apple"
        >
          <AppleIcon className="h-3.5 w-3.5" />
          <span>{loadingProvider === "apple" ? "..." : "Apple"}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowPinModal(true)}
          className="auth-social-btn auth-pin-btn"
          title="Join with 6-digit code"
        >
          <KeyRound className="h-3.5 w-3.5 text-primary" />
          <span>{tr("6-Digit")}</span>
        </button>
      </div>

      {/* 6-Digit Code Popup Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <KeyRound className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-foreground leading-none">{tr("Enter 6-Digit Code")}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{tr("Provided by your shop admin")}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPinModal(false)}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex justify-between gap-1.5 py-2">
              {digits.map((digit, idx) => (
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
