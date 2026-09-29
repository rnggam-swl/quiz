import type { NextRequest } from "next/server";

import { apiError, apiJson, withOwner } from "@/lib/api/v1";

/** GET /api/v1/quizzes: every quiz of the token's owner. */
export function GET(request: NextRequest) {
  return withOwner(request, async (owner, admin) => {
    const { data, error } = await admin.rpc("api_quizzes", { p_owner: owner });
    if (error) return apiError(500, "internal", "Terjadi kesalahan. Coba lagi.");
    return apiJson({ data });
  });
}
