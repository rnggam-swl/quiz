import type { QuizDraft } from "@/components/editor/types";
import { createQuestion, type Question } from "@/questions/question";

// A 2:1 picture with a red circle and a blue square, for the hotspot demo.
const HOTSPOT_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">' +
    '<rect width="400" height="200" fill="#f1f5f9"/>' +
    '<circle cx="100" cy="100" r="30" fill="#ce2c31"/>' +
    '<rect x="255" y="35" width="50" height="50" fill="#2f6feb"/>' +
    '<polygon points="200,150 225,190 175,190" fill="#0b7a6d"/>' +
    "</svg>",
)}`;

export type SampleSet = "core" | "advanced" | "all";

/**
 * Demo quiz used by the dev playgrounds, one question of each type. `core` = the P1
 * types (the player E2E counts on exactly these five), `advanced` = the P3 types.
 */
export function sampleQuiz(set: SampleSet = "all"): { quiz: QuizDraft; questions: Question[] } {
  const core: Question[] = [
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
  const advanced: Question[] = [
    {
      ...createQuestion("slider"),
      prompt: "Berapa persen permukaan bumi yang tertutup air?",
      config: { min: 0, max: 100, step: 1, value: 71, tolerance: 3, partial: true, unit: "%" },
    },
    {
      ...createQuestion("odd_one_out"),
      prompt: "Mana yang bukan planet?",
      config: {
        items: [
          { id: "d1", text: "Merkurius" },
          { id: "d2", text: "Venus" },
          { id: "d3", text: "Bulan" },
          { id: "d4", text: "Mars" },
        ],
        oddId: "d3",
        reason: "Bulan adalah satelit alami Bumi, bukan planet.",
      },
    },
    {
      ...createQuestion("sequencing"),
      prompt: "Urutkan tahapan siklus air.",
      config: {
        items: [
          { id: "s1", text: "Penguapan" },
          { id: "s2", text: "Kondensasi" },
          { id: "s3", text: "Hujan" },
          { id: "s4", text: "Aliran ke laut" },
        ],
        scoring: "adjacent",
      },
    },
    {
      ...createQuestion("grouping"),
      prompt: "Kelompokkan menurut jenisnya.",
      config: {
        groups: [
          { id: "g1", name: "Buah" },
          { id: "g2", name: "Sayur" },
        ],
        items: [
          { id: "i1", text: "Apel", groupId: "g1" },
          { id: "i2", text: "Mangga", groupId: "g1" },
          { id: "i3", text: "Bayam", groupId: "g2" },
          { id: "i4", text: "Wortel", groupId: "g2" },
        ],
      },
    },
    {
      ...createQuestion("word_blank"),
      prompt: "Lengkapi nama proses ini.",
      help: "Tumbuhan membuat makanan dengan bantuan cahaya matahari.",
      config: {
        text: "Fotosintesis",
        unit: "letter",
        blanks: [1, 4, 7, 10],
        hint: "Foto = cahaya",
        caseSensitive: false,
      },
    },
    {
      ...createQuestion("hotspot"),
      prompt: "Klik lingkaran merah dan kotak biru.",
      config: {
        image: { kind: "image", url: HOTSPOT_SVG, alt: "Tiga bentuk berwarna" },
        aspect: 0.5,
        spots: [
          { id: "h1", x: 25, y: 50, r: 9, label: "Lingkaran" },
          { id: "h2", x: 70, y: 30, r: 9, label: "Kotak" },
        ],
        maxClicks: null,
      },
    },
    {
      ...createQuestion("branching"),
      prompt: "Temanmu menjatuhkan dompet tanpa sadar. Apa yang kamu lakukan?",
      config: {
        startId: "n1",
        scoring: "ending",
        nodes: [
          {
            id: "n1",
            text: "Kamu melihat dompet jatuh dari tas temanmu di kantin.",
            x: 0,
            y: 80,
            ending: null,
            choices: [
              { id: "c1", text: "Ambil dan kembalikan", targetId: "n2", correct: true },
              { id: "c2", text: "Pura-pura tidak lihat", targetId: "n4", correct: false },
            ],
          },
          {
            id: "n2",
            text: "Temanmu sudah pergi. Kamu memegang dompetnya.",
            x: 320,
            y: 0,
            ending: null,
            choices: [
              { id: "c3", text: "Titipkan ke guru piket", targetId: "n3", correct: true },
              { id: "c4", text: "Simpan sampai besok", targetId: "n5", correct: false },
            ],
          },
          {
            id: "n3",
            text: "Guru mengumumkannya dan dompet kembali ke pemiliknya.",
            x: 640,
            y: 0,
            ending: { label: "Akhir terbaik", score: 1 },
            choices: [],
          },
          {
            id: "n4",
            text: "Dompet itu hilang dan temanmu sedih seharian.",
            x: 320,
            y: 220,
            ending: { label: "Akhir buruk", score: 0 },
            choices: [],
          },
          {
            id: "n5",
            text: "Besoknya dompet kembali, tapi temanmu sempat panik semalaman.",
            x: 640,
            y: 160,
            ending: { label: "Akhir cukup baik", score: 0.5 },
            choices: [],
          },
        ],
      },
    },
  ];
  const questions = set === "core" ? core : set === "advanced" ? advanced : [...core, ...advanced];
  return {
    quiz: {
      id: "playground-quiz",
      title: "Kuis Pengetahuan Umum",
      description: "Satu soal dari tiap tipe.",
      coverUrl: null,
      theme: {},
    },
    questions,
  };
}
