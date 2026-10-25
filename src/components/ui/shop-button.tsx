import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/utils";

const sizes = { default: "", sm: "h-8 w-auto px-3 text-xs", icon: "h-9 w-9 p-0" };

const variants = {
  primary: "bg-primary text-primary-foreground glow hover:brightness-110",
  outline: "border-2 border-primary/70 bg-transparent text-foreground hover:bg-primary/10",
  success: "bg-success text-success-foreground hover:brightness-110",
  bare: "bg-transparent text-foreground",
  default: "bg-primary text-primary-foreground hover:brightness-110",
  ghost: "bg-transparent text-foreground hover:bg-muted",
};

export function ShopButton({ variant = "primary", size = "default", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button {...p} className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-xl text-base font-semibold transition active:scale-[0.98] disabled:opacity-50", variants[variant], sizes[size], className)} />
  );
}
