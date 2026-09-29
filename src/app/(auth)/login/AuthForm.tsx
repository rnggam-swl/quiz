"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

import { signInAction, signInWithGoogleAction, signUpAction, type AuthFormState } from "../actions";

export function AuthForm({
  mode,
  next,
  initialError,
  googleEnabled,
}: {
  mode: "signin" | "signup";
  next: string;
  initialError?: string;
  googleEnabled: boolean;
}) {
  const signup = mode === "signup";
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    signup ? signUpAction : signInAction,
    { error: initialError },
  );
  const otherHref = `/login?${new URLSearchParams({ ...(signup ? {} : { mode: "signup" }), next })}`;

  if (state.notice) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-line bg-surface p-6 text-center shadow-card"
      >
        <p className="text-lg font-semibold">Cek email kamu 📬</p>
        <p className="mt-2 text-sm text-fg-muted">{state.notice}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-lg font-semibold">{signup ? "Buat akun guru" : "Masuk"}</h1>
        <p className="text-sm text-fg-muted">
          {signup
            ? "Gratis. Buat quiz pertamamu dalam hitungan menit."
            : "Lanjutkan ke quiz-quiz kamu."}
        </p>
      </div>

      {googleEnabled && (
        <>
          <form action={signInWithGoogleAction}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="secondary" size="lg" className="w-full">
              <svg viewBox="0 0 24 24" aria-hidden className="size-4">
                <path
                  fill="#4285F4"
                  d="M22.5 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8Z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3 0 5.4-1 7.2-2.7l-3.5-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.2v2.8A11 11 0 0 0 12 23Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.6-2.8Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4Z"
                />
              </svg>
              Lanjut dengan Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-xs text-fg-subtle">
            <span className="h-px flex-1 bg-line" /> atau <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form action={action} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {signup && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Nama</Label>
            <Input id="name" name="name" autoComplete="name" defaultValue={state.name} required />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={state.email}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="password">Password</Label>
            {!signup && (
              <Link href="/forgot-password" className="text-xs text-accent-fg underline">
                Lupa password?
              </Link>
            )}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={signup ? "new-password" : "current-password"}
            minLength={signup ? 8 : undefined}
            required
          />
          {signup && <p className="text-xs text-fg-subtle">Minimal 8 karakter.</p>}
        </div>

        {state.error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          {signup ? "Daftar" : "Masuk"}
        </Button>
      </form>

      <p className="text-center text-sm text-fg-muted">
        {signup ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
        <Link href={otherHref} className="font-medium text-accent-fg underline">
          {signup ? "Masuk" : "Daftar"}
        </Link>
      </p>
    </div>
  );
}
