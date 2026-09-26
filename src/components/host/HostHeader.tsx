import { LogOut } from "lucide-react";
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
          {email && <span className="hidden text-sm text-fg-subtle sm:inline">{email}</span>}
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
