"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { resolvePolicy, type Policy } from "@/engine/policy";
import { requireHost } from "@/lib/auth";
import { embedOriginsSchema } from "@/lib/embed-origins";
import { generateEmbedSecret } from "@/lib/embed-token";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// Host-side sharing: the quiz's practice session (link, code) and embed settings.
// Everything runs as the host, so RLS keeps it to their own quizzes.

export type PracticeSettings = Pick<
  Policy,
  "feedback" | "shuffleQuestions" | "shuffleOptions" | "attempts"
>;

export type ShareState = {
  sessionId: string;
  code: string;
  settings: PracticeSettings;
  slug: string | null;
  embedOrigins: string[];
  hasEmbedSecret: boolean;
  visibility: Visibility;
};

export type Visibility = "private" | "unlisted" | "public";

type ShareResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const settingsSchema = z.object({
  feedback: z.enum(["instant", "end"]),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  attempts: z.number().int().min(0).max(10),
});

function settingsOf(policy: Policy): PracticeSettings {
  return {
    feedback: policy.feedback,
    shuffleQuestions: policy.shuffleQuestions,
    shuffleOptions: policy.shuffleOptions,
    attempts: policy.attempts,
  };
}

/** Get (or create) the quiz's practice session and its sharing settings. */
export async function getShareStateAction(
  quizId: string,
): Promise<ShareResult<{ state: ShareState }>> {
  const id = z.uuid().parse(quizId);
  await requireHost();
  const supabase = await createClient();

  // Returns one row (not a set), so no .single().
  const { data: session, error } = await supabase.rpc("ensure_practice_session", { p_quiz_id: id });
  if (error || !session?.code) {
    if (error?.message.includes("not_published")) {
      return { ok: false, error: "Publish quiz dulu sebelum dibagikan." };
    }
    return { ok: false, error: "Gagal menyiapkan sesi latihan." };
  }

  const [{ data: quiz }, { count }] = await Promise.all([
    supabase
      .from("quizzes")
      .select("slug, embed_allowed_origins, visibility")
      .eq("id", id)
      .single(),
    supabase
      .from("quiz_embed_secrets")
      .select("quiz_id", { count: "exact", head: true })
      .eq("quiz_id", id),
  ]);

  return {
    ok: true,
    state: {
      sessionId: session.id,
      code: session.code,
      settings: settingsOf(resolvePolicy("practice", session.policy)),
      slug: quiz?.slug ?? null,
      embedOrigins: quiz?.embed_allowed_origins ?? [],
      hasEmbedSecret: (count ?? 0) > 0,
      visibility: quiz?.visibility ?? "private",
    },
  };
}

/** Library (P8-11): private, unlisted (anyone with the link) or public (listed). */
export async function updateVisibilityAction(
  quizId: string,
  visibility: Visibility,
): Promise<ShareResult<{ visibility: Visibility }>> {
  const id = z.uuid().parse(quizId);
  const parsed = z.enum(["private", "unlisted", "public"]).safeParse(visibility);
  if (!parsed.success) return { ok: false, error: "Pilihan tidak valid." };
  await requireHost();
  const supabase = await createClient();
  const { error } = await supabase.from("quizzes").update({ visibility: parsed.data }).eq("id", id);
  if (error) return { ok: false, error: "Gagal menyimpan." };
  revalidatePath("/library");
  return { ok: true, visibility: parsed.data };
}

export async function updatePracticeSettingsAction(
  sessionId: string,
  settings: PracticeSettings,
): Promise<ShareResult<{ settings: PracticeSettings }>> {
  const id = z.uuid().parse(sessionId);
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: "Pengaturan tidak valid." };
  await requireHost();
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("sessions")
    .select("policy")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { ok: false, error: "Sesi tidak ditemukan." };
  const policy: Policy = { ...resolvePolicy("practice", current.policy), ...parsed.data };

  const { error } = await supabase
    .from("sessions")
    .update({ policy: policy as unknown as Json })
    .eq("id", id);
  if (error) return { ok: false, error: "Gagal menyimpan pengaturan." };
  return { ok: true, settings: settingsOf(policy) };
}

export async function updateEmbedOriginsAction(
  quizId: string,
  origins: string[],
): Promise<ShareResult<{ origins: string[] }>> {
  const id = z.uuid().parse(quizId);
  const parsed = embedOriginsSchema.safeParse(origins);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Domain tidak valid." };
  }
  await requireHost();
  const supabase = await createClient();
  const { error } = await supabase
    .from("quizzes")
    .update({ embed_allowed_origins: parsed.data })
    .eq("id", id);
  if (error) return { ok: false, error: "Gagal menyimpan domain." };
  return { ok: true, origins: parsed.data };
}

/** Show the embed secret (owner only, via RLS). */
export async function getEmbedSecretAction(
  quizId: string,
): Promise<ShareResult<{ secret: string | null }>> {
  const id = z.uuid().parse(quizId);
  await requireHost();
  const supabase = await createClient();
  const { data } = await supabase
    .from("quiz_embed_secrets")
    .select("secret")
    .eq("quiz_id", id)
    .maybeSingle();
  return { ok: true, secret: data?.secret ?? null };
}

/** Create or replace the embed secret. Tokens signed with the old one stop working. */
export async function rotateEmbedSecretAction(
  quizId: string,
): Promise<ShareResult<{ secret: string }>> {
  const id = z.uuid().parse(quizId);
  await requireHost();
  const supabase = await createClient();
  const secret = generateEmbedSecret();
  const { error } = await supabase
    .from("quiz_embed_secrets")
    .upsert({ quiz_id: id, secret, created_at: new Date().toISOString() });
  if (error) return { ok: false, error: "Gagal membuat secret." };
  return { ok: true, secret };
}
