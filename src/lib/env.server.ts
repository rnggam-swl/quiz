import "server-only";

import { z } from "zod";

import { getPublicEnv, parseEnv, type PublicEnv } from "./env";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

/** Server-only env (secret key). Importing this from a Client Component fails the build. */
export function getServerEnv(): PublicEnv & z.infer<typeof serverEnvSchema> {
  return {
    ...getPublicEnv(),
    ...parseEnv(serverEnvSchema, { SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY }),
  };
}

const participantSecretSchema = z.object({
  PARTICIPANT_TOKEN_SECRET: z.string().min(32, "Minimal 32 karakter acak."),
});

/** HMAC key for participant tokens (docs/02-architecture.md#identitas-peserta). */
export function getParticipantTokenSecret(): string {
  return parseEnv(participantSecretSchema, {
    PARTICIPANT_TOKEN_SECRET: process.env.PARTICIPANT_TOKEN_SECRET,
  }).PARTICIPANT_TOKEN_SECRET;
}

/** Bearer secret for /api/webhooks/dispatch (pg_cron ping or Vercel Cron). Optional. */
export function getCronSecret(): string | null {
  const secret = process.env.CRON_SECRET;
  return secret && secret.length >= 32 ? secret : null;
}

/** Gemini API key for "Buat dengan AI" (P8-10). Optional: without it the feature is hidden. */
export function getGeminiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  return key ? key : null;
}

/**
 * The Gemini model for "Buat dengan AI" (GEMINI_MODEL). Google retires models often, so a
 * replacement can be set without a code change.
 */
export function geminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash";
}

/** How many AI generations a host may run per 24 hours (AI_DAILY_LIMIT, default 20). */
export function aiDailyLimit(): number {
  const value = Number(process.env.AI_DAILY_LIMIT);
  return Number.isInteger(value) && value > 0 ? value : 20;
}
