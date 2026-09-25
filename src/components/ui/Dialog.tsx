"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

type DialogContentProps = ComponentProps<typeof DialogPrimitive.Content> & {
  title: ReactNode;
  description?: ReactNode;
  /** Hide the corner ✕ (e.g. when the footer already has explicit actions). */
  hideClose?: boolean;
};

/** Modal with a required title, so every dialog is announced properly to screen readers. */
export function DialogContent({
  title,
  description,
  hideClose,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-fade-up" />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-5 text-fg shadow-pop focus:outline-none",
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-1 pr-8">
          <DialogPrimitive.Title className="text-base font-semibold">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-fg-muted">
              {description}
            </DialogPrimitive.Description>
          ) : (
            <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
          )}
        </div>
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            aria-label="Tutup"
            className="absolute top-3 right-3 inline-flex size-8 items-center justify-center rounded-lg text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg"
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}
