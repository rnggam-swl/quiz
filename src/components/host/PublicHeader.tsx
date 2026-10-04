import Link from "next/link";

import { AnswerShape } from "@/components/player/AnswerShape";
import { Button } from "@/components/ui/Button";
import { site } from "@/lib/site";

/** Header for public pages (library) when nobody is signed in. */
export function PublicHeader({ loginNext }: { loginNext?: string }) {
  const login = loginNext ? `/login?next=${encodeURIComponent(loginNext)}` : "/login";
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <AnswerShape slot={2} className="size-6 rounded-md p-1" />
          {site.name}
        </Link>
        <nav className="text-sm">
          <Link href="/library" className="font-medium text-fg">
            Library
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href={login}>Masuk</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/login?mode=signup">Daftar gratis</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
