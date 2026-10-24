"use client";
import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

const FIELD = "w-full rounded-lg border-2 border-border bg-surface px-3 text-sm text-text placeholder:text-faint transition duration-fast focus:outline-none focus:ring-[3px] focus:ring-accent disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(FIELD, "h-11", className)} {...rest} />;
});
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(FIELD, "min-h-24 py-2 leading-6", className)} {...rest} />;
});
Textarea.displayName = "Textarea";

export function Label({ className, hint, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label className={cn("mb-1.5 block font-heading text-xs font-bold text-text", className)} {...rest}>
      {children}{hint && <span className="ml-1 font-sans font-normal text-muted">{hint}</span>}
    </label>
  );
}
