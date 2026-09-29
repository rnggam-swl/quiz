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
