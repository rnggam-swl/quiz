"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";

import type { EditorProps } from "../ui-types";
import { FUZZY_MIN_LENGTH, type ShortAnswerConfig } from "./definition";

export function ShortAnswerEditor({
  config,
  onChange,
  invalidPaths,
}: EditorProps<ShortAnswerConfig>) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function setAccepted(index: number, value: string) {
    onChange({ ...config, accepted: config.accepted.map((a, i) => (i === index ? value : a)) });
  }

  function add(afterIndex = config.accepted.length - 1) {
    const accepted = [...config.accepted];
    accepted.splice(afterIndex + 1, 0, "");
    onChange({ ...config, accepted });
    requestAnimationFrame(() => inputs.current[afterIndex + 1]?.focus());
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg-muted">
          Jawaban yang diterima{" "}
          <span className="font-normal text-fg-subtle">— tulis semua ejaan yang benar</span>
        </span>
        {invalidPaths?.has("accepted") && (
          <p className="text-xs text-danger">Isi minimal satu jawaban.</p>
        )}
        {config.accepted.map((answer, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              ref={(el) => {
                inputs.current[index] = el;
              }}
              value={answer}
              onChange={(e) => setAccepted(index, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  add(index);
                }
              }}
              placeholder={index === 0 ? "mis. Soekarno" : "Ejaan lain, mis. Sukarno"}
              aria-label={`Jawaban diterima ${index + 1}`}
              aria-invalid={invalidPaths?.has(`accepted.${index}`) || undefined}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Hapus jawaban ${index + 1}`}
              disabled={config.accepted.length <= 1}
              onClick={() =>
                onChange({ ...config, accepted: config.accepted.filter((_, i) => i !== index) })
              }
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => add()} className="self-start">
          <Plus /> Tambah ejaan lain
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface p-3">
          <Label htmlFor="sa-case" className="font-normal">
            Huruf besar/kecil harus sama
          </Label>
          <Switch
            id="sa-case"
            checked={config.caseSensitive}
            onCheckedChange={(caseSensitive) => onChange({ ...config, caseSensitive })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sa-fuzzy" className="font-normal">
            Toleransi salah ketik
          </Label>
          <Select
            id="sa-fuzzy"
            value={config.fuzzy}
            onChange={(e) =>
              onChange({ ...config, fuzzy: Number(e.target.value) as ShortAnswerConfig["fuzzy"] })
            }
          >
            <option value={0}>Harus persis</option>
            <option value={1}>Boleh 1 huruf salah</option>
            <option value={2}>Boleh 2 huruf salah</option>
          </Select>
          {config.fuzzy > 0 && (
            <p className="text-xs text-fg-subtle">
              Hanya untuk jawaban minimal {FUZZY_MIN_LENGTH} huruf.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
