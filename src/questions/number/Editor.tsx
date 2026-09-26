"use client";

import { useState } from "react";

import { Input, Label } from "@/components/ui/Input";

import type { EditorProps } from "../ui-types";
import { parseNumberInput, type NumberConfig } from "./definition";

const formatNumber = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 6 });

/** Number field that keeps what the user typed ("3," while typing) and reports parsed values. */
function NumberInput({
  id,
  value,
  onValue,
  min,
}: {
  id: string;
  value: number;
  onValue: (value: number) => void;
  min?: number;
}) {
  const [text, setText] = useState(() => String(value).replace(".", ","));
  const parsed = parseNumberInput(text);
  const invalid = text.trim() !== "" && (parsed === null || (min !== undefined && parsed < min));

  return (
    <Input
      id={id}
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const next = parseNumberInput(e.target.value);
        if (next !== null && (min === undefined || next >= min)) onValue(next);
      }}
      onBlur={() => {
        if (text.trim() === "") {
          setText("0");
          onValue(0);
        }
      }}
      aria-invalid={invalid || undefined}
    />
  );
}

export function NumberEditor({ config, onChange }: EditorProps<NumberConfig>) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="num-value">Jawaban benar</Label>
        <NumberInput
          id="num-value"
          value={config.value}
          onValue={(value) => onChange({ ...config, value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="num-tolerance">Toleransi (±)</Label>
        <NumberInput
          id="num-tolerance"
          value={config.tolerance}
          min={0}
          onValue={(tolerance) => onChange({ ...config, tolerance })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="num-unit">Satuan (opsional)</Label>
        <Input
          id="num-unit"
          value={config.unit ?? ""}
          maxLength={20}
          placeholder="mis. cm, kg, °C"
          onChange={(e) => {
            const next: NumberConfig = { ...config, unit: e.target.value };
            if (!next.unit) delete next.unit;
            onChange(next);
          }}
        />
      </div>
      <p className="text-xs text-fg-subtle sm:col-span-3">
        Koma atau titik desimal sama-sama diterima.{" "}
        {config.tolerance > 0
          ? `Jawaban antara ${formatNumber(config.value - config.tolerance)} dan ${formatNumber(config.value + config.tolerance)} dianggap benar.`
          : `Jawaban harus tepat ${formatNumber(config.value)}.`}
      </p>
    </div>
  );
}
