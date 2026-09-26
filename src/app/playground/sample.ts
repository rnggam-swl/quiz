import type { QuizDraft } from "@/components/editor/types";
import { createQuestion, type Question } from "@/questions/question";

/** Demo quiz used by the dev playgrounds (one question of each type). */
export function sampleQuiz(): { quiz: QuizDraft; questions: Question[] } {
  const questions: Question[] = [
    {
      ...createQuestion("multiple_choice"),
      prompt: "Apa ibu kota Indonesia pada tahun 2020?",
      config: {
        options: [
          { id: "o1", text: "Jakarta" },
          { id: "o2", text: "Bandung" },
          { id: "o3", text: "Surabaya" },
          { id: "o4", text: "Nusantara" },
        ],
        correctIds: ["o1"],
        multiple: false,
      },
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
  ];
  return {
    quiz: {
      id: "playground-quiz",
      title: "Kuis Pengetahuan Umum",
      description: "Lima soal, satu dari tiap tipe.",
      coverUrl: null,
      theme: {},
    },
    questions,
  };
}
