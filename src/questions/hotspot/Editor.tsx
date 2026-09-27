"use client";

import { ImagePlus, LoaderCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

import { useMediaUpload } from "@/components/editor/useMediaUpload";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/id";
import { MEDIA_RULES } from "@/lib/media";

import type { EditorProps } from "../ui-types";
import { MAX_SPOTS, SPOT_RADIUS, type HotspotConfig, type Spot } from "./definition";

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Height / width of an image, so hit tests can measure in one unit on both axes. */
async function measureAspect(url: string): Promise<number> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return clamp(img.naturalHeight / img.naturalWidth || 0.75, 0.05, 20);
}

export function HotspotEditor({ config, onChange, invalidPaths }: EditorProps<HotspotConfig>) {
  const { upload, uploading } = useMediaUpload();
  const fileInput = useRef<HTMLInputElement>(null);
  const labels = useRef(new Map<string, HTMLInputElement>());
  const [selected, setSelected] = useState<string | null>(null);

  const setSpots = (spots: Spot[]) => onChange({ ...config, spots });
  const updateSpot = (id: string, patch: Partial<Spot>) =>
    setSpots(config.spots.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function pickImage(file: File) {
    const ref = await upload(file, "image");
    if (!ref) return;
    const aspect = await measureAspect(ref.url).catch(() => config.aspect);
    onChange({ ...config, image: { ...ref, alt: config.image?.alt ?? "" }, aspect });
  }

  function addSpot(x: number, y: number) {
    if (config.spots.length >= MAX_SPOTS) return;
    const spot = { id: createId(), x: round1(x), y: round1(y), r: SPOT_RADIUS.default };
    setSpots([...config.spots, spot]);
    setSelected(spot.id);
  }

  function onImageClick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    addSpot(
      clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
    );
  }

  function onSpotKey(e: KeyboardEvent<HTMLButtonElement>, spot: Spot) {
    const step = e.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      updateSpot(spot.id, {
        x: round1(clamp(spot.x + move[0], 0, 100)),
        y: round1(clamp(spot.y + move[1], 0, 100)),
      });
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      setSpots(config.spots.filter((s) => s.id !== spot.id));
    }
  }

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept={MEDIA_RULES.image.types.join(",")}
      className="sr-only"
      tabIndex={-1}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (file) void pickImage(file);
      }}
    />
  );

  if (!config.image) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-line-strong p-8 text-center",
          invalidPaths?.has("image") && "border-danger",
        )}
      >
        {fileField}
        <p className="text-sm text-fg-muted">
          Unggah gambar, lalu klik bagian-bagian yang harus ditemukan peserta.
        </p>
        <Button onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
          {uploading ? "Mengunggah…" : "Unggah gambar"}
        </Button>
      </div>
    );
  }

  // From one click per spot up to 10 more, keeping a stored value that's now too low visible.
  const base = Math.max(1, config.spots.length);
  const clickOptions = [
    ...new Set([
      ...(config.maxClicks ? [config.maxClicks] : []),
      ...Array.from({ length: 10 }, (_, i) => base + i).filter((n) => n <= MAX_SPOTS * 3),
    ]),
  ].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-4">
      {fileField}
      <p className="text-sm text-fg-muted">
        Klik gambar untuk menambah titik jawaban. Pilih titik lalu pakai tombol panah untuk
        menggesernya (Shift = lebih jauh), Delete untuk menghapus.
      </p>
      <div
        onClick={onImageClick}
        className={cn(
          "relative cursor-crosshair overflow-hidden rounded-xl border border-line select-none",
          invalidPaths?.has("spots") && "ring-2 ring-danger",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- user upload from Storage */}
        <img
          src={config.image.url}
          alt={config.image.alt ?? ""}
          draggable={false}
          className="block h-auto w-full"
        />
        {config.spots.map((spot, i) => (
          <button
            key={spot.id}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSelected(spot.id);
              labels.current.get(spot.id)?.focus();
            }}
            onFocus={() => setSelected(spot.id)}
            onKeyDown={(e) => onSpotKey(e, spot)}
            aria-label={`Titik ${i + 1}${spot.label ? ` (${spot.label})` : ""}, posisi ${Math.round(spot.x)}%, ${Math.round(spot.y)}%`}
            className={cn(
              "absolute flex aspect-square min-w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-bold text-white",
              selected === spot.id
                ? "border-white bg-accent/60 ring-2 ring-accent"
                : "border-white bg-accent/35 hover:bg-accent/50",
            )}
            style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.r * 2}%` }}
          >
            <span className="rounded-full bg-accent px-1.5 shadow-card">{i + 1}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={config.spots.length >= MAX_SPOTS}
          onClick={() => addSpot(50, 50)}
        >
          <Plus /> Titik di tengah
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={uploading}
          onClick={() => fileInput.current?.click()}
        >
          {uploading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />} Ganti gambar
        </Button>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hotspot-alt">Deskripsi gambar (alt)</Label>
        <Input
          id="hotspot-alt"
          value={config.image.alt ?? ""}
          maxLength={300}
          placeholder="mis. Diagram sel hewan"
          onChange={(e) =>
            onChange({ ...config, image: { ...config.image!, alt: e.target.value } })
          }
        />
      </div>

      {config.spots.length > 0 && (
        <ol className="flex flex-col gap-2" aria-label="Titik jawaban">
          {config.spots.map((spot, i) => (
            <li
              key={spot.id}
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-xl border bg-surface p-2",
                selected === spot.id ? "border-accent" : "border-line",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-on-accent">
                {i + 1}
              </span>
              <Input
                ref={(el) => {
                  if (el) labels.current.set(spot.id, el);
                  else labels.current.delete(spot.id);
                }}
                value={spot.label ?? ""}
                maxLength={100}
                placeholder="Label (untuk guru, opsional)"
                aria-label={`Label titik ${i + 1}`}
                onFocus={() => setSelected(spot.id)}
                onChange={(e) => {
                  const next: Spot = { ...spot, label: e.target.value };
                  if (!next.label) delete next.label;
                  setSpots(config.spots.map((s) => (s.id === spot.id ? next : s)));
                }}
                className="min-w-40 flex-1"
              />
              <label className="flex items-center gap-2 text-xs text-fg-muted">
                Ukuran
                <input
                  type="range"
                  min={SPOT_RADIUS.min}
                  max={SPOT_RADIUS.max}
                  value={spot.r}
                  onChange={(e) => updateSpot(spot.id, { r: Number(e.target.value) })}
                  aria-label={`Ukuran titik ${i + 1}`}
                  className="w-24 accent-accent"
                />
              </label>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSpots(config.spots.filter((s) => s.id !== spot.id))}
                aria-label={`Hapus titik ${i + 1}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hotspot-clicks">Jatah klik peserta</Label>
        <Select
          id="hotspot-clicks"
          value={config.maxClicks ?? ""}
          aria-invalid={invalidPaths?.has("maxClicks") || undefined}
          onChange={(e) =>
            onChange({ ...config, maxClicks: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">Sama dengan jumlah titik ({config.spots.length || 1})</option>
          {clickOptions.map((n) => (
            <option key={n} value={n}>
              {n} klik
            </option>
          ))}
        </Select>
        <p className="text-xs text-fg-subtle">
          Klik yang meleset mengurangi nilai, jadi mengklik seluruh gambar tidak menguntungkan.
        </p>
      </div>
    </div>
  );
}
