import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

import { fieldClasses } from "./Input";

/**
 * Native <select>: keyboard- and screen-reader-friendly out of the box, and
 * uses the OS picker on phones.
 */
export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(fieldClasses, "h-9 cursor-pointer appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-fg-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
}
