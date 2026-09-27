"use client";

import { NumberInput } from "@/components/editor/NumberInput";
import { Input, Label } from "@/components/ui/Input";
import { formatNumber, unitSuffix } from "@/lib/format";
import { Switch } from "@/components/ui/Switch";

import type { EditorProps } from "../ui-types";
import { positionOf, type SliderConfig } from "./definition";

export function SliderEditor({ config, onChange, invalidPaths }: EditorProps<SliderConfig>) {
  const field = (
    key: "min" | "max" | "step" | "value" | "tolerance",
    label: string,
    accept?: (n: number) => boolean,
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`slider-${key}`}>{label}</Label>
      <NumberInput
        id={`slider-${key}`}
        value={config[key]}
        accept={accept}
        invalid={invalidPaths?.has(key)}
        onValue={(n) => onChange({ ...config, [key]: n })}
      />
    </div>
  );
  const unit = unitSuffix(config.unit);
  const range = config.max > config.min;
  const low = positionOf(config.value - config.tolerance, config);
  const high = positionOf(config.value + config.tolerance, config);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {field("min", "Minimum")}
        {field("max", "Maksimum")}
        {field("step", "Langkah", (n) => n > 0)}
        {field("value", "Jawaban benar")}
        {field("tolerance", "Toleransi (±)", (n) => n >= 0)}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slider-unit">Satuan (opsional)</Label>
          <Input
            id="slider-unit"
            value={config.unit ?? ""}
            maxLength={20}
            placeholder="mis. %, km, °C"
            onChange={(e) => {
              const next: SliderConfig = { ...config, unit: e.target.value };
              if (!next.unit) delete next.unit;
              onChange(next);
            }}
          />
        </div>
      </div>

      {range && (
        <div aria-hidden className="flex flex-col gap-2 rounded-xl bg-surface-muted p-4">
          <div className="relative h-2 rounded-full bg-line">
            <div
              className="absolute inset-y-0 rounded-full bg-success/40"
              style={{ left: `${low}%`, width: `${Math.max(high - low, 0)}%` }}
            />
            <div
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-success shadow-card"
              style={{ left: `${positionOf(config.value, config)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-fg-subtle tabular-nums">
            <span>
              {formatNumber(config.min)}
              {unit}
            </span>
            <span>
              {formatNumber(config.max)}
              {unit}
            </span>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="slider-partial">Nilai parsial</Label>
          <p className="text-xs text-fg-subtle">
            Jawaban yang mendekati tetap dapat sebagian nilai; habis di setengah rentang.
          </p>
        </div>
        <Switch
          id="slider-partial"
          checked={config.partial}
          onCheckedChange={(partial) => onChange({ ...config, partial })}
        />
      </div>

      <p className="text-xs text-fg-subtle">
        Peserta menggeser slider dari {formatNumber(config.min)} sampai {formatNumber(config.max)}{" "}
        (per {formatNumber(config.step)}).{" "}
        {config.tolerance > 0
          ? `Nilai ${formatNumber(config.value - config.tolerance)}–${formatNumber(config.value + config.tolerance)}${unit} dianggap benar.`
          : `Jawaban harus tepat ${formatNumber(config.value)}${unit}.`}
      </p>
    </div>
  );
}
