"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

import { requestPasswordResetAction, type AuthFormState } from "../actions";

export function ForgotForm({ initialError }: { initialError?: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordResetAction,
    { error: initialError },
  );

  if (state.notice) {
    return (
      <div
        role="status"
        className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 text-center shadow-card"
      >
        <p className="text-lg font-semibold">Cek email kamu 📬</p>
        <p className="text-sm text-fg-muted">{state.notice}</p>
        <Link href="/login" className="text-sm font-medium text-accent-fg underline">
          Kembali ke halaman masuk
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-lg font-semibold">Lupa password</h1>
        <p className="text-sm text-fg-muted">
          Masukkan email akunmu. Kami kirim link untuk membuat password baru.
        </p>
      </div>
      <form action={action} className="flex flex-col gap-4" noValidate>
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
        {state.error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          Kirim link reset
        </Button>
      </form>
      <p className="text-center text-sm text-fg-muted">
        Ingat passwordnya?{" "}
        <Link href="/login" className="font-medium text-accent-fg underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
