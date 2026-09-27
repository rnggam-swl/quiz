import { z } from "zod";

import { mediaSchema, scoreResult, type MediaRef } from "../shared";
import type { Issue, QuestionDefinition } from "../types";

export const MAX_SPOTS = 10;
export const SPOT_RADIUS = { min: 2, max: 25, default: 8 } as const;

const percent = z.number().min(0).max(100);

const spotSchema = z.object({
  id: z.string().min(1).max(40),
  /** Centre, in percent of the image width / height. */
  x: percent,
  y: percent,
  /** Radius in percent of the image width (circles stay round on any aspect ratio). */
  r: z.number().min(SPOT_RADIUS.min).max(SPOT_RADIUS.max),
  /** For the author only, e.g. "Mitokondria". */
  label: z.string().max(100).optional(),
});
export type Spot = z.infer<typeof spotSchema>;

const configSchema = z.object({
  image: mediaSchema.nullable(),
  /** Image height / width, measured when the author uploads it; needed to measure distances. */
  aspect: z.number().min(0.05).max(20),
  spots: z.array(spotSchema).max(MAX_SPOTS),
  /** Clicks a participant gets; null = one per spot. Clicks beyond it are ignored. */
  maxClicks: z
    .number()
    .int()
    .min(1)
    .max(MAX_SPOTS * 3)
    .nullable(),
});
export type HotspotConfig = z.infer<typeof configSchema>;

const clickSchema = z.object({ x: percent, y: percent });
export type HotspotClick = z.infer<typeof clickSchema>;

const answerSchema = z.object({ clicks: z.array(clickSchema).max(MAX_SPOTS * 3) });
export type HotspotAnswer = z.infer<typeof answerSchema>;

export type HotspotPublic = {
  image: MediaRef | null;
  aspect: number;
  spotCount: number;
  maxClicks: number;
};

export function allowedClicks(config: Pick<HotspotConfig, "spots" | "maxClicks">): number {
  return config.maxClicks ?? Math.max(1, config.spots.length);
}

/** Whether a click lands inside a spot, measuring in width-percent on both axes. */
export function hits(spot: Spot, click: HotspotClick, aspect: number): boolean {
  const dx = click.x - spot.x;
  const dy = (click.y - spot.y) * aspect;
  return Math.hypot(dx, dy) <= spot.r;
}

/** What each counted click did: found a new spot, hit one already found, or missed. */
export function judgeClicks(config: HotspotConfig, clicks: HotspotClick[]) {
  const found = new Set<string>();
  const results = clicks.slice(0, allowedClicks(config)).map((click) => {
    const spot = config.spots.find((s) => !found.has(s.id) && hits(s, click, config.aspect));
    if (spot) {
      found.add(spot.id);
      return { click, result: "found" as const, spotId: spot.id };
    }
    const again = config.spots.some((s) => hits(s, click, config.aspect));
    return { click, result: again ? ("repeat" as const) : ("miss" as const) };
  });
  return { found, results };
}

export const hotspot: QuestionDefinition<HotspotConfig, HotspotAnswer, HotspotPublic> = {
  type: "hotspot",
  label: "Hotspot",
  description: "Klik bagian gambar yang tepat.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok" },
    notes: {
      battle_buzzer: "Mengklik gambar di HP tidak cukup adil untuk rebutan.",
      battle_royale: "Mengklik gambar di HP tidak cukup adil untuk royale.",
    },
    avgSeconds: 25,
    partialCredit: true,
  },

  defaults() {
    return { image: null, aspect: 0.75, spots: [], maxClicks: null };
  },

  validate(config) {
    const issues: Issue[] = [];
    if (!config.image) {
      issues.push({ path: "image", message: "Unggah gambar untuk hotspot." });
      return issues;
    }
    if (config.spots.length === 0) {
      issues.push({ path: "spots", message: "Tandai minimal satu titik jawaban di gambar." });
    }
    if (config.maxClicks !== null && config.maxClicks < config.spots.length) {
      issues.push({
        path: "maxClicks",
        message: "Jatah klik lebih sedikit dari jumlah titik, jadi nilai penuh tidak mungkin.",
      });
    }
    return issues;
  },

  score(config, answer) {
    // Misses cost a found spot each, so clicking everywhere never pays (the prototype bug).
    const { found, results } = judgeClicks(config, answer.clicks);
    const misses = results.filter((r) => r.result === "miss").length;
    return scoreResult(Math.max(0, found.size - misses), config.spots.length);
  },

  stripAnswers(config) {
    return {
      image: config.image,
      aspect: config.aspect,
      spotCount: config.spots.length,
      maxClicks: allowedClicks(config),
    };
  },

  isAnswered(answer) {
    return (answer?.clicks.length ?? 0) > 0;
  },
};
