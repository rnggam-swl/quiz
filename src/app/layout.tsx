import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans } from "next/font/google";

import { Toaster } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { site } from "@/lib/site";

import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f19" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${dmSans.variable} ${dmMono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
