"use client";

import { KeyRound, LoaderCircle, Plus } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";

import { createApiTokenAction, revokeApiTokenAction } from "./actions";

export function CreateApiToken() {
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createApiTokenAction({ name, expiresInDays: Number(days) });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCreated(result.token);
      setName("");
    });
  }

  if (created) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-warning bg-warning-soft p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4" aria-hidden /> Salin token sekarang
        </p>
        <p className="text-sm text-fg-muted">
          Token ini tidak akan ditampilkan lagi. Simpan di tempat aman (misalnya secret di server
          LMS kamu), jangan di kode yang bisa dilihat orang.
        </p>
        <CopyField label="Token API baru" value={created} />
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() => setCreated(null)}
        >
          Selesai
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={create} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <Label htmlFor="token-name">Nama token</Label>
        <Input
          id="token-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Moodle sekolah"
          maxLength={60}
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="token-expiry">Berlaku</Label>
        <Select id="token-expiry" value={days} onChange={(e) => setDays(e.target.value)}>
          <option value="30">30 hari</option>
          <option value="90">90 hari</option>
          <option value="365">1 tahun</option>
          <option value="0">Tanpa batas</option>
        </Select>
      </div>
      <Button type="submit" disabled={pending || !name.trim()}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Buat token
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

export function RevokeToken({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const result = await revokeApiTokenAction(id);
      if (result.ok) toast.success(`Token “${name}” dicabut.`);
      else toast.error("Token gagal dicabut. Coba lagi.");
      setConfirming(false);
    });
  }

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Cabut
      </Button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <Button variant="danger" size="sm" onClick={revoke} disabled={pending}>
        {pending && <LoaderCircle className="animate-spin" />}
        Cabut “{name}”?
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
        Batal
      </Button>
    </span>
  );
}
