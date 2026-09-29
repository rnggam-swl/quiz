import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";

import { signOutAction } from "@/app/(auth)/actions";
import { AnswerShape } from "@/components/player/AnswerShape";
import { Button } from "@/components/ui/Button";
import { site } from "@/lib/site";

export function HostHeader({ email }: { email: string | null }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/quizzes" className="flex items-center gap-2 font-semibold">
          <AnswerShape slot={2} className="size-6 rounded-md p-1" />
          {site.name}
        </Link>
        <nav className="text-sm">
          <Link href="/quizzes" className="font-medium text-fg">
            Quiz saya
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {email && (
            <Link
              href="/account"
              className="hidden rounded-md px-2 py-1 text-sm text-fg-subtle hover:bg-surface-muted hover:text-fg sm:inline"
              title="Akun"
            >
              {email}
            </Link>
          )}
          <Link
            href="/account"
            className="rounded-md p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg sm:hidden"
            aria-label="Akun"
          >
            <UserRound className="size-4" />
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut /> Keluar
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
