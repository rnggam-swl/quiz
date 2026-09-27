import type { Metadata } from "next";

import { describeIntegrity, summarizeIntegrity } from "@/engine/exam/integrity";
import { percentOf } from "@/engine/exam/report";

import {
  groupBy,
  loadAttempts,
  loadHostExam,
  loadIntegrity,
  loadParticipants,
  loadResponses,
  loadRoster,
} from "../data";
import { ATTEMPT_STATUS, Badge, Stat } from "../parts";
import { AttemptMenu } from "./AttemptMenu";
import { AutoRefresh, Remaining } from "./live";

export const metadata: Metadata = { title: "Monitor ujian" };

/** Attempts past deadline + grace are over even before the cron job marks them. */
const GRACE_MS = 5000;

type Row = {
  key: string;
  name: string;
  identifier: string | null;
  extraTimePct: number;
  attempt: {
    id: string;
    no: number;
    status: keyof typeof ATTEMPT_STATUS;
    /** Still in progress in the database (an overdue one shows as over). */
    open: boolean;
    deadline: string | null;
    answered: number;
    total: number;
    percent: number | null;
    pending: number;
  } | null;
  integrity: string;
};

const ORDER: Record<keyof typeof ATTEMPT_STATUS, number> = {
  in_progress: 0,
  not_started: 1,
  expired: 2,
  submitted: 3,
};

type Data = {
  participants: Awaited<ReturnType<typeof loadParticipants>>;
  attempts: Awaited<ReturnType<typeof loadAttempts>>;
  responses: Awaited<ReturnType<typeof loadResponses>>;
  events: Awaited<ReturnType<typeof loadIntegrity>>;
  roster: Awaited<ReturnType<typeof loadRoster>>;
};

/** One row per participant (their latest attempt) plus roster entries nobody used yet. */
function monitorRows(
  { participants, attempts, responses, events, roster }: Data,
  now = Date.now(),
): Row[] {
  const attemptsOf = groupBy(attempts, (a) => a.participant_id);
  const responsesOf = groupBy(responses, (r) => r.attempt_id);
  const eventsOf = groupBy(events, (e) => e.attempt_id);
  const rosterById = new Map(roster.map((r) => [r.id, r]));

  const rows: Row[] = participants.map((p) => {
    const latest = (attemptsOf.get(p.id) ?? []).sort((a, b) => b.attempt_no - a.attempt_no)[0];
    const entry = p.roster_id ? rosterById.get(p.roster_id) : undefined;
    let attempt: Row["attempt"] = null;
    if (latest) {
      const mine = responsesOf.get(latest.id) ?? [];
      const overdue =
        latest.status === "in_progress" &&
        latest.deadline !== null &&
        now > Date.parse(latest.deadline) + GRACE_MS;
      attempt = {
        id: latest.id,
        no: latest.attempt_no,
        status: overdue ? "expired" : latest.status,
        open: latest.status === "in_progress",
        deadline: latest.deadline,
        answered: mine.length,
        total: latest.question_ids.length,
        percent: latest.status === "in_progress" ? null : percentOf(latest.score, latest.max_score),
        pending: mine.filter((r) => r.correct === null).length,
      };
    }
    return {
      key: p.id,
      name: p.nickname,
      identifier: entry?.identifier ?? null,
      extraTimePct: entry?.extra_time_pct ?? 0,
      attempt,
      integrity: latest
        ? describeIntegrity(
            summarizeIntegrity(
              (eventsOf.get(latest.id) ?? []).map((e) => ({
                kind: e.kind,
                meta: e.meta as { durationMs?: number } | null,
              })),
            ),
          )
        : "",
    };
  });
  // Roster entries nobody has used yet.
  const joined = new Set(participants.map((p) => p.roster_id).filter(Boolean));
  for (const r of roster) {
    if (joined.has(r.id)) continue;
    rows.push({
      key: r.id,
      name: r.name,
      identifier: r.identifier,
      extraTimePct: r.extra_time_pct,
      attempt: null,
      integrity: "",
    });
  }
  rows.sort(
    (a, b) =>
      ORDER[a.attempt?.status ?? "not_started"] - ORDER[b.attempt?.status ?? "not_started"] ||
      a.name.localeCompare(b.name, "id"),
  );

  return rows;
}

export default async function ExamMonitorPage({
  params,
}: PageProps<"/quizzes/[id]/exams/[examId]">) {
  const { id, examId } = await params;
  const { supabase, policy, phase } = await loadHostExam(id, examId);
  const [participants, attempts, responses, events, roster] = await Promise.all([
    loadParticipants(supabase, examId),
    loadAttempts(supabase, examId),
    loadResponses(supabase, examId),
    loadIntegrity(supabase, examId),
    policy.access === "roster" ? loadRoster(supabase, examId) : Promise.resolve([]),
  ]);

  const rows = monitorRows({ participants, attempts, responses, events, roster });

  const count = (status: keyof typeof ATTEMPT_STATUS) =>
    rows.filter((r) => (r.attempt?.status ?? "not_started") === status).length;

  return (
    <section className="flex flex-col gap-4" aria-label="Monitor">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sedang mengerjakan" value={count("in_progress")} />
        <Stat label="Selesai" value={count("submitted") + count("expired")} />
        <Stat label="Belum mulai" value={count("not_started")} />
        <Stat label="Ada catatan integritas" value={rows.filter((r) => r.integrity).length} />
      </dl>

      {phase !== "closed" && <AutoRefresh seconds={10} />}

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
          {policy.access === "roster"
            ? "Daftar peserta masih kosong. Impor NIS/email di tab Daftar peserta."
            : "Belum ada peserta. Bagikan kode atau link di atas."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-fg-subtle">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Peserta
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Status
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Progres
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Sisa waktu
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Nilai
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Integritas
                </th>
                <th scope="col" className="px-2 py-3">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const status = ATTEMPT_STATUS[row.attempt?.status ?? "not_started"];
                const a = row.attempt;
                return (
                  <tr key={row.key} className="hover:bg-surface-muted">
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.name}</span>
                      {row.identifier && (
                        <span className="ml-2 text-xs text-fg-subtle">{row.identifier}</span>
                      )}
                      {row.extraTimePct > 0 && (
                        <span className="ml-2 text-xs text-accent-fg">
                          +{row.extraTimePct}% waktu
                        </span>
                      )}
                      {a && a.no > 1 && (
                        <span className="ml-2 text-xs text-fg-subtle">percobaan #{a.no}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {a ? (
                        <span className="flex items-center gap-2">
                          <span
                            className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-muted"
                            aria-hidden
                          >
                            <span
                              className="block h-full bg-accent"
                              style={{ width: `${a.total ? (a.answered / a.total) * 100 : 0}%` }}
                            />
                          </span>
                          {a.answered}/{a.total}
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {a?.status === "in_progress" && a.deadline ? (
                        <Remaining deadline={a.deadline} />
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {a?.percent !== null && a?.percent !== undefined ? (
                        <span className="font-semibold">{a.percent}%</span>
                      ) : (
                        "–"
                      )}
                      {a && a.status !== "in_progress" && a.pending > 0 && (
                        <span className="ml-2 text-xs text-warning">
                          {a.pending} esai belum dinilai
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-fg-muted">{row.integrity || "–"}</td>
                    <td className="px-2 py-3 text-right">
                      {a && (
                        <AttemptMenu
                          examId={examId}
                          attemptId={a.id}
                          name={row.name}
                          open={a.open}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
