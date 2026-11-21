import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

const sizes = { default: "", sm: "h-8 w-auto px-3 text-xs", icon: "h-9 w-9 p-0" };

// Every variant except "bare" wears the shared glass-btn material (styles.css); tinted variants stay slightly translucent so the glass reads through.
const variants = {
  primary: "glass-btn bg-primary/85 text-primary-foreground glow hover:brightness-110",
  outline: "glass-btn border-2 border-primary/70 text-foreground hover:bg-primary/10",
  success: "glass-btn bg-success/85 text-success-foreground hover:brightness-110",
  bare: "bg-transparent text-foreground",
  default: "glass-btn bg-primary/85 text-primary-foreground hover:brightness-110",
  ghost: "glass-btn text-foreground hover:bg-muted",
};

export function ShopButton({ variant = "primary", size = "default", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button {...p} className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition active:scale-[0.98] disabled:opacity-50", variants[variant], sizes[size], className)} />
  );
}
