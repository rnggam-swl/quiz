"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

import { resetPasswordAction, type AuthFormState } from "../actions";

export function NewPasswordForm({ email }: { email: string | null }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(resetPasswordAction, {});
  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-lg font-semibold">Buat password baru</h1>
        {email && <p className="text-sm text-fg-muted">untuk {email}</p>}
      </div>
      <form action={action} className="flex flex-col gap-4" noValidate>
        {/* Lets password managers save the new password under the right account. */}
        <input type="hidden" name="username" autoComplete="username" value={email ?? ""} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">Password baru</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <p className="text-xs text-fg-subtle">Minimal 8 karakter.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirm">Ulangi password baru</Label>
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        {state.error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          Simpan password
        </Button>
      </form>
    </div>
  );
}
