"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE = "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition duration-fast select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 whitespace-nowrap";
const SIZES: Record<ButtonSize, string> = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-12 px-5 text-base" };
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-bg hover:bg-accentStrong",
  secondary: "border border-border bg-surface text-text hover:bg-surface2 hover:border-borderStrong",
  ghost: "text-muted hover:text-text hover:bg-surface2",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
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
