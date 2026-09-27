"use client";

import { Check, Flag, Maximize2, Minimize2, Play, Plus, Trash2, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { ItemMediaButton } from "@/components/editor/ItemMediaButton";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/id";

import type { EditorProps } from "../ui-types";
import {
  MAX_CHOICES,
  MAX_NODES,
  type BranchingConfig,
  type StoryChoice,
  type StoryNode,
} from "./definition";

// React Flow only loads in the editor — never in the participant's player bundle.
const FlowCanvas = dynamic(() => import("./FlowCanvas"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-surface-muted" />,
});

const SCORES = [0, 0.25, 0.5, 0.75, 1];

const snippet = (node: StoryNode, index: number) => {
  const text = node.text.trim();
  const label = node.ending ? node.ending.label.trim() || "Akhir cerita" : `Node ${index + 1}`;
  return text ? `${label}: ${text.length > 40 ? `${text.slice(0, 40)}…` : text}` : label;
};

export function BranchingEditor({ config, onChange, invalidPaths }: EditorProps<BranchingConfig>) {
  const [selectedId, setSelectedId] = useState<string | null>(config.startId || null);
  const [fullscreen, setFullscreen] = useState(false);
  const selectedIndex = config.nodes.findIndex((n) => n.id === selectedId);
  const index = selectedIndex === -1 ? 0 : selectedIndex;
  const node = config.nodes[index];
  const invalid = (path: string) => invalidPaths?.has(path) || undefined;
  const invalidNodes = new Set(
    [...(invalidPaths ?? [])].flatMap((p) => {
      const match = /^nodes\.(\d+)/.exec(p);
      return match ? [Number(match[1])] : [];
    }),
  );

  const setNodes = (nodes: StoryNode[], patch: Partial<BranchingConfig> = {}) =>
    onChange({ ...config, ...patch, nodes });
  const updateNode = (id: string, patch: (n: StoryNode) => StoryNode) =>
    setNodes(config.nodes.map((n) => (n.id === id ? patch(n) : n)));
  const updateChoice = (nodeId: string, choiceId: string, patch: Partial<StoryChoice>) =>
    updateNode(nodeId, (n) => ({
      ...n,
      choices: n.choices.map((c) => (c.id === choiceId ? { ...c, ...patch } : c)),
    }));

  /** A new empty node to the right of `from`; optionally wire `choiceId` to it. */
  function addNode(from?: StoryNode, choiceId?: string) {
    if (config.nodes.length >= MAX_NODES) return;
    const base = from ?? config.nodes.at(-1);
    const fresh: StoryNode = {
      id: createId(),
      text: "",
      x: (base?.x ?? 0) + 300,
      y:
        (base?.y ?? 0) +
        (choiceId ? (from?.choices.findIndex((c) => c.id === choiceId) ?? 0) * 140 : 160),
      ending: null,
      choices: [],
    };
    const nodes = config.nodes.map((n) =>
      from && choiceId && n.id === from.id
        ? {
            ...n,
            choices: n.choices.map((c) => (c.id === choiceId ? { ...c, targetId: fresh.id } : c)),
          }
        : n,
    );
    setNodes([...nodes, fresh], config.startId ? {} : { startId: fresh.id });
    setSelectedId(fresh.id);
  }

  function removeNode(id: string) {
    const nodes = config.nodes
      .filter((n) => n.id !== id)
      .map((n) => ({
        ...n,
        choices: n.choices.map((c) => (c.targetId === id ? { ...c, targetId: null } : c)),
      }));
    const startId =
      config.startId === id
        ? (nodes.find((n) => !n.ending)?.id ?? nodes[0]?.id ?? "")
        : config.startId;
    setNodes(nodes, { startId });
    setSelectedId(startId || null);
  }

  function setEnding(n: StoryNode, ending: boolean) {
    updateNode(n.id, (x) => ({ ...x, ending: ending ? { label: "", score: 1 } : null }));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={config.nodes.length >= MAX_NODES}
          onClick={() => addNode(node)}
        >
          <Plus /> Tambah node
        </Button>
        <div className="flex items-center gap-2">
          <Label htmlFor="branch-scoring" className="text-xs font-normal text-fg-muted">
            Penilaian
          </Label>
          <Select
            id="branch-scoring"
            value={config.scoring}
            aria-invalid={invalid("scoring")}
            onChange={(e) =>
              onChange({ ...config, scoring: e.target.value as BranchingConfig["scoring"] })
            }
            className="h-8 text-xs"
          >
            <option value="ending">Dari akhir cerita yang dicapai</option>
            <option value="choices">Dari setiap pilihan yang tepat</option>
          </Select>
        </div>
      </div>

      <div
        className={cn(
          "relative overflow-hidden border border-line",
          fullscreen ? "fixed inset-3 z-50 rounded-2xl shadow-pop" : "h-[440px] rounded-xl",
        )}
        onKeyDown={(e) => {
          if (e.key === "Escape" && fullscreen) setFullscreen(false);
        }}
      >
        <Button
          variant="secondary"
          size="sm"
          className="absolute top-2 right-2 z-10"
          onClick={() => setFullscreen(!fullscreen)}
        >
          {fullscreen ? <Minimize2 /> : <Maximize2 />}
          {fullscreen ? "Kecilkan" : "Layar penuh"}
        </Button>
        <FlowCanvas
          // Remount on resize so the view fits the new size.
          key={fullscreen ? "full" : "inline"}
          config={config}
          selectedId={node?.id ?? null}
          invalidNodes={invalidNodes}
          onSelect={setSelectedId}
          onMove={(id, x, y) => updateNode(id, (n) => ({ ...n, x, y }))}
          onConnect={(nodeId, choiceId, targetId) => updateChoice(nodeId, choiceId, { targetId })}
        />
      </div>
      <p className="text-xs text-fg-subtle">
        Seret titik di ujung pilihan ke node tujuan untuk menyambungkan. Semua juga bisa diatur
        lewat formulir di bawah.
      </p>

      {node && (
        <section
          aria-label="Detail node"
          className="flex flex-col gap-4 rounded-xl border border-line bg-surface-muted p-4"
        >
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Label htmlFor="branch-node">Node yang diedit</Label>
              <Select
                id="branch-node"
                value={node.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {config.nodes.map((n, i) => (
                  <option key={n.id} value={n.id}>
                    {n.id === config.startId ? "▶ " : ""}
                    {snippet(n, i)}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={node.id === config.startId || !!node.ending}
              onClick={() => onChange({ ...config, startId: node.id })}
            >
              <Play /> Jadikan awal
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={config.nodes.length <= 2}
              onClick={() => removeNode(node.id)}
            >
              <Trash2 /> Hapus node
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="branch-text">Isi cerita</Label>
              <ItemMediaButton
                media={node.media}
                onChange={(media) =>
                  updateNode(node.id, (n) => {
                    const next = { ...n, media };
                    if (!media) delete next.media;
                    return next;
                  })
                }
                label={`node ${index + 1}`}
              />
            </div>
            <Textarea
              id="branch-text"
              value={node.text}
              maxLength={1000}
              rows={3}
              placeholder={
                node.ending ? "Apa yang terjadi di akhir ini?" : "Situasi yang dihadapi peserta…"
              }
              aria-invalid={invalid(`nodes.${index}.text`)}
              onChange={(e) => updateNode(node.id, (n) => ({ ...n, text: e.target.value }))}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="branch-ending" className="inline-flex items-center gap-1.5">
              <Flag className="size-4" /> Akhir cerita
            </Label>
            <Switch
              id="branch-ending"
              checked={!!node.ending}
              disabled={node.id === config.startId}
              onCheckedChange={(on) => setEnding(node, on)}
            />
          </div>

          {node.ending ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="branch-ending-label">Nama akhir</Label>
                <Input
                  id="branch-ending-label"
                  value={node.ending.label}
                  maxLength={100}
                  placeholder="mis. Akhir bahagia"
                  onChange={(e) =>
                    updateNode(node.id, (n) => ({
                      ...n,
                      ending: { ...n.ending!, label: e.target.value },
                    }))
                  }
                />
              </div>
              {config.scoring === "ending" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="branch-ending-score">Nilai akhir ini</Label>
                  <Select
                    id="branch-ending-score"
                    value={node.ending.score}
                    onChange={(e) =>
                      updateNode(node.id, (n) => ({
                        ...n,
                        ending: { ...n.ending!, score: Number(e.target.value) },
                      }))
                    }
                  >
                    {SCORES.map((s) => (
                      <option key={s} value={s}>
                        {s * 100}%
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Pilihan</span>
              {invalid(`nodes.${index}`) && node.choices.length === 0 && (
                <p className="text-xs text-danger">Tambahkan pilihan atau jadikan akhir cerita.</p>
              )}
              <ol className="flex flex-col gap-2">
                {node.choices.map((choice, j) => (
                  <li
                    key={choice.id}
                    className="flex flex-col gap-2 rounded-lg bg-surface p-2 sm:flex-row sm:items-center"
                  >
                    <Input
                      value={choice.text}
                      maxLength={200}
                      placeholder={`Pilihan ${j + 1}`}
                      aria-label={`Teks pilihan ${j + 1}`}
                      aria-invalid={invalid(`nodes.${index}.choices.${j}.text`)}
                      onChange={(e) => updateChoice(node.id, choice.id, { text: e.target.value })}
                      className="sm:flex-1"
                    />
                    <div className="flex items-center gap-1">
                      <Select
                        value={choice.targetId ?? ""}
                        aria-label={`Tujuan pilihan ${j + 1}`}
                        aria-invalid={invalid(`nodes.${index}.choices.${j}.targetId`)}
                        onChange={(e) => {
                          if (e.target.value === "__new") addNode(node, choice.id);
                          else
                            updateChoice(node.id, choice.id, { targetId: e.target.value || null });
                        }}
                        className="w-48"
                      >
                        <option value="">→ Pilih tujuan…</option>
                        {config.nodes.map((n, i) =>
                          n.id === node.id ? null : (
                            <option key={n.id} value={n.id}>
                              → {snippet(n, i)}
                            </option>
                          ),
                        )}
                        <option value="__new">+ Node baru</option>
                      </Select>
                      {config.scoring === "choices" && (
                        <button
                          type="button"
                          onClick={() =>
                            updateChoice(node.id, choice.id, { correct: !choice.correct })
                          }
                          aria-pressed={choice.correct}
                          aria-label={`Pilihan ${j + 1} tepat`}
                          title="Tandai sebagai pilihan yang tepat"
                          className={cn(
                            "inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            choice.correct
                              ? "border-success bg-success text-white"
                              : "border-line-strong text-transparent hover:border-success hover:text-success",
                          )}
                        >
                          <Check className="size-4" strokeWidth={3} />
                        </button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Hapus pilihan ${j + 1}`}
                        onClick={() =>
                          updateNode(node.id, (n) => ({
                            ...n,
                            choices: n.choices.filter((c) => c.id !== choice.id),
                          }))
                        }
                      >
                        <X />
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
              {node.choices.length < MAX_CHOICES && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    updateNode(node.id, (n) => ({
                      ...n,
                      choices: [
                        ...n.choices,
                        { id: createId(), text: "", targetId: null, correct: false },
                      ],
                    }))
                  }
                >
                  <Plus /> Tambah pilihan
                </Button>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
