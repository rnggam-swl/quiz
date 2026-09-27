import { z } from "zod";

import { DEFAULT_POLICIES, policySchema, type Policy } from "@/engine/policy";

/** The "Buat ujian" form (P4-08) and the session policy it becomes. */

const timestamp = z.iso.datetime({ offset: true });

export const examFormSchema = z
  .object({
    title: z.string().trim().min(1, "Beri nama ujian.").max(120),
    opensAt: timestamp.nullable(),
    closesAt: timestamp.nullable(),
    durationMin: z.number().int().min(1).max(360).nullable(),
    poolSize: z.number().int().min(1).max(500).nullable(),
    poolTags: z.array(z.string().trim().min(1).max(30)).max(10),
    shuffleQuestions: z.boolean(),
    shuffleOptions: z.boolean(),
    attempts: z.number().int().min(0).max(10),
    attemptScoring: z.enum(["highest", "last", "average"]),
    navigation: z.enum(["free", "forward"]),
    releaseResults: z.enum(["immediately", "after_close", "manual"]),
    showCorrectAnswer: z.boolean(),
    fullscreen: z.boolean(),
    logTabSwitch: z.boolean(),
    blockCopyPaste: z.boolean(),
    access: z.enum(["open", "login", "roster"]),
    passcode: z.string().trim().max(40),
  })
  .refine((f) => !f.opensAt || !f.closesAt || Date.parse(f.opensAt) < Date.parse(f.closesAt), {
    message: "Waktu tutup harus setelah waktu buka.",
    path: ["closesAt"],
  });
export type ExamForm = z.infer<typeof examFormSchema>;

/** The session policy for an exam form, validated like any stored policy. */
export function examPolicy(form: ExamForm): Policy {
  return policySchema.parse({
    ...DEFAULT_POLICIES.exam,
    timer: form.durationMin ? { totalS: form.durationMin * 60 } : {},
    ...(form.poolSize && {
      questionPool: { size: form.poolSize, ...(form.poolTags.length && { tags: form.poolTags }) },
    }),
    shuffleQuestions: form.shuffleQuestions,
    shuffleOptions: form.shuffleOptions,
    attempts: form.attempts,
    attemptScoring: form.attemptScoring,
    navigation: form.navigation,
    releaseResults: form.releaseResults,
    showCorrectAnswer: form.showCorrectAnswer,
    integrity: {
      fullscreen: form.fullscreen,
      logTabSwitch: form.logTabSwitch,
      blockCopyPaste: form.blockCopyPaste,
    },
    access: form.access,
    ...(form.passcode && { passcode: form.passcode }),
  });
}
