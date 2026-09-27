"use server";

import { isSessionOpen, loadSessionByCode } from "@/engine/practice/server";

/** Whether a join code points at an open session (for the /join form). */
export async function checkJoinCodeAction(code: string): Promise<{ ok: boolean }> {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return { ok: false };
  const ctx = await loadSessionByCode(code);
  // An exam's code works before it opens: its page shows when it starts.
  return { ok: !!ctx && (ctx.session.mode === "exam" || isSessionOpen(ctx)) };
}
