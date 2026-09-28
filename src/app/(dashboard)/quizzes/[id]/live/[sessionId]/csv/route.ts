import { itemsCsv } from "../../../exams/[examId]/report/build";
import { buildLiveReport, standingsCsv } from "../build";

/** CSV exports of a live session: ?kind=standings (default) or ?kind=items. */
export async function GET(
  request: Request,
  { params }: RouteContext<"/quizzes/[id]/live/[sessionId]/csv">,
) {
  const { id, sessionId } = await params;
  const kind = new URL(request.url).searchParams.get("kind") === "items" ? "items" : "standings";
  const { title, standings, items } = await buildLiveReport(id, sessionId);
  const slug =
    title
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase()
      .slice(0, 60) || "live";
  const filename = `${slug}-live-${kind === "items" ? "butir-soal" : "klasemen"}.csv`;
  return new Response(kind === "items" ? itemsCsv(items) : standingsCsv(standings), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
