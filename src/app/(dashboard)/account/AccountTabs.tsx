"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

const TABS = [
  { href: "/account", label: "Profil & password" },
  { href: "/account/integrations", label: "Integrasi" },
] as const;

export function AccountTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Bagian akun" className="border-b border-line">
      <ul className="flex gap-1">
        {TABS.map((tab) => {
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
