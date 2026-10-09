"use server";

import { ApiError, FinishReason, GoogleGenAI, type Part } from "@google/genai";
import { z } from "zod";

import type { AiResult } from "@/components/editor/types";
import {
  AI_LIMITS,
  AI_TYPES,
  generatedSchema,
  geminiJsonSchema,
  SYSTEM_PROMPT,
  toDraftQuestions,
  userPrompt,
  type AiRequest,
} from "@/lib/ai-questions";
import { aiDailyLimit, geminiModel, getGeminiKey } from "@/lib/env.server";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Generate soal dengan AI (P8-10, docs/04-question-types.md#generate-soal-dengan-ai). The
// result is a list of drafts the teacher reviews in the editor; nothing is saved here.

const requestSchema = z.object({
  source: z.enum(["topic", "text", "pdf"]),
  topic: z.string().trim().max(300),
  text: z.string().max(AI_LIMITS.maxTextChars, "Teks terlalu panjang (maks. 60.000 karakter)."),
  count: z.coerce.number().int().min(1).max(AI_LIMITS.maxCount),
  types: z.array(z.enum(AI_TYPES)).min(1, "Pilih minimal satu tipe soal."),
  level: z.string().trim().max(60),
});

/** Gemini's structured output, built once. */
const RESPONSE_SCHEMA = geminiJsonSchema();

/** Finish reasons that mean the model wouldn't answer this material. */
const DECLINED = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

export async function generateQuestionsAction(form: FormData): Promise<AiResult> {
  const user = await requireHost();
  const apiKey = getGeminiKey();
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

  // Two tries of 80 s fit in the editor page's maxDuration (180 s).
  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 80_000, retryOptions: { attempts: 2 } },
  });
  const model = geminiModel();
  const parts: Part[] = [
    ...(pdf ? [{ inlineData: { mimeType: "application/pdf", data: pdf } }] : []),
    { text: userPrompt(request) },
  ];
  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_SCHEMA,
        // Thinking counts towards this too; 20 questions need a few thousand tokens.
        maxOutputTokens: 24_000,
      },
    });
  } catch (error) {
    return { ok: false, error: apiError(error) };
  }

  const finish = response.candidates?.[0]?.finishReason;
  if (response.promptFeedback?.blockReason || (finish && DECLINED.has(finish))) {
    return {
      ok: false,
      error: "AI menolak membuat soal dari bahan ini. Coba bahan atau topik lain.",
    };
  }
  if (finish === FinishReason.MAX_TOKENS) {
    return { ok: false, error: "Jawaban AI terpotong. Coba kurangi jumlah soal." };
  }
  const output = parseOutput(response.text);
  if (!output) return { ok: false, error: "Jawaban AI tidak bisa dibaca. Coba lagi." };

  const { questions, dropped } = toDraftQuestions(output, request.types);
  const usage = response.usageMetadata;
  await supabase.from("ai_generations").insert({
    owner_id: user.id,
    source: request.source,
    model: response.modelVersion ?? model,
    question_count: questions.length,
    input_tokens: usage?.promptTokenCount ?? null,
    // Thinking is billed as output.
    output_tokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
  });
  if (questions.length === 0) {
    return { ok: false, error: "AI tidak menghasilkan soal yang bisa dipakai. Coba lagi." };
  }
  return { ok: true, questions, dropped, remaining: Math.max(0, limit - (used ?? 0) - 1) };
}

/** The JSON Gemini returned, checked against the schema it was asked to follow. */
function parseOutput(text: string | undefined) {
  if (!text) return null;
  try {
    const result = generatedSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function apiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "AI sedang sibuk. Tunggu sebentar lalu coba lagi.";
    if (error.status === 401 || error.status === 403) {
      return "Kunci API AI di server tidak valid. Hubungi admin.";
    }
    if (error.status === 400) {
      return "Bahan tidak bisa diproses (PDF rusak, terkunci, atau terlalu banyak halaman).";
    }
    console.error("AI generation failed", error.status, error.message);
    return "Layanan AI sedang bermasalah. Coba lagi nanti.";
  }
  // The SDK aborts a try that runs past httpOptions.timeout.
  if (error instanceof Error && error.name === "AbortError") {
    return "AI terlalu lama menjawab. Coba kurangi jumlah soal.";
  }
  if (error instanceof TypeError) return "Tidak bisa menghubungi layanan AI. Coba lagi.";
  console.error("AI generation failed", error);
  return "Terjadi kesalahan. Coba lagi.";
}
