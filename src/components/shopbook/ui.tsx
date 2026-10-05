import { useEffect, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Camera, Eye, EyeOff, Globe, Moon, Sun, ChevronDown } from "lucide-react";
import { RING_ICONS } from "@/lib/shopbook";
import { cn } from "@/lib/utils";

export function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("shopbook.theme");
    setDark(saved ? saved === "dark" : true);
    const syncTheme = () => setDark(localStorage.getItem("shopbook.theme") !== "light");
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
  const set = (d: boolean) => {
    setDark(d);
    localStorage.setItem("shopbook.theme", d ? "dark" : "light");
    window.dispatchEvent(new Event("shopbook-theme"));
  };
  return { dark, setDark: set };
}

export function ThemeToggle() {
  const { dark, setDark } = useTheme();
  return (
    <div className="flex items-center rounded-full border border-border bg-card/60 p-0.5">
      <button aria-label="Dark mode" onClick={() => setDark(true)}
        className={cn("grid h-7 w-9 place-items-center rounded-full transition", dark ? "bg-primary text-primary-foreground glow" : "text-muted-foreground")}>
        <Moon className="h-4 w-4" />
      </button>
      <button aria-label="Light mode" onClick={() => setDark(false)}
        className={cn("grid h-7 w-9 place-items-center rounded-full transition", !dark ? "bg-primary text-primary-foreground glow" : "text-muted-foreground")}>
        <Sun className="h-4 w-4" />
      </button>
    </div>
  );
}

export function TopBar() {
  return (
    <div className="flex justify-end gap-2 px-4 pt-4">
      <ThemeToggle />
      <button className="flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 text-sm">
        <Globe className="h-4 w-4" /> English <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function BrandRing({ size = 220 }: { size?: number }) {
  const r = size / 2 - 22;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full glow-ring" />
      <div className="absolute inset-0 spin-slow">
        {RING_ICONS.map((src, i) => {
          const a = (i / RING_ICONS.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <img key={i} src={src} alt="" className="absolute h-9 w-9 rounded-xl counter-spin"
              style={{ left: `${(size / 2 + Math.cos(a) * r - 18).toFixed(3)}px`, top: `${(size / 2 + Math.sin(a) * r - 18).toFixed(3)}px` }} />
          );
        })}
      </div>
      <div className="absolute inset-[30%] grid place-items-center rounded-full border border-primary/60 bg-card/50 glow">
        <span className="text-center text-sm font-extrabold leading-tight tracking-tight">
          SHOP<span className="text-primary">BOOK</span>
        </span>
      </div>
    </div>
  );
}

export function LogoPicker({ value, onChange }: { value?: string | undefined; onChange?: (v: string) => void }) {
  return (
    <label className="mx-auto flex w-fit cursor-pointer flex-col items-center gap-1.5">
      <span className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border-2 border-primary/70 glow">
        {value ? <img src={value} alt="Shop logo" className="h-full w-full object-cover object-center" /> : <Camera className="h-7 w-7 text-primary" />}
      </span>
      <span className="text-sm font-medium text-primary">{value ? "Change logo" : "Upload shop logo"}</span>
      {onChange && (
        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0]; if (!f) return;
          const r = new FileReader(); r.onload = () => onChange(String(r.result)); r.readAsDataURL(f);
        }} />
      )}
    </label>
  );
}

export function Field({ icon, password, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; password?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className={cn("flex h-12 items-center gap-3 rounded-xl border border-input bg-card/40 px-3.5 focus-within:border-primary focus-within:glow", className)}>
      {icon && <span className="text-primary">{icon}</span>}
      <input {...props} type={password ? (show ? "text" : "password") : props.type}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
      {password && (
        <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)} className="text-muted-foreground">
          {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
        </button>
      )}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <div className={cn("text-center text-lg font-extrabold tracking-tight", className)}>SHOP<span className="text-primary">BOOK</span></div>;
}
