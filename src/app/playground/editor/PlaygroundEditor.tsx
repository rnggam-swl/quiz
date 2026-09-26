"use client";

import { useState } from "react";

import { QuizEditor } from "@/components/editor/QuizEditor";
import type { EditorAdapter, EditorInitialState } from "@/components/editor/types";
import { mediaKindOf } from "@/lib/media";
import { createQuestion, type Question } from "@/questions/question";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sample(): EditorInitialState {
  const mc = createQuestion("multiple_choice");
  const mcConfig = {
    options: [
      { id: "o1", text: "Jakarta" },
      { id: "o2", text: "Bandung" },
      { id: "o3", text: "Surabaya" },
      { id: "o4", text: "Nusantara" },
    ],
    correctIds: ["o1"],
    multiple: false,
  };
  const questions: Question[] = [
    {
      ...mc,
      prompt: "Apa ibu kota Indonesia pada tahun 2020?",
      config: mcConfig,
      explanation: "IKN baru ditetapkan sesudahnya.",
    },
    {
      ...createQuestion("true_false"),
      prompt: "Matahari terbit dari barat.",
      config: { correct: false },
    },
    {
      ...createQuestion("short_answer"),
      prompt: "Siapa proklamator kemerdekaan Indonesia bersama Hatta?",
      config: { accepted: ["Soekarno", "Sukarno"], caseSensitive: false, fuzzy: 1 },
    },
    {
      ...createQuestion("number"),
      prompt: "Berapa percepatan gravitasi bumi?",
      config: { value: 9.8, tolerance: 0.1, unit: "m/s²" },
    },
    {
      ...createQuestion("matching"),
      prompt: "Pasangkan hewan dengan kelompoknya.",
      config: {
        left: [
          { id: "L1", text: "Mamalia" },
          { id: "L2", text: "Reptil" },
        ],
        right: [
          { id: "R1", text: "Kucing" },
          { id: "R2", text: "Paus" },
          { id: "R3", text: "Kadal" },
          { id: "R4", text: "Batu" },
        ],
        pairs: [
          { leftId: "L1", rightId: "R1" },
          { leftId: "L1", rightId: "R2" },
          { leftId: "L2", rightId: "R3" },
        ],
      },
    },
    createQuestion("multiple_choice"),
  ];
  return {
    quiz: {
      id: "playground-quiz",
      title: "Kuis Pengetahuan Umum",
      description: "",
      coverUrl: null,
      theme: {},
    },
    questions,
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
