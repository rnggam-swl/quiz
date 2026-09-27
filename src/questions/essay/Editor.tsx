"use client";

import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { createId } from "@/lib/id";

import type { EditorProps } from "../ui-types";
import { MAX_RUBRIC, MAX_WORD_LIMIT, type EssayConfig, type RubricItem } from "./definition";

/** Optional whole number: empty = no limit. */
function LimitInput({
  id,
  value,
  onValue,
  invalid,
}: {
  id: string;
  value: number | null;
  onValue: (value: number | null) => void;
  invalid?: boolean;
}) {
  return (
    <Input
      id={id}
      inputMode="numeric"
      value={value ?? ""}
      placeholder="Tanpa batas"
      aria-invalid={invalid || undefined}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        const n = digits ? Math.min(Number(digits), MAX_WORD_LIMIT) : null;
        onValue(n && n > 0 ? n : null);
      }}
    />
  );
}

export function EssayEditor({ config, onChange, invalidPaths }: EditorProps<EssayConfig>) {
  const setRubric = (rubric: RubricItem[]) => onChange({ ...config, rubric });
  const total = config.rubric.reduce((sum, r) => sum + r.points, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="essay-min">Minimal kata</Label>
          <LimitInput
            id="essay-min"
            value={config.minWords}
            onValue={(minWords) => onChange({ ...config, minWords })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="essay-max">Maksimal kata</Label>
          <LimitInput
            id="essay-max"
            value={config.maxWords}
            invalid={invalidPaths?.has("maxWords")}
            onValue={(maxWords) => onChange({ ...config, maxWords })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg">
          Rubrik penilaian{" "}
          <span className="font-normal text-fg-subtle">— total {total} poin rubrik</span>
        </span>
        <ol className="flex flex-col gap-2">
          {config.rubric.map((item, i) => (
            <li key={item.id} className="flex items-center gap-2">
              <Input
                value={item.criterion}
                maxLength={200}
                placeholder={`Kriteria ${i + 1}, mis. Ketepatan isi`}
                aria-label={`Kriteria ${i + 1}`}
                aria-invalid={invalidPaths?.has(`rubric.${i}.criterion`) || undefined}
                onChange={(e) =>
                  setRubric(
                    config.rubric.map((r) =>
                      r.id === item.id ? { ...r, criterion: e.target.value } : r,
                    ),
                  )
                }
              />
              <Input
                inputMode="numeric"
                value={item.points}
                aria-label={`Poin maksimal kriteria ${i + 1}`}
                className="w-20 text-center"
                onChange={(e) => {
                  const digits = Number(e.target.value.replace(/\D/g, ""));
                  const points = Math.min(100, Math.max(1, digits || 1));
                  setRubric(config.rubric.map((r) => (r.id === item.id ? { ...r, points } : r)));
                }}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Hapus kriteria ${i + 1}`}
                onClick={() => setRubric(config.rubric.filter((r) => r.id !== item.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
        {config.rubric.length < MAX_RUBRIC && (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() =>
              setRubric([...config.rubric, { id: createId(), criterion: "", points: 4 }])
            }
          >
            <Plus /> Tambah kriteria
          </Button>
        )}
        <p className="text-xs text-fg-subtle">
          Tanpa rubrik, guru memberi satu nilai 0–100% saat menilai.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="essay-guide">Panduan penilaian / contoh jawaban</Label>
        <Textarea
          id="essay-guide"
          rows={3}
          maxLength={2000}
          value={config.guide}
          placeholder="Poin-poin yang diharapkan ada di jawaban."
          onChange={(e) => onChange({ ...config, guide: e.target.value })}
        />
        <p className="text-xs text-fg-subtle">
          Tidak pernah dikirim ke peserta saat mengerjakan. Ditampilkan di review hanya jika jawaban
          benar boleh diperlihatkan.
        </p>
      </div>
    </div>
  );
}
