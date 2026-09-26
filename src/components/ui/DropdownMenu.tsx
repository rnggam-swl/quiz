"use client";

import { DropdownMenu as Menu } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-56 rounded-xl border border-line bg-surface p-1 text-fg shadow-pop data-[state=open]:animate-fade-up",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 text-sm outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-muted [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn("px-3 pt-2 pb-1 text-xs font-semibold text-fg-subtle", className)}
      {...props}
    />
  );
}
