import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSessionUser, safeNextPath } from "@/lib/auth";

import { AuthShell } from "../AuthShell";
import { AuthForm } from "./AuthForm";

export const metadata: Metadata = { title: "Masuk" };

const ERRORS: Record<string, string> = {
  link: "Link sudah kedaluwarsa atau tidak valid. Coba masuk lagi.",
  oauth: "Masuk dengan Google gagal. Coba lagi.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const mode = params.mode === "signup" ? "signup" : "signin";
  const error = typeof params.error === "string" ? ERRORS[params.error] : undefined;

  const user = await getSessionUser();
  if (user && !user.isAnonymous) redirect(next);

  return (
    <AuthShell>
      <AuthForm
        key={mode}
        mode={mode}
        next={next}
        initialError={error}
        googleEnabled={process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true"}
      />
    </AuthShell>
  );
}
