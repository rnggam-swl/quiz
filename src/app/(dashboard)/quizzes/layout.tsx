import { requireHost } from "@/lib/auth";

/** Everything under /quizzes is for signed-in hosts (the proxy redirects early; this is the real check). */
export default async function QuizzesLayout({ children }: LayoutProps<"/quizzes">) {
  await requireHost("/quizzes");
  return children;
}
