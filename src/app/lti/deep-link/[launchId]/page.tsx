import type { Metadata } from "next";

import { createAdminClient } from "@/lib/supabase/admin";

import { loadLaunch } from "../../launch";
import { Notice } from "../../Notice";
import { DeepLinkPicker } from "./DeepLinkPicker";

export const metadata: Metadata = { title: "Pilih quiz", robots: { index: false } };

/**
 * Deep linking (P8-08): a teacher adding the activity in the LMS picks one of the quizzes of
 * the account that registered this LMS. The choice goes back to the LMS as a signed link.
 */
export default async function LtiDeepLinkPage({ params }: PageProps<"/lti/deep-link/[launchId]">) {
  const { launchId } = await params;
  const launch = await loadLaunch(launchId, "LtiDeepLinkingRequest");
  if (!launch?.deep_link_return_url) {
    return <Notice>Tautan ini sudah kedaluwarsa. Tambahkan aktivitasnya lagi dari LMS.</Notice>;
  }

  const { data: quizzes } = await createAdminClient()
    .from("quizzes")
    .select("id, title, description, updated_at")
    .eq("owner_id", launch.platform.owner_id)
    .not("latest_version", "is", null)
    .not("slug", "is", null)
    .order("updated_at", { ascending: false })
    .limit(200);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Pilih quiz</h1>
        <p className="text-sm text-fg-muted">
          Quiz yang dipilih dipasang sebagai aktivitas di {launch.platform.name}. Nilai peserta
          (0–100) masuk ke buku nilai setelah mereka menyelesaikan quiz.
        </p>
      </header>
      {quizzes?.length ? (
        <DeepLinkPicker
          launchId={launch.id}
          quizzes={quizzes.map((q) => ({ id: q.id, title: q.title, description: q.description }))}
        />
      ) : (
        <Notice>
          Belum ada quiz yang diterbitkan di akun ini. Terbitkan quiz dulu, lalu coba lagi.
        </Notice>
      )}
    </main>
  );
}
