import type { NextRequest } from "next/server";

import { apiError, apiJson, isUuid, notFound, withOwner } from "@/lib/api/v1";

/** GET /api/v1/quizzes/{id}: the quiz, its questions (no answer keys) and its sessions. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/v1/quizzes/[id]">) {
  const { id } = await params;
  return withOwner(request, async (owner, admin) => {
    if (!isUuid(id)) return notFound();
    const { data, error } = await admin.rpc("api_quiz", { p_owner: owner, p_quiz_id: id });
    if (error) return apiError(500, "internal", "Terjadi kesalahan. Coba lagi.");
    return data ? apiJson({ data }) : notFound();
  });
}
