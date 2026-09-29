import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";

import { getSessionUser } from "@/lib/auth";
import { RECOVERY_COOKIE, verifyRecoveryMarker } from "@/lib/recovery";

import { AuthShell } from "../AuthShell";
import { NewPasswordForm } from "./NewPasswordForm";

export const metadata: Metadata = { title: "Buat password baru" };

export default async function ResetPasswordPage() {
  const user = await getSessionUser();
  const marker = (await cookies()).get(RECOVERY_COOKIE)?.value;
  const valid = !!user && !user.isAnonymous && verifyRecoveryMarker(marker, user.id);

  return (
    <AuthShell>
      {valid ? (
        <NewPasswordForm email={user.email} />
      ) : (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 text-center shadow-card"
        >
          <p className="text-lg font-semibold">Link reset tidak berlaku</p>
          <p className="text-sm text-fg-muted">
            Link sudah kedaluwarsa (15 menit), sudah dipakai, atau dibuka di browser lain.
          </p>
          <Link href="/forgot-password" className="text-sm font-medium text-accent-fg underline">
            Minta link baru
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
