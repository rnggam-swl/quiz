"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ClipboardEvent, type KeyboardEvent } from "react";

import { Button3D } from "@/components/player/Button3D";
import { cn } from "@/lib/cn";

import { checkJoinCodeAction } from "../play/session";

const LENGTH = 6;

/** Six single-digit boxes: auto-advance, backspace goes back, paste fills all. */
export function JoinCodeForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(() => {
    const clean = initialCode.replace(/\D/g, "").slice(0, LENGTH);
    return Array.from({ length: LENGTH }, (_, i) => clean[i] ?? "");
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const code = digits.join("");
  const complete = code.length === LENGTH;

  function setAt(index: number, value: string) {
    setError(null);
    setDigits((d) => d.map((x, i) => (i === index ? value : x)));
  }

  function fill(text: string, from = 0) {
    const clean = text.replace(/\D/g, "").slice(0, LENGTH - from);
    if (!clean) return;
    setError(null);
    setDigits((d) =>
      d.map((x, i) => (i >= from && i < from + clean.length ? clean[i - from]! : x)),
    );
    inputs.current[Math.min(from + clean.length, LENGTH - 1)]?.focus();
  }

  function onKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      setAt(index - 1, "");
      inputs.current[index - 1]?.focus();
    } else if (e.key === "ArrowLeft" && index > 0) {
      inputs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      inputs.current[index + 1]?.focus();
    }
  }

  function onPaste(index: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    fill(e.clipboardData.getData("text"), index);
  }

  function submit() {
    if (!complete) return;
    startTransition(async () => {
      const { ok } = await checkJoinCodeAction(code).catch(() => ({ ok: false }));
      if (ok) router.push(`/play/${code}`);
      else setError("Kode tidak ditemukan atau sesinya sudah ditutup.");
    });
  }

  return (
    <form
      className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl bg-surface p-6 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor="code-0" className="text-lg font-semibold">
        Masukkan kode quiz
      </label>
      <div
        className={cn("flex gap-2", error && "animate-shake")}
        role="group"
        aria-label="Kode 6 digit"
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            id={`code-${i}`}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={digit}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            autoFocus={i === 0 && !initialCode}
            aria-label={`Digit ${i + 1}`}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, "");
              if (value.length > 1) {
                fill(value, i);
                return;
              }
              setAt(i, value);
              if (value && i < LENGTH - 1) inputs.current[i + 1]?.focus();
            }}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={(e) => onPaste(i, e)}
            onFocus={(e) => e.target.select()}
            className="h-14 w-11 rounded-xl border-2 border-line bg-surface text-center text-2xl font-bold tabular-nums outline-none focus-visible:border-theme aria-invalid:border-danger sm:w-12"
          />
        ))}
      </div>
      {error && (
        <p role="alert" className="text-center text-sm text-danger">
          {error}
        </p>
      )}
      <Button3D type="submit" size="xl" block disabled={!complete || pending}>
        {pending && <LoaderCircle className="size-5 animate-spin" />}
        Gabung
      </Button3D>
    </form>
  );
}
