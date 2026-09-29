import type { Metadata } from "next";

import { AuthShell } from "../AuthShell";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Lupa password" };

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const { error } = await searchParams;
  return (
    <AuthShell>
      <ForgotForm
        initialError={
          error === "link"
            ? "Link reset sudah kedaluwarsa atau sudah dipakai. Minta link baru."
            : undefined
        }
      />
    </AuthShell>
  );
}
