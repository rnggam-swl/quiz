import type { Metadata } from "next";

import { LocalTime } from "@/components/ui/LocalTime";
import { requireHost } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { requestOrigin } from "@/lib/request-origin";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { Section } from "../Section";
import { CreateApiToken, RevokeToken } from "./ApiTokens";

export const metadata: Metadata = { title: "Integrasi" };

type TokenRow = Pick<
  Tables<"api_tokens">,
  "id" | "name" | "prefix" | "created_at" | "expires_at" | "last_used_at" | "revoked_at"
>;

function tokenStatus(token: TokenRow, now = Date.now()) {
  if (token.revoked_at) return { label: "Dicabut", tone: "bg-surface-muted text-fg-muted" };
  if (token.expires_at && Date.parse(token.expires_at) <= now) {
    return { label: "Kedaluwarsa", tone: "bg-warning-soft text-warning" };
  }
  return { label: "Aktif", tone: "bg-success-soft text-success" };
}

const DATE: Intl.DateTimeFormatOptions = { dateStyle: "medium" };

export default async function IntegrationsPage() {
  await requireHost("/account/integrations");
  const supabase = await createClient();
  const origin = await requestOrigin();
  const { data: tokens } = await supabase
    .from("api_tokens")
    .select("id, name, prefix, created_at, expires_at, last_used_at, revoked_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <>
      <TokenSection tokens={tokens ?? []} origin={origin} />
    </>
  );
}

function TokenSection({ tokens, origin }: { tokens: TokenRow[]; origin: string }) {
  return (
    <Section
      title="Token API"
      description="Untuk membaca hasil quiz dari sistem lain (LMS, spreadsheet, dasbor sekolah). Hanya baca: token tidak bisa mengubah apa pun. Setiap token bisa membaca semua quiz di akun ini."
    >
      <CreateApiToken />

      {tokens.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Token API">
          {tokens.map((token) => {
            const status = tokenStatus(token);
            return (
              <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{token.name}</span>
                    <span
                      className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.tone)}
                    >
                      {status.label}
                    </span>
                  </span>
                  <span className="text-xs text-fg-subtle">
                    <span className="font-mono">{token.prefix}…</span> · dibuat{" "}
                    <LocalTime iso={token.created_at} options={DATE} />
                    {token.expires_at && !token.revoked_at && (
                      <>
                        {" "}
                        · berlaku sampai <LocalTime iso={token.expires_at} options={DATE} />
                      </>
                    )}
                    {" · "}
                    {token.last_used_at ? (
                      <>
                        terakhir dipakai <LocalTime iso={token.last_used_at} />
                      </>
                    ) : (
                      "belum pernah dipakai"
                    )}
                  </span>
                </div>
                {!token.revoked_at && <RevokeToken id={token.id} name={token.name} />}
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-xl border border-line p-4 text-sm">
        <summary className="cursor-pointer font-medium">Cara memakai</summary>
        <div className="mt-3 flex flex-col gap-2 text-fg-muted">
          <p>Kirim token di header, dari server (jangan dari browser):</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-muted p-3 font-mono text-xs text-fg">
            {`curl -H "Authorization: Bearer qz_…" \\\n  ${origin}/api/v1/quizzes`}
          </pre>
          <ul className="list-disc pl-5">
            <li>
              <code className="font-mono text-xs">GET /api/v1/quizzes</code>: semua quiz
            </li>
            <li>
              <code className="font-mono text-xs">GET /api/v1/quizzes/{"{id}"}</code>: soal (tanpa
              kunci jawaban) dan sesi
            </li>
            <li>
              <code className="font-mono text-xs">
                GET /api/v1/quizzes/{"{id}"}/attempts?status=submitted&amp;since=…
              </code>
              : hasil peserta, 100 per halaman, lanjutkan dengan <code>cursor</code> dari{" "}
              <code>next_cursor</code>
            </li>
            <li>
              <code className="font-mono text-xs">GET /api/v1/attempts/{"{id}"}</code>: jawaban per
              soal
            </li>
          </ul>
        </div>
      </details>
    </Section>
  );
}
