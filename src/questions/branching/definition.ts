import { z } from "zod";

import { createId } from "@/lib/id";
import { deriveSeed, shuffle } from "@/lib/seed-random";

import { mediaSchema, scoreResult, type MediaRef } from "../shared";
import type { Issue, QuestionDefinition } from "../types";

export const MAX_NODES = 30;
export const MAX_CHOICES = 4;
/** A longer path is a loop gone wrong (or a crafted answer). */
export const MAX_PATH = 100;

const id = z.string().min(1).max(40);
const coordinate = z.number().min(-10_000).max(10_000);

const choiceSchema = z.object({
  id,
  text: z.string().max(200),
  /** Node this choice leads to; null while the author hasn't connected it. */
  targetId: z.string().max(40).nullable(),
  /** Used by `scoring: "choices"`. */
  correct: z.boolean(),
});
export type StoryChoice = z.infer<typeof choiceSchema>;

const endingSchema = z.object({
  label: z.string().max(100),
  /** Credit for reaching this ending, 0..1 (used by `scoring: "ending"`). */
  score: z.number().min(0).max(1),
});

const nodeSchema = z.object({
  id,
  text: z.string().max(1000),
  media: mediaSchema.optional(),
  /** Position on the editor canvas. */
  x: coordinate,
  y: coordinate,
  /** Set = the story ends here (its choices are ignored). */
  ending: endingSchema.nullable(),
  choices: z.array(choiceSchema).max(MAX_CHOICES),
});
export type StoryNode = z.infer<typeof nodeSchema>;

export const BRANCHING_SCORING = ["ending", "choices"] as const;

const configSchema = z.object({
  startId: z.string().max(40),
  /**
   * `ending`: the ending reached decides the score (a short bad path can't tie a long
   * good one, the prototype's flaw). `choices`: correct choices / choices taken.
   */
  scoring: z.enum(BRANCHING_SCORING),
  nodes: z.array(nodeSchema).max(MAX_NODES),
});
export type BranchingConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ path: z.array(id).max(MAX_PATH) });
export type BranchingAnswer = z.infer<typeof answerSchema>;

export type PublicStoryNode = {
  id: string;
  text: string;
  media?: MediaRef;
  ending: { label: string } | null;
  choices: { id: string; text: string; targetId: string }[];
};
export type BranchingPublic = {
  startId: string;
  nodes: PublicStoryNode[];
  /** Only some nodes are here; the player asks the server for the next one (exams). */
  incremental?: boolean;
};

/** Anything shaped like a story graph: the full config or the participant's public copy. */
type Walkable = {
  startId: string;
  nodes: { id: string; ending: unknown; choices: { id: string; targetId: string | null }[] }[];
};
type NodeOf<S extends Walkable> = S["nodes"][number];

/**
 * Follow `path` (choice ids) from the start node. Null when it isn't a real path in
 * the graph — the server never trusts where the client says it ended up.
 */
export function walkStory<S extends Walkable>(
  story: S,
  path: readonly string[],
): { end: NodeOf<S>; taken: NodeOf<S>["choices"][number][] } | null {
  type Node = NodeOf<S>;
  type Choice = Node["choices"][number];
  const byId = new Map<string, Node>(story.nodes.map((n) => [n.id, n]));
  const start = byId.get(story.startId);
  if (!start) return null;
  let node: Node = start;
  const taken: Choice[] = [];
  for (const choiceId of path) {
    if (node.ending) return null;
    const choice: Choice | undefined = node.choices.find((c: Choice) => c.id === choiceId);
    const next: Node | undefined = choice?.targetId ? byId.get(choice.targetId) : undefined;
    if (!choice || !next) return null;
    taken.push(choice);
    node = next;
  }
  return { end: node, taken };
}

/** Node ids along `path` from the start (just the start node when the path is invalid). */
function visitedNodes(config: BranchingConfig, path: readonly string[]): Set<string> {
  const ids = new Set([config.startId]);
  for (const choice of walkStory(config, path)?.taken ?? []) {
    if (choice.targetId) ids.add(choice.targetId);
  }
  return ids;
}

/** An ending's name, else the start of its text, else "Node 3" — for messages. */
export function nodeLabel(node: StoryNode, index: number): string {
  const text = node.ending?.label.trim() || node.text.trim();
  return text ? `"${text.length > 30 ? `${text.slice(0, 30)}…` : text}"` : `Node ${index + 1}`;
}

/** Node ids reachable from `from` following choices (endings stop the walk). */
function reachable(nodes: StoryNode[], from: string[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set(from.filter((id) => byId.has(id)));
  const queue = [...seen];
  while (queue.length) {
    const node = byId.get(queue.shift()!)!;
    if (node.ending) continue;
    for (const c of node.choices) {
      if (c.targetId && byId.has(c.targetId) && !seen.has(c.targetId)) {
        seen.add(c.targetId);
        queue.push(c.targetId);
      }
    }
  }
  return seen;
}

/** Node ids from which some ending can still be reached. */
function canFinish(nodes: StoryNode[]): Set<string> {
  const done = new Set(nodes.filter((n) => n.ending).map((n) => n.id));
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (!done.has(n.id) && n.choices.some((c) => c.targetId && done.has(c.targetId))) {
        done.add(n.id);
        grew = true;
      }
    }
  }
  return done;
}

export const branching: QuestionDefinition<BranchingConfig, BranchingAnswer, BranchingPublic> = {
  type: "branching",
  label: "Cerita Bercabang",
  description: "Cerita interaktif: pilihan peserta menentukan akhir cerita.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "warn" },
    notes: {
      exam: "Di ujian, node dikirim satu per satu agar peserta tidak bisa mengintip cabang lain.",
      live: "Setiap peserta menempuh jalur berbeda, jadi tidak bisa dipandu bersama di layar.",
      battle_buzzer: "Cerita bercabang terlalu panjang untuk rebutan.",
      battle_royale: "Cerita bercabang terlalu panjang untuk royale.",
    },
    avgSeconds: 90,
    partialCredit: true,
  },

  defaults() {
    const good = createId();
    const bad = createId();
    const start = createId();
    const choice = (targetId: string, correct: boolean) => ({
      id: createId(),
      text: "",
      targetId,
      correct,
    });
    return {
      startId: start,
      scoring: "ending",
      nodes: [
        {
          id: start,
          text: "",
          x: 0,
          y: 80,
          ending: null,
          choices: [choice(good, true), choice(bad, false)],
        },
        {
          id: good,
          text: "",
          x: 300,
          y: 0,
          ending: { label: "Akhir baik", score: 1 },
          choices: [],
        },
        {
          id: bad,
          text: "",
          x: 300,
          y: 200,
          ending: { label: "Akhir buruk", score: 0 },
          choices: [],
        },
      ],
    };
  },

  validate(config) {
    const issues: Issue[] = [];
    const { nodes } = config;
    const startIndex = nodes.findIndex((n) => n.id === config.startId);
    if (startIndex === -1) {
      issues.push({ path: "startId", message: "Tentukan node awal cerita." });
    } else if (nodes[startIndex]!.ending) {
      issues.push({
        path: `nodes.${startIndex}`,
        message: "Node awal tidak boleh berupa akhir cerita.",
      });
    }
    if (!nodes.some((n) => n.ending)) {
      issues.push({ path: "nodes", message: "Cerita butuh minimal satu akhir (ending)." });
    }

    const ids = new Set(nodes.map((n) => n.id));
    nodes.forEach((node, i) => {
      if (!node.text.trim() && !node.media) {
        issues.push({ path: `nodes.${i}.text`, message: `Teks node ${i + 1} masih kosong.` });
      }
      if (node.ending) return;
      if (node.choices.length === 0) {
        issues.push({
          path: `nodes.${i}`,
          message: `${nodeLabel(node, i)} buntu: tambahkan pilihan atau jadikan akhir cerita.`,
        });
      }
      node.choices.forEach((choice, j) => {
        if (!choice.text.trim()) {
          issues.push({
            path: `nodes.${i}.choices.${j}.text`,
            message: `Pilihan ${j + 1} di ${nodeLabel(node, i)} masih kosong.`,
          });
        }
        if (!choice.targetId || !ids.has(choice.targetId)) {
          issues.push({
            path: `nodes.${i}.choices.${j}.targetId`,
            message: `Pilihan ${j + 1} di ${nodeLabel(node, i)} belum terhubung ke node tujuan.`,
          });
        }
      });
    });

    if (startIndex !== -1) {
      const seen = reachable(nodes, [config.startId]);
      const finish = canFinish(nodes);
      nodes.forEach((node, i) => {
        if (!seen.has(node.id)) {
          issues.push({
            path: `nodes.${i}`,
            message: `${nodeLabel(node, i)} tidak bisa dicapai dari node awal.`,
          });
        } else if (!finish.has(node.id)) {
          issues.push({
            path: `nodes.${i}`,
            message: `Dari ${nodeLabel(node, i)} cerita tidak pernah sampai ke akhir.`,
          });
        }
      });
    }

    if (config.scoring === "ending" && !nodes.some((n) => n.ending && n.ending.score > 0)) {
      issues.push({
        path: "scoring",
        message: "Beri nilai lebih dari 0 pada minimal satu akhir cerita.",
      });
    }
    if (
      config.scoring === "choices" &&
      !nodes.some((n) => !n.ending && n.choices.some((c) => c.correct))
    ) {
      issues.push({ path: "scoring", message: "Tandai minimal satu pilihan yang benar." });
    }
    return issues;
  },

  score(config, answer) {
    const walk = walkStory(config, answer.path);
    if (!walk?.end.ending) return scoreResult(0, 1);
    if (config.scoring === "ending") return scoreResult(walk.end.ending.score, 1);
    // Each choice counts once, so looping through a correct choice can't pad the ratio.
    const unique = new Map(walk.taken.map((c) => [c.id, c.correct]));
    const correct = [...unique.values()].filter(Boolean).length;
    return scoreResult(correct, Math.max(1, unique.size));
  },

  stripAnswers(config, { seed, shuffle: doShuffle, storyPath }) {
    const ids = new Set(config.nodes.map((n) => n.id));
    // Incremental: the start node plus every node the (valid) path passes through.
    const shown = storyPath && visitedNodes(config, storyPath);
    return {
      startId: config.startId,
      ...(storyPath && { incremental: true }),
      nodes: config.nodes
        .filter((node) => !shown || shown.has(node.id))
        .map((node): PublicStoryNode => {
          const choices = node.ending
            ? []
            : node.choices
                .filter((c) => c.targetId && ids.has(c.targetId))
                .map((c) => ({ id: c.id, text: c.text, targetId: c.targetId! }));
          return {
            id: node.id,
            text: node.text,
            ...(node.media && { media: node.media }),
            ending: node.ending ? { label: node.ending.label } : null,
            choices: doShuffle ? shuffle(choices, deriveSeed(seed, node.id)) : choices,
          };
        }),
    };
  },

  isAnswered(answer) {
    return (answer?.path.length ?? 0) > 0;
  },
};
