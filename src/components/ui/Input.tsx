import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const fieldClasses =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-fg transition-colors outline-none hover:border-line-strong focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-soft focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger-soft";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(fieldClasses, "h-9", className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      rows={rows}
      className={cn(fieldClasses, "min-h-16 resize-y py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}
