"use client";

import { LoaderCircle, Plus, Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";

import { createLtiPlatformAction, deleteLtiPlatformAction, type PlatformInput } from "./actions";

const EMPTY: PlatformInput = {
  name: "",
  issuer: "",
  clientId: "",
  authLoginUrl: "",
  authTokenUrl: "",
  jwksUrl: "",
  deploymentIds: "",
};

const FIELDS: {
  key: keyof PlatformInput;
  label: string;
  placeholder: string;
  optional?: boolean;
}[] = [
  { key: "name", label: "Nama", placeholder: "Moodle SMA 1" },
  { key: "issuer", label: "Issuer (Platform ID)", placeholder: "https://lms.sekolah.id" },
  { key: "clientId", label: "Client ID", placeholder: "a1B2c3D4e5" },
  {
    key: "authLoginUrl",
    label: "URL login (OIDC auth)",
    placeholder: "https://lms.sekolah.id/mod/lti/auth.php",
  },
  {
    key: "authTokenUrl",
    label: "URL token (OAuth2)",
    placeholder: "https://lms.sekolah.id/mod/lti/token.php",
  },
  {
    key: "jwksUrl",
    label: "URL keyset (JWKS)",
    placeholder: "https://lms.sekolah.id/mod/lti/certs.php",
  },
  { key: "deploymentIds", label: "Deployment ID", placeholder: "1", optional: true },
];

export function CreateLtiPlatform() {
  const [form, setForm] = useState<PlatformInput>(EMPTY);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createLtiPlatformAction(form);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setForm(EMPTY);
      setOpen(false);
      toast.success("LMS ditambahkan. Coba buka aktivitasnya dari LMS.");
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
        <Plus /> Tambah LMS
      </Button>
    );
  }

  const complete = FIELDS.every((f) => f.optional || form[f.key].trim());
  return (
    <form onSubmit={create} className="flex flex-col gap-3 rounded-xl border border-line p-4">
      <p className="text-sm text-fg-muted">
        Salin nilai-nilai ini dari halaman detail tool di LMS setelah kamu mendaftarkan URL di atas.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label htmlFor={`lti-${field.key}`}>
              {field.label}
              {field.optional && <span className="font-normal text-fg-subtle"> (opsional)</span>}
            </Label>
            <Input
              id={`lti-${field.key}`}
              value={form[field.key]}
              onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              placeholder={field.placeholder}
              aria-invalid={error ? true : undefined}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-fg-subtle">
        Deployment ID kosong: semua deployment dari Client ID ini diterima. Beberapa ID bisa dipisah
        koma.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !complete}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Simpan LMS
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </form>
  );
}

export function DeleteLtiPlatform({ id, name }: { id: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteLtiPlatformAction(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  return confirm ? (
    <span className="flex gap-2">
      <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
        Hapus {name}?
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
        Batal
      </Button>
    </span>
  ) : (
    <Button variant="ghost" size="sm" onClick={() => setConfirm(true)} aria-label={`Hapus ${name}`}>
      <Trash2 />
    </Button>
  );
}
