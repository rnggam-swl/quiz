"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";

import { changePasswordAction, updateProfileAction, type AccountFormState } from "./actions";
import { Section } from "./Section";

function Feedback({ state }: { state: AccountFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
        {state.error}
      </p>
    );
  }
  if (state.notice) {
    return (
      <p role="status" className="rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
        {state.notice}
      </p>
    );
  }
  return null;
}

export function ProfileForm({ name, email }: { name: string; email: string | null }) {
  const [state, action, pending] = useActionState(updateProfileAction, {});
  return (
    <Section title="Profil">
      <form action={action} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">Nama</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            defaultValue={name}
            maxLength={80}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="account-email">Email</Label>
          <Input id="account-email" value={email ?? ""} readOnly disabled />
        </div>
        <Feedback state={state} />
        <Button type="submit" className="self-start" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          Simpan
        </Button>
      </form>
    </Section>
  );
}

export function PasswordForm({
  hasPassword,
  email,
}: {
  hasPassword: boolean;
  email: string | null;
}) {
  const [state, action, pending] = useActionState(changePasswordAction, {});
  return (
    <Section
      title={hasPassword ? "Ubah password" : "Buat password"}
      description={
        hasPassword
          ? undefined
          : "Kamu masuk dengan Google. Buat password supaya bisa masuk dengan email juga."
      }
    >
      <form action={action} className="flex flex-col gap-4" noValidate>
        {/* Lets password managers file the new password under the right account. */}
        <input type="hidden" name="username" autoComplete="username" value={email ?? ""} />
        {hasPassword && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current">Password saat ini</Label>
            <Input
              id="current"
              name="current"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
        )}
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
        <Feedback state={state} />
        <Button type="submit" className="self-start" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />}
          {hasPassword ? "Ganti password" : "Buat password"}
        </Button>
      </form>
    </Section>
  );
}
