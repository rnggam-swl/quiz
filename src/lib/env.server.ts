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
