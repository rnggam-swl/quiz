"use client";

import { useState } from "react";

import { Input } from "@/components/ui/Input";
import { parseNumberInput } from "@/questions/number/definition";

/**
 * Number field that keeps what the user typed ("3," while typing) and reports parsed
 * values. Accepts Indonesian decimal commas.
 */
export function NumberInput({
  id,
  value,
  onValue,
  min,
  accept = (n) => min === undefined || n >= min,
  invalid,
}: {
  id: string;
  value: number;
  onValue: (value: number) => void;
  min?: number;
  /** Values the config schema allows; others stay in the field (marked) but aren't reported. */
  accept?: (value: number) => boolean;
  /** Highlight from a publish issue, on top of the field's own parse check. */
  invalid?: boolean;
}) {
  const [text, setText] = useState(() => String(value).replace(".", ","));
  const parsed = parseNumberInput(text);
  const unparsable = text.trim() !== "" && (parsed === null || !accept(parsed));

  return (
    <Input
      id={id}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const next = parseNumberInput(e.target.value);
        if (next !== null && accept(next)) onValue(next);
      }}
      onBlur={() => {
        // An emptied field snaps back to the last value the config actually holds.
        if (text.trim() === "") setText(String(value).replace(".", ","));
      }}
      aria-invalid={unparsable || invalid || undefined}
    />
  );
}
