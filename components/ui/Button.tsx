"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE = "inline-flex items-center justify-center gap-2 rounded-full font-heading font-bold tracking-tight select-none disabled:pointer-events-none disabled:opacity-40 whitespace-nowrap";
const SIZES: Record<ButtonSize, string> = { sm: "h-8 px-3.5 text-xs", md: "h-10 px-5 text-sm", lg: "h-12 px-6 text-base" };
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "press border-2 border-border bg-accent text-ink shadow-hard hover:bg-accentStrong",
  secondary: "press-sm border-2 border-border bg-surface text-ink shadow-hardSm hover:bg-surface2",
  ghost: "border-2 border-transparent text-muted transition duration-fast hover:border-border hover:bg-surface hover:text-text",
  danger: "press-sm border-2 border-border bg-pink text-ink shadow-hardSm hover:bg-danger",
};

/** Class string so a <Link> can look like a button. */
export function buttonClass({ variant = "primary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(BASE, SIZES[size], VARIANTS[variant], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; loading?: boolean }>(
  function Button({ variant, size, className, type = "button", loading, children, disabled, ...rest }, ref) {
    return (
      <button ref={ref} type={type} className={buttonClass({ variant, size, className })} disabled={disabled || loading} {...rest}>
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
