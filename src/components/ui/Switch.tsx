"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

/** On/off toggle (the prototype's `.tog`). Pair with a <Label htmlFor> or aria-label. */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full bg-line-strong p-[3px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-accent",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}
