"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ReactNode } from "react";

/** Mount once near the root so tooltips share open/close delays. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={300}>{children}</TooltipPrimitive.Provider>;
}

type TooltipProps = {
  content: ReactNode;
  /** A single focusable element (button, link…). */
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
};

export function Tooltip({ content, children, side = "top" }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-md bg-fg px-2.5 py-1.5 text-xs text-canvas shadow-pop data-[state=delayed-open]:animate-fade-up"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-fg" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
