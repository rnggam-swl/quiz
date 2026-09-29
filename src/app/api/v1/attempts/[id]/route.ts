import type { NextRequest } from "next/server";

import { apiError, apiJson, isUuid, notFound, withOwner } from "@/lib/api/v1";

/** GET /api/v1/attempts/{id}: one attempt with every answer. */
export async function GET(request: NextRequest, { params }: RouteContext<"/api/v1/attempts/[id]">) {
  const { id } = await params;
  return withOwner(request, async (owner, admin) => {
    if (!isUuid(id)) return notFound();
    const { data, error } = await admin.rpc("api_attempt", { p_owner: owner, p_attempt_id: id });
    if (error) return apiError(500, "internal", "Terjadi kesalahan. Coba lagi.");
    return data ? apiJson({ data }) : notFound();
  });
}
