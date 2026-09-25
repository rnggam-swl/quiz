import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Public (browser-safe) env. Each variable is referenced by its full name so
 * Next.js can inline it into the client bundle. Parsed lazily so pages that
 * don't touch Supabase still build and render without a `.env.local`.
 */
export function getPublicEnv(): PublicEnv {
  return parseEnv(publicEnvSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
}

export function parseEnv<T extends z.ZodType>(schema: T, values: unknown): z.infer<T> {
  const result = schema.safeParse(values);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables:\n${problems}\nCopy .env.example to .env.local and fill in the values.`,
    );
  }
  return result.data;
}
