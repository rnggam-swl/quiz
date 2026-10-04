"use client";

import { useState } from "react";

import { QuizEditor } from "@/components/editor/QuizEditor";
import type { EditorAdapter, EditorInitialState } from "@/components/editor/types";
import { toDraftQuestions, type AiType, type GeneratedQuestion } from "@/lib/ai-questions";
import { mediaKindOf } from "@/lib/media";
import { createQuestion, type Question } from "@/questions/question";

import { sampleQuiz } from "../sample";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sample(): EditorInitialState {
  const { quiz, questions } = sampleQuiz();
  return {
    quiz,
    // An empty question at the end, to try the publish issues list.
    questions: [...questions, createQuestion("multiple_choice")],
    revision: 0,
    publishedRevision: null,
    latestVersion: null,
    slug: null,
  };
}

/** In-memory adapter with fake latency; ?fail in the URL makes every save fail (to see retries). */
function createFakeAdapter(): EditorAdapter {
  let revision = 0;
  let version = 0;
  const fail =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fail");
  return {
    async saveDraft(input) {
      await delay(400);
      if (fail) return { ok: false, error: "unknown" };
      if (input.baseRevision !== revision) return { ok: false, error: "conflict" };
      revision += 1;
      return { ok: true, revision };
    },
    async publish({ revision: base }) {
      await delay(500);
      if (base !== revision) return { ok: false, error: "conflict" };
      version += 1;
      return { ok: true, version, slug: "kuis-pengetahuan-umum-demo", revision };
    },
    async uploadMedia(file) {
      await delay(600);
      const kind = mediaKindOf(file.type) ?? "image";
      return { kind, url: URL.createObjectURL(file) };
    },
    // "Buat dengan AI" without calling Claude: a fixed answer after a pause.
    async generateQuestions(form) {
      await delay(1200);
      const topic = String(form.get("topic") ?? "").trim() || "contoh";
      const { questions, dropped } = toDraftQuestions(
        {
          questions: [
            {
              ...FAKE_AI,
              type: "multiple_choice",
              prompt: `Tentang ${topic}: ibu kota Indonesia saat ini?`,
              options: ["Jakarta", "Bandung", "Surabaya", "Medan"],
              correct_options: [1],
            },
            {
              ...FAKE_AI,
              type: "true_false",
              prompt: `Tentang ${topic}: air mendidih di 100 °C.`,
              is_true: true,
            },
            {
              ...FAKE_AI,
              type: "short_answer",
              prompt: "Planet terdekat dari Matahari?",
              accepted_answers: ["Merkurius"],
            },
            {
              ...FAKE_AI,
              type: "multiple_choice",
              prompt: "Soal tanpa kunci (dilewati)",
              options: ["A", "B"],
            },
          ],
        },
        form.getAll("types") as AiType[],
      );
      return { ok: true, questions, dropped, remaining: 19 };
    },
    // Bank soal: the sample questions, as if they were in another quiz.
    questionBank: {
      async tags() {
        await delay(200);
        const counts = new Map<string, number>();
        for (const q of bank()) for (const t of q.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
        return [...counts].map(([tag, uses]) => ({ tag, uses })).sort((a, b) => b.uses - a.uses);
      },
      async search({ text, tags, type, page }) {
        await delay(300);
        const found = bank().filter(
          (q) =>
            q.prompt.toLowerCase().includes(text.toLowerCase()) &&
            tags.every((t) => q.tags.includes(t)) &&
            (!type || q.type === type),
        );
        const items = found.slice(page * 5, page * 5 + 5).map((question) => ({
          question,
          quizTitle: "Kuis lain (contoh)",
        }));
        return { items, hasMore: found.length > page * 5 + 5 };
      },
    },
  };
}

const FAKE_AI: Omit<GeneratedQuestion, "type" | "prompt"> = {
  options: [],
  correct_options: [],
  is_true: false,
  accepted_answers: [],
  number_answer: 0,
  number_tolerance: 0,
  explanation: "Contoh penjelasan dari AI.",
};

/** Sample questions with tags, for the fake question bank. */
function bank(): Question[] {
  return sampleQuiz().questions.map((q, i) => ({
    ...q,
    tags: [i % 2 ? "ipa" : "umum", ...(i < 4 ? ["kelas-4"] : [])],
  }));
}

export function PlaygroundEditor() {
  const [initial] = useState(sample);
  const [adapter] = useState(createFakeAdapter);
  return <QuizEditor initial={initial} adapter={adapter} backHref="/playground" />;
}
