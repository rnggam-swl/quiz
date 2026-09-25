"use client";

import type { CSSProperties } from "react";
import { Toaster as Sonner } from "sonner";

export { toast } from "sonner";

/** Mount once in the root layout; call `toast("…")` anywhere on the client. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      className="font-sans"
      style={
        {
          "--normal-bg": "var(--surface)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--line)",
          "--border-radius": "12px",
        } as CSSProperties
      }
    />
  );
}
