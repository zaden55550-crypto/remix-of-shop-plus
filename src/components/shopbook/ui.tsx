import { useEffect, useState, type CSSProperties, type InputHTMLAttributes, type ReactNode, useId } from "react";
import { Camera, Eye, EyeOff, Globe, Minus, Move, Plus, Save, Moon, Sun } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { LANGS, NATIVE } from "@/lib/i18n";
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
        variant="bare"
        aria-label={tr("Dark mode")}
        aria-pressed={dark}
        onClick={() => setDark(true)}
        className={cn(
          "grid h-7 w-9 place-items-center rounded-full transition",
          dark ? "bg-primary text-primary-foreground glow" : "text-muted-foreground",
        )}
      >
        <Moon className="h-4 w-4" />
      </ShopButton>

      <ShopButton
        variant="bare"
        aria-label={tr("Light mode")}
        aria-pressed={!dark}
        onClick={() => setDark(false)}
        className={cn(
          "grid h-7 w-9 place-items-center rounded-full transition",
          !dark ? "bg-primary text-primary-foreground glow" : "text-muted-foreground",
        )}
      >
        <Sun className="h-4 w-4" />
      </ShopButton>
    </div>
  );
}

/* -------------------------------------------------------
   Language and theme top bar
------------------------------------------------------- */

export function TopBar() {
  const { language, setLanguage, t, dir } = useLanguage();

  return (
    <div className="auth-topbar flex items-center justify-end gap-2">
      <ThemeToggle />

      <Select
        value={language}
        onValueChange={(value) => {
          const next = LANGS.find((lang) => lang === value);
          if (next) setLanguage(next);
        }}
        dir={dir}
      >
        <SelectTrigger aria-label={t("language")} className="h-9 w-auto gap-2 rounded-full bg-card/60">
          <Globe className="h-4 w-4 shrink-0" />
          <SelectValue />
        </SelectTrigger>

        <SelectContent>
          {LANGS.map((lang) => (
            <SelectItem key={lang} value={lang}>
              {NATIVE[lang]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/* -------------------------------------------------------
   Responsive master SHOPBOOK emblem

   Expected asset:
   public/shopbook/auth-brand-emblem.jpg

   The component API remains compatible with existing
   <BrandRing size={180} /> and <BrandRing size={300} /> calls.
------------------------------------------------------- */

export function BrandRing({ size = 220 }: { size?: number }) {
  return (
    <div className="auth-brand-emblem" style={{ "--emblem-size": `${size}px` } as CSSProperties}>
      <img
        src="/shopbook/auth-brand-emblem.jpg"
        alt="SHOPBOOK ERP"
        className="auth-brand-emblem-image"
        draggable={false}
      />
    </div>
  );
}

/* -------------------------------------------------------
   Simple shop logo picker
------------------------------------------------------- */

export function LogoPicker({ value, onChange }: { value?: string; onChange?: (value: string) => void }) {
  const { tr } = useLanguage();

  return (
    <label className="mx-auto flex w-fit cursor-pointer flex-col items-center gap-1.5">
      <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border-2 border-primary/70 glow">
        {value ? (
          <img src={value} alt={tr("Shop logo")} className="h-full w-full object-cover object-center" />
        ) : (
          <Camera className="h-7 w-7 text-primary" />
        )}
      </span>

      <span className="text-sm font-medium text-primary">{tr(value ? "Change logo" : "Upload shop logo")}</span>

      {onChange && (
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => onChange(String(reader.result));
            reader.readAsDataURL(file);
          }}
        />
      )}
    </label>
  );
}

/* -------------------------------------------------------
   Shop logo crop picker
------------------------------------------------------- */

export function LogoCropPicker({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const { tr } = useLanguage();

  const [source, setSource] = useState(value ?? "");
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);

  const save = async () => {
    if (!source) return;

    const image = new Image();
    image.src = source;

    try {
      await image.decode();
    } catch {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;

    const context = canvas.getContext("2d");
    if (!context) return;

    const scale = Math.max(320 / image.width, 320 / image.height) * zoom;

    const width = image.width * scale;
    const height = image.height * scale;

    context.drawImage(image, (320 - width) / 2 + x, (320 - height) / 2 + y, width, height);

    onChange(canvas.toDataURL("image/jpeg", 0.88));
  };

  return (
    <div className="logo-crop">
      <label className="logo-crop-pick">
        <span className="logo-crop-frame">
          {source ? (
            <img
              src={source}
              alt={tr("Shop logo")}
              style={{
                transform: `translate(${x}px, ${y}px) scale(${zoom})`,
              }}
            />
          ) : (
            <Camera className="h-7 w-7 text-primary" />
          )}
        </span>

        <span>{tr(source ? "Change logo" : "Upload shop logo")}</span>

        <input
          hidden
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            const reader = new FileReader();

            reader.onload = () => {
              setSource(String(reader.result));
              setZoom(1);
              setX(0);
              setY(0);
            };

            reader.readAsDataURL(file);
          }}
        />
      </label>

      {source && (
        <>
          <div className="logo-crop-controls">
            <Minus className="h-3 w-3" />

            <input
              aria-label={tr("Zoom")}
              type="range"
              min={1}
              max={4}
              step={0.05}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />

            <Plus className="h-3 w-3" />
          </div>

          <div className="logo-crop-actions">
            <ShopButton
              type="button"
              variant="outline"
              onClick={() => setX((current) => current - 10)}
              aria-label={tr("Move left")}
            >
              <Move className="h-3 w-3" /> ←
            </ShopButton>

            <ShopButton
              type="button"
              variant="outline"
              onClick={() => setY((current) => current - 10)}
              aria-label={tr("Move up")}
            >
              ↑
            </ShopButton>

            <ShopButton
              type="button"
              variant="outline"
              onClick={() => {
                setX(0);
                setY(0);
              }}
              aria-label={tr("Center")}
            >
              {tr("Center")}
            </ShopButton>

            <ShopButton type="button" onClick={() => void save()} aria-label={tr("Save")}>
              <Save className="h-3 w-3" />
            </ShopButton>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------
   Shared form field
------------------------------------------------------- */

export function Field({
  icon,
  password,
  className,
  label,
  error,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  icon?: ReactNode;
  password?: boolean;
  label?: string;
  error?: string;
}) {
  const [show, setShow] = useState(false);
  const { tr } = useLanguage();
  const generatedId = useId();
  const fieldId = id ?? generatedId;

  const box = (
    <div
      className={cn(
        "flex h-12 min-w-0 items-center gap-3 rounded-xl border border-input bg-card/40 px-3.5 focus-within:border-primary focus-within:glow",
        error && "border-destructive",
        !label && className,
      )}
    >
      {icon && (
        <span className="shrink-0 text-primary" aria-hidden="true">
          {icon}
        </span>
      )}

      <input
        id={fieldId}
        aria-label={label ? undefined : props.placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-err` : undefined}
        {...props}
        type={password ? (show ? "text" : "password") : props.type}
        onFocus={(event) => {
          props.onFocus?.(event);

          const element = event.currentTarget;
          window.setTimeout(() => {
            element.scrollIntoView({
              block: "center",
              behavior: "smooth",
            });
          }, 300);
        }}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
      />

      {password && (
        <ShopButton
          variant="bare"
          type="button"
          aria-label={tr(show ? "Hide password" : "Show password")}
          aria-controls={fieldId}
          aria-pressed={show}
          onClick={() => setShow((current) => !current)}
          className="h-auto w-auto shrink-0 p-0 text-muted-foreground"
        >
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </ShopButton>
      )}
    </div>
  );

  if (!label) return box;

  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <label htmlFor={fieldId} className="block truncate text-[13px] font-semibold text-foreground">
        {label}
      </label>

      {box}

      {error && (
        <p id={`${fieldId}-err`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
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
