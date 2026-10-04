"use client";

import { LoaderCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";

import { chooseQuizAction } from "./actions";

type Quiz = { id: string; title: string; description: string };

export function DeepLinkPicker({ launchId, quizzes }: { launchId: string; quizzes: Quiz[] }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<{ returnUrl: string; jwt: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useRef<HTMLFormElement>(null);

  function choose(quizId: string) {
    setChosen(quizId);
    setError(null);
    startTransition(async () => {
      const result = await chooseQuizAction(launchId, quizId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setResponse(result);
      // The LMS takes the signed link as a form post, like the launch it sent us.
      requestAnimationFrame(() => form.current?.submit());
    });
  }

  return (
    <>
      <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Quiz">
        {quizzes.map((quiz) => (
          <li key={quiz.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium">{quiz.title || "Tanpa judul"}</span>
              {quiz.description && (
                <span className="line-clamp-1 text-sm text-fg-muted">{quiz.description}</span>
              )}
            </div>
            <Button
              size="sm"
              variant={chosen === quiz.id ? "primary" : "secondary"}
              disabled={pending || !!response}
              onClick={() => choose(quiz.id)}
            >
              {pending && chosen === quiz.id && <LoaderCircle className="animate-spin" />} Pilih
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {response && (
        <form ref={form} method="post" action={response.returnUrl}>
          <input type="hidden" name="JWT" value={response.jwt} />
          <p role="status" className="text-sm text-fg-muted">
            Mengirim pilihan ke LMS…{" "}
            <button type="submit" className="underline">
              Lanjutkan
            </button>
          </p>
        </form>
      )}
    </>
  );
}
