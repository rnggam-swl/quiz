"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

import { Button } from "./Button";

/** Read-only value with a copy button (links, codes, snippets). */
export function CopyField({
  value,
  label,
  multiline,
  className,
}: {
  value: string;
  label: string;
  multiline?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the text is selectable anyway.
    }
  }

  return (
    <div className={cn("flex items-start gap-2", className)}>
      {multiline ? (
        <pre
          aria-label={label}
          className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line bg-surface-muted p-3 font-mono text-xs leading-relaxed text-fg"
        >
          {value}
        </pre>
      ) : (
        <input
          readOnly
          value={value}
          aria-label={label}
          onFocus={(e) => e.target.select()}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-muted px-3 font-mono text-xs text-fg outline-none"
        />
      )}
      <Button
        variant="secondary"
        size="icon"
        onClick={copy}
        aria-label={`Salin ${label.toLowerCase()}`}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  );
}
