import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps, CSSProperties } from "react";

import { cn } from "@/lib/cn";
import { parseHex, readableTextColor } from "@/lib/color";

const button3DVariants = cva(
  "btn-3d inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold select-none [&_svg]:shrink-0",
  {
    variants: {
      size: {
        md: "min-h-11 px-6 text-sm",
        lg: "min-h-14 px-7 text-base",
        xl: "min-h-16 px-8 text-lg",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { size: "lg" },
  },
);

export type Button3DProps = ComponentProps<"button"> &
  VariantProps<typeof button3DVariants> & {
    /**
     * Any CSS colour. Defaults to the quiz theme (--theme-primary).
     * With a hex colour, the text colour is picked automatically for contrast.
     */
    color?: string;
    /** Override the text colour (needed when `color` is not a hex value, e.g. a CSS variable). */
    textColor?: string;
    /** Keep the button visually pressed (e.g. a selected answer). */
    pressed?: boolean;
    asChild?: boolean;
  };

/** Pressable 3D pill for the player (prototype `.pv-nav-btn`, docs/05-design-system.md). */
export function Button3D({
  color,
  textColor,
  pressed,
  size,
  block,
  asChild,
  type,
  className,
  style,
  ...props
}: Button3DProps) {
  const Comp = asChild ? Slot.Root : "button";
  const fg = textColor ?? (color && parseHex(color) ? readableTextColor(color) : undefined);
  const vars = {
    ...(color && { "--btn-bg": color }),
    ...(fg && { "--btn-fg": fg }),
  } as CSSProperties;

  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      data-pressed={pressed || undefined}
      aria-pressed={pressed}
      className={cn(button3DVariants({ size, block }), className)}
      style={{ ...vars, ...style }}
      {...props}
    />
  );
}
