import type { Metadata } from "next";

import {
  isSessionOpen,
  loadDefaultSessionBySlug,
  loadSessionByCode,
  playInfo,
  verifyEmbedTokenFor,
  type SessionContext,
} from "@/engine/practice/server";

import { EmbedClient } from "./EmbedClient";

export const metadata: Metadata = { title: "Quiz", robots: { index: false } };

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="m-auto flex max-w-sm flex-col items-center gap-2 p-6 text-center text-fg-muted">
      <p className="text-3xl" aria-hidden>
        🧩
      </p>
      {children}
    </main>
  );
}

/**
 * The quiz inside someone else's page (docs/07-embed.md). Framing is limited to
 * the quiz's allowed origins by src/proxy.ts; here we also refuse quizzes that
 * have embedding switched off.
 */
export default async function EmbedPage({ params, searchParams }: PageProps<"/embed/[slug]">) {
  const { slug } = await params;
  const query = await searchParams;
  const code = typeof query.session === "string" ? query.session : null;
  const token = typeof query.token === "string" ? query.token : null;
  const theme = query.theme === "dark" || query.theme === "light" ? query.theme : null;

  let ctx: SessionContext | null = code
    ? await loadSessionByCode(code)
    : await loadDefaultSessionBySlug(slug);
  if (ctx && ctx.quiz.slug !== slug) ctx = null;

  if (!ctx) return <Notice>Quiz ini tidak ditemukan.</Notice>;
  if (!ctx.policy.allowEmbed || ctx.quiz.embed_allowed_origins.length === 0) {
    return <Notice>Pemilik quiz belum mengizinkan quiz ini dipasang di situs lain.</Notice>;
  }
  if (!isSessionOpen(ctx)) return <Notice>Sesi quiz ini sudah ditutup.</Notice>;

  const identity = token ? await verifyEmbedTokenFor(ctx, token) : null;
  if (token && !identity) return <Notice>Token embed tidak valid atau sudah kedaluwarsa.</Notice>;

  return (
    <EmbedClient
      slug={slug}
      sessionId={ctx.session.id}
      info={playInfo(ctx)}
      allowedOrigins={ctx.quiz.embed_allowed_origins}
      embedToken={token}
      identity={identity}
      theme={theme}
    />
  );
}
