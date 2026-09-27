import { buildReport, itemsCsv, scoresCsv } from "../build";

/** CSV exports of the exam report: ?kind=scores (default) or ?kind=items. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/quizzes/[id]/exams/[examId]/report/csv">,
) {
  const { id, examId } = await params;
  const kind = new URL(request.url).searchParams.get("kind") === "items" ? "items" : "scores";
  const { exam, rows, items } = await buildReport(id, examId);

  const title = exam.session.title || exam.session.quizzes.title || "ujian";
  const slug =
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "ujian";
  const filename = `${slug}-${kind === "items" ? "butir-soal" : "nilai"}.csv`;

  return new Response(kind === "items" ? itemsCsv(items) : scoresCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
