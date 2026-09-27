import type { Metadata } from "next";

import { loadHostExam, loadParticipants, loadRoster } from "../../data";
import { RosterPanel } from "./RosterPanel";

export const metadata: Metadata = { title: "Daftar peserta" };

export default async function RosterPage({
  params,
}: PageProps<"/quizzes/[id]/exams/[examId]/roster">) {
  const { id, examId } = await params;
  const { supabase, policy } = await loadHostExam(id, examId);
  const [roster, participants] = await Promise.all([
    loadRoster(supabase, examId),
    loadParticipants(supabase, examId),
  ]);
  const joined = new Set(participants.map((p) => p.roster_id));

  return (
    <section className="flex flex-col gap-4" aria-label="Daftar peserta">
      {policy.access !== "roster" && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm">
          Ujian ini tidak memakai daftar peserta: siapa pun yang punya link bisa ikut.
        </p>
      )}
      <RosterPanel
        examId={examId}
        entries={roster.map((r) => ({
          id: r.id,
          name: r.name,
          identifier: r.identifier,
          extraTimePct: r.extra_time_pct,
          joined: joined.has(r.id),
        }))}
      />
    </section>
  );
}
