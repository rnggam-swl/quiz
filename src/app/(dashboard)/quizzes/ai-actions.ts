"use server";

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import type { AiResult } from "@/components/editor/types";
import {
  AI_LIMITS,
  AI_TYPES,
  generatedSchema,
  SYSTEM_PROMPT,
  toDraftQuestions,
  userPrompt,
  type AiRequest,
} from "@/lib/ai-questions";
import { aiDailyLimit, getAnthropicKey } from "@/lib/env.server";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Generate soal dengan AI (P8-10, docs/04-question-types.md#generate-soal-dengan-ai). The
// result is a list of drafts the teacher reviews in the editor; nothing is saved here.

const MODEL = "claude-opus-5-5";

const requestSchema = z.object({
  source: z.enum(["topic", "text", "pdf"]),
  topic: z.string().trim().max(300),
  text: z.string().max(AI_LIMITS.maxTextChars, "Teks terlalu panjang (maks. 60.000 karakter)."),
  count: z.coerce.number().int().min(1).max(AI_LIMITS.maxCount),
  types: z.array(z.enum(AI_TYPES)).min(1, "Pilih minimal satu tipe soal."),
  level: z.string().trim().max(60),
});

export async function generateQuestionsAction(form: FormData): Promise<AiResult> {
  const user = await requireHost();
  const apiKey = getAnthropicKey();
  if (!apiKey) return { ok: false, error: "Fitur AI belum diaktifkan di server ini." };

  const parsed = requestSchema.safeParse({
    source: form.get("source"),
    topic: form.get("topic") ?? "",
    text: form.get("text") ?? "",
    count: form.get("count"),
    types: form.getAll("types"),
    level: form.get("level") ?? "",
  });
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Tidak valid." };
  const request: AiRequest = parsed.data;
  if (request.source === "topic" && !request.topic) return { ok: false, error: "Tulis topiknya." };
  if (request.source === "text" && request.text.trim().length < 50) {
    return { ok: false, error: "Tempel bahan minimal satu paragraf." };
  }

  let pdf: string | null = null;
  if (request.source === "pdf") {
    const file = form.get("pdf");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pilih file PDF." };
    if (file.size > AI_LIMITS.maxPdfBytes) return { ok: false, error: "PDF maksimal 10 MB." };
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return { ok: false, error: "File ini bukan PDF." };
    }
    pdf = bytes.toString("base64");
  }

  // Daily limit per host: the model isn't free.
  const supabase = await createClient();
  const limit = aiDailyLimit();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count: used } = await supabase
    .from("ai_generations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if ((used ?? 0) >= limit) {
    return {
      ok: false,
      error: `Batas ${limit} kali generate per hari sudah tercapai. Coba lagi besok.`,
    };
  }

  const client = new Anthropic({ apiKey, timeout: 170_000, maxRetries: 1 });
  let message;
  try {
    message = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // A declined request is re-run on Anthropic's recommended fallback model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM_PROMPT,
      output_config: { effort: "medium", format: betaZodOutputFormat(generatedSchema) },
      messages: [
        {
          role: "user",
          content: [
            ...(pdf
              ? [
                  {
                    type: "document" as const,
                    source: {
                      type: "base64" as const,
                      media_type: "application/pdf" as const,
                      data: pdf,
                    },
                  },
                ]
              : []),
            { type: "text" as const, text: userPrompt(request) },
          ],
        },
      ],
    });
  } catch (error) {
    return { ok: false, error: apiError(error) };
  }

  if (message.stop_reason === "refusal") {
    return {
      ok: false,
      error: "AI menolak membuat soal dari bahan ini. Coba bahan atau topik lain.",
    };
  }
  if (message.stop_reason === "max_tokens" || !message.parsed_output) {
    return { ok: false, error: "Jawaban AI terpotong. Coba kurangi jumlah soal." };
  }

  const { questions, dropped } = toDraftQuestions(message.parsed_output, request.types);
  await supabase.from("ai_generations").insert({
    owner_id: user.id,
    source: request.source,
    model: message.model,
    question_count: questions.length,
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  });
  if (questions.length === 0) {
    return { ok: false, error: "AI tidak menghasilkan soal yang bisa dipakai. Coba lagi." };
  }
  return { ok: true, questions, dropped, remaining: Math.max(0, limit - (used ?? 0) - 1) };
}

function apiError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    return "AI sedang sibuk. Tunggu sebentar lalu coba lagi.";
  }
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return "Kunci API AI di server tidak valid. Hubungi admin.";
  }
  if (error instanceof Anthropic.BadRequestError) {
    return "Bahan tidak bisa diproses (PDF rusak, terkunci, atau terlalu banyak halaman).";
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return "AI terlalu lama menjawab. Coba kurangi jumlah soal.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Tidak bisa menghubungi layanan AI. Coba lagi.";
  }
  if (error instanceof Anthropic.APIError) {
    console.error("AI generation failed", error.status, error.message);
    return "Layanan AI sedang bermasalah. Coba lagi nanti.";
  }
  console.error("AI generation failed", error);
  return "Terjadi kesalahan. Coba lagi.";
}
