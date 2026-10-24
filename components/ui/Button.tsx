"use client";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export type ButtonVariant = "primary" | "ghost" | "quiet";
export type ButtonSize = "md" | "lg";

const BASE = "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition duration-tap ease-expo select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";
const SIZES: Record<ButtonSize, string> = { md: "h-12 px-5 text-[15px]", lg: "h-14 px-6 text-body font-semibold" };
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-polaris text-abyss hover:brightness-110",
  ghost: "border border-polaris/60 text-polaris hover:bg-nebula",
  quiet: "text-dust hover:text-star hover:bg-nebula/60",
};

/** Class string so a <Link> can look like a button. */
export function buttonClass({ variant = "primary", size = "md", className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(BASE, SIZES[size], VARIANTS[variant], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }>(
  function Button({ variant, size, className, type = "button", ...rest }, ref) {
    return <button ref={ref} type={type} className={buttonClass({ variant, size, className })} {...rest} />;
  },
);
Button.displayName = "Button";
