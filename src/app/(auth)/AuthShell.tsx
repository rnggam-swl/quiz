import Link from "next/link";
import type { ReactNode } from "react";

import { AnswerShape, ANSWER_SLOTS } from "@/components/player/AnswerShape";
import { site } from "@/lib/site";

/** Logo above a narrow card: login, lupa password, reset password. */
export function AuthShell({ children }: { children: ReactNode }) {
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
        {children}
      </div>
    </main>
  );
}
