import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AnswerShape, ANSWER_SLOTS } from "@/components/player/AnswerShape";
import { getSessionUser, safeNextPath } from "@/lib/auth";
import { site } from "@/lib/site";

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
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex flex-col items-center gap-3 self-center">
          <span className="flex gap-1.5" aria-hidden>
            {ANSWER_SLOTS.slice(0, 4).map((slot) => (
              <AnswerShape key={slot} slot={slot} className="size-6 rounded-md p-1" />
            ))}
          </span>
          <span className="text-xl font-semibold">{site.name}</span>
        </Link>
        <AuthForm
          key={mode}
          mode={mode}
          next={next}
          initialError={error}
          googleEnabled={process.env.NEXT_PUBLIC_AUTH_GOOGLE === "true"}
        />
      </div>
    </main>
  );
}
