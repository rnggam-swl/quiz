import type { NextRequest } from "next/server";
import { z } from "zod";

import { decodeCursor, encodeCursor } from "@/lib/api-token";
import { apiError, apiJson, isUuid, notFound, withOwner } from "@/lib/api/v1";

const querySchema = z.object({
  session: z.uuid().optional(),
  status: z.enum(["in_progress", "submitted", "expired"]).optional(),
  since: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().max(200).optional(),
});

type Page = { data: unknown[]; next: { started_at: string; id: string } | null };

/**
 * GET /api/v1/quizzes/{id}/attempts?session=&status=&since=&limit=&cursor=
 * Oldest first; follow `next_cursor` until it is null.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteContext<"/api/v1/quizzes/[id]/attempts">,
) {
  const { id } = await params;
  return withOwner(request, async (owner, admin) => {
    if (!isUuid(id)) return notFound();
    const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
    if (!query.success) {
      const issue = query.error.issues[0];
      return apiError(400, "invalid_query", `Parameter ${issue?.path.join(".")} tidak valid.`);
    }
    const { session, status, since, limit, cursor } = query.data;
    const after = cursor ? decodeCursor(cursor) : null;
    if (cursor && !after) return apiError(400, "invalid_query", "Parameter cursor tidak valid.");

    const { data, error } = await admin.rpc("api_attempts", {
      p_owner: owner,
      p_quiz_id: id,
      p_session_id: session,
      p_status: status,
      p_since: since,
      p_after_started: after?.startedAt,
      p_after_id: after?.id,
      p_limit: limit ?? 100,
    });
    if (error) return apiError(500, "internal", "Terjadi kesalahan. Coba lagi.");
    if (!data) return notFound();
    const page = data as Page;
    return apiJson({ data: page.data, next_cursor: encodeCursor(page.next) });
  });
}
