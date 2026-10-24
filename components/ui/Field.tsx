"use client";
import { forwardRef, type InputHTMLAttributes, type LabelHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

const FIELD = "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text placeholder:text-faint transition duration-fast hover:border-borderStrong focus:border-accent focus:outline-none disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(FIELD, "h-10", className)} {...rest} />;
});
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(FIELD, "min-h-24 py-2 leading-6", className)} {...rest} />;
});
Textarea.displayName = "Textarea";

export function Label({ className, hint, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label className={cn("mb-1.5 block text-xs font-medium text-muted", className)} {...rest}>
      {children}{hint && <span className="ml-1 font-normal text-faint">{hint}</span>}
    </label>
  );
}
