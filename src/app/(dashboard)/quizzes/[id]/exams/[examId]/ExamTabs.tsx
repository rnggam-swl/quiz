"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export function ExamTabs({ base, showRoster }: { base: string; showRoster: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: base, label: "Monitor" },
    ...(showRoster ? [{ href: `${base}/roster`, label: "Daftar peserta" }] : []),
    { href: `${base}/grading`, label: "Penilaian" },
    { href: `${base}/report`, label: "Laporan" },
  ];
  return (
    <nav
      aria-label="Bagian ujian"
      className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
                  active
                    ? "border-accent text-accent-fg"
                    : "border-transparent text-fg-subtle hover:text-fg",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
