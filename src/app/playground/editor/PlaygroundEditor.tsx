"use client";

import { useState } from "react";

import { QuizEditor } from "@/components/editor/QuizEditor";
import type { EditorAdapter, EditorInitialState } from "@/components/editor/types";
import { mediaKindOf } from "@/lib/media";
import { createQuestion } from "@/questions/question";

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
  };
}

export function PlaygroundEditor() {
  const [initial] = useState(sample);
  const [adapter] = useState(createFakeAdapter);
  return <QuizEditor initial={initial} adapter={adapter} backHref="/playground" />;
}
