import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about our custom colour tokens so `text-fg` and `text-sm`
// aren't treated as conflicting classes (and vice versa for bg/border tokens).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: [
        "canvas",
        "surface",
        "surface-muted",
        "line",
        "line-strong",
        "fg",
        "fg-muted",
        "fg-subtle",
        "fg-placeholder",
        "accent",
        "accent-hover",
        "accent-fg",
        "accent-soft",
        "on-accent",
        "success",
        "success-soft",
        "warning",
        "warning-soft",
        "danger",
        "danger-soft",
        "theme",
        "on-theme",
        "theme-bg",
        "answer-1",
        "answer-2",
        "answer-3",
        "answer-4",
        "answer-5",
        "on-answer-1",
        "on-answer-2",
        "on-answer-3",
        "on-answer-4",
        "on-answer-5",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
