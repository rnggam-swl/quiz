"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  useConnection,
  type Dimensions,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type XYPosition,
} from "@xyflow/react";
import { Check, Flag, Play } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

import type { BranchingConfig, StoryNode } from "./definition";

type StoryNodeData = {
  node: StoryNode;
  index: number;
  isStart: boolean;
  invalid: boolean;
  scoring: BranchingConfig["scoring"];
};
type StoryFlowNode = Node<StoryNodeData, "story">;

export type FlowCanvasProps = {
  config: BranchingConfig;
  selectedId: string | null;
  /** Node indexes with publish issues, outlined in red. */
  invalidNodes: ReadonlySet<number>;
  onSelect: (nodeId: string) => void;
  onMove: (nodeId: string, x: number, y: number) => void;
  onConnect: (nodeId: string, choiceId: string, targetId: string) => void;
};

const DIRECTIONS: Record<string, string> = {
  up: "atas",
  down: "bawah",
  left: "kiri",
  right: "kanan",
};

const ariaLabelConfig = {
  "node.a11yDescription.default":
    "Tekan Enter atau Spasi untuk memilih node, lalu panah untuk menggesernya.",
  "node.a11yDescription.keyboardDisabled": "Tekan Enter atau Spasi untuk memilih node.",
  "node.a11yDescription.ariaLiveMessage": ({
    direction,
    x,
    y,
  }: {
    direction: string;
    x: number;
    y: number;
  }) => `Node digeser ke ${DIRECTIONS[direction] ?? direction}, posisi ${x}, ${y}.`,
  "edge.a11yDescription.default": "Tekan Enter atau Spasi untuk memilih sambungan.",
  "controls.ariaLabel": "Kontrol kanvas",
  "controls.zoomIn.ariaLabel": "Perbesar",
  "controls.zoomOut.ariaLabel": "Perkecil",
  "controls.fitView.ariaLabel": "Tampilkan semua node",
  "controls.interactive.ariaLabel": "Kunci atau buka kanvas",
  "minimap.ariaLabel": "Peta mini",
  "handle.ariaLabel": "Titik sambung",
};

function StoryNodeView({ id, data, selected }: NodeProps<StoryFlowNode>) {
  const { node, index, isStart, invalid, scoring } = data;
  // While a choice is being connected, the whole node accepts the drop ("easy connect"):
  // people let go over the node, not on its small dot.
  const isDropTarget = useConnection((c) => c.inProgress && c.fromNode.id !== id);
  return (
    <div
      className={cn(
        "relative w-56 overflow-visible rounded-xl border-2 bg-surface text-left text-fg shadow-card",
        selected
          ? "border-accent ring-2 ring-accent-soft"
          : invalid
            ? "border-danger"
            : "border-line",
        isDropTarget && "border-dashed border-accent",
      )}
    >
      <Handle
        type="target"
        id="in"
        position={Position.Left}
        className="size-3! border-2! border-surface! bg-fg-subtle!"
      />
      {isDropTarget && (
        <Handle
          type="target"
          id="drop"
          position={Position.Left}
          isConnectableStart={false}
          className="inset-0! z-10 size-auto! transform-none! rounded-xl! border-0! opacity-0"
        />
      )}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-t-[10px] px-3 py-1.5 text-xs font-semibold",
          node.ending ? "bg-theme text-on-theme" : "bg-surface-muted text-fg-muted",
        )}
      >
        {isStart && (
          <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 text-on-accent">
            <Play className="size-3" /> Awal
          </span>
        )}
        {node.ending && <Flag className="size-3.5" />}
        <span className="min-w-0 flex-1 truncate">
          {node.ending ? node.ending.label.trim() || "Akhir cerita" : `Node ${index + 1}`}
        </span>
        {node.ending && scoring === "ending" && (
          <span className="tabular-nums">{Math.round(node.ending.score * 100)}%</span>
        )}
      </div>
      <p className="line-clamp-3 px-3 py-2 text-sm">
        {node.text.trim() || <span className="text-fg-subtle italic">Teks kosong</span>}
      </p>
      {!node.ending && (
        <ul className="border-t border-line">
          {node.choices.map((choice, j) => (
            <li
              key={choice.id}
              className="relative flex items-center gap-1.5 border-b border-line px-3 py-1.5 pr-5 text-xs last:border-b-0"
            >
              <span className="min-w-0 flex-1 truncate">
                {choice.text.trim() || (
                  <span className="text-fg-subtle italic">Pilihan {j + 1}</span>
                )}
              </span>
              {scoring === "choices" && choice.correct && (
                <Check aria-label="benar" className="size-3.5 text-success" strokeWidth={3} />
              )}
              <Handle
                type="source"
                id={choice.id}
                position={Position.Right}
                className={cn(
                  "size-3! border-2! border-surface!",
                  choice.targetId ? "bg-accent!" : "bg-warning!",
                )}
              />
            </li>
          ))}
          {node.choices.length === 0 && (
            <li className="px-3 py-1.5 text-xs text-danger">Belum ada pilihan</li>
          )}
        </ul>
      )}
    </div>
  );
}

// Must be stable across renders, or React Flow remounts every node.
const nodeTypes = { story: StoryNodeView };

type Overlay = Record<string, { measured?: Dimensions; position?: XYPosition }>;

/**
 * The story as a flowchart: drag nodes around, drag from a choice's dot to a node
 * to connect it. Everything here can also be done from the form under the canvas.
 */
export default function FlowCanvas({
  config,
  selectedId,
  invalidNodes,
  onSelect,
  onMove,
  onConnect,
}: FlowCanvasProps) {
  // Nodes come from the config; this only holds measured sizes and in-flight drag positions.
  const [overlay, setOverlay] = useState<Overlay>({});

  const nodes: StoryFlowNode[] = config.nodes.map((node, index) => {
    const local = overlay[node.id];
    return {
      id: node.id,
      type: "story",
      position: local?.position ?? { x: node.x, y: node.y },
      ...(local?.measured && { measured: local.measured }),
      selected: node.id === selectedId,
      data: {
        node,
        index,
        isStart: node.id === config.startId,
        invalid: invalidNodes.has(index),
        scoring: config.scoring,
      },
    };
  });

  const ids = new Set(config.nodes.map((n) => n.id));
  const edges: Edge[] = config.nodes.flatMap((node) =>
    node.ending
      ? []
      : node.choices
          .filter((c) => c.targetId && ids.has(c.targetId))
          .map((c) => ({
            id: c.id,
            source: node.id,
            sourceHandle: c.id,
            target: c.targetId!,
            // Always anchor on the small dot, never on the temporary full-node drop target.
            targetHandle: "in",
            markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
            style: { strokeWidth: 2 },
          })),
  );

  function onNodesChange(changes: NodeChange<StoryFlowNode>[]) {
    const settled: { id: string; position: XYPosition }[] = [];
    setOverlay((prev) => {
      const next = { ...prev };
      for (const change of changes) {
        if (change.type === "dimensions" && change.dimensions) {
          next[change.id] = { ...next[change.id], measured: change.dimensions };
        } else if (change.type === "position" && change.position) {
          next[change.id] = {
            ...next[change.id],
            position: change.dragging ? change.position : undefined,
          };
        }
      }
      return next;
    });
    for (const change of changes) {
      // Drag end and keyboard moves arrive with dragging: false — that's when the config changes.
      if (change.type === "position" && change.position && !change.dragging) {
        settled.push({ id: change.id, position: change.position });
      }
      if (change.type === "select" && change.selected) onSelect(change.id);
    }
    for (const { id, position } of settled)
      onMove(id, Math.round(position.x), Math.round(position.y));
  }

  return (
    <ReactFlow<StoryFlowNode>
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onConnect={(c) => {
        if (c.sourceHandle && c.source !== c.target) onConnect(c.source, c.sourceHandle, c.target);
      }}
      isValidConnection={(c) => c.source !== c.target}
      deleteKeyCode={null}
      fitView
      // Never fit so small the text is unreadable; a big story pans instead.
      fitViewOptions={{ padding: 0.15, minZoom: 0.6, maxZoom: 1 }}
      minZoom={0.3}
      maxZoom={1.5}
      ariaLabelConfig={ariaLabelConfig}
      colorMode="system"
      className="bg-surface-muted"
    >
      <Background gap={20} />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
