"use client";

import { Eye, EyeOff, LoaderCircle, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Input, Label } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";

import {
  createWebhookAction,
  deleteWebhookAction,
  redeliverWebhookAction,
  sendTestWebhookAction,
  setWebhookActiveAction,
  webhookSecretAction,
} from "./actions";

export function CreateWebhook() {
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createWebhookAction({ url, description });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setUrl("");
      setDescription("");
      toast.success("Webhook ditambahkan. Coba “Kirim tes”.");
    });
  }

  return (
    <form onSubmit={create} className="flex flex-wrap items-end gap-3">
      <div className="flex min-w-64 flex-[2] flex-col gap-1.5">
        <Label htmlFor="webhook-url">URL penerima</Label>
        <Input
          id="webhook-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://lms.sekolah.id/webhooks/quiz"
          aria-invalid={error ? true : undefined}
        />
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-1.5">
        <Label htmlFor="webhook-description">Keterangan (opsional)</Label>
        <Input
          id="webhook-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={100}
          placeholder="Nilai ke Moodle"
        />
      </div>
      <Button type="submit" disabled={pending || !url.trim()}>
        {pending ? <LoaderCircle className="animate-spin" /> : <Plus />} Tambah webhook
      </Button>
      {error && (
        <p role="alert" className="w-full text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

export function WebhookControls({ id, url, active }: { id: string; url: string; active: boolean }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    startTransition(async () => {
      const result = await setWebhookActiveAction(id, next);
      if (!result.ok) toast.error(result.error);
    });
  }

  function test() {
    startTransition(async () => {
      const result = await sendTestWebhookAction(id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  function reveal(rotate: boolean) {
    startTransition(async () => {
      const result = await webhookSecretAction(id, rotate);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSecret(result.secret);
      if (rotate) toast.success("Secret diganti. Perbarui juga di server penerima.");
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteWebhookAction(id);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          checked={active}
          onCheckedChange={toggle}
          disabled={pending}
          aria-label={`Webhook ${url} aktif`}
        />
        <Button variant="secondary" size="sm" onClick={test} disabled={pending || !active}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Send />} Kirim tes
        </Button>
        {secret ? (
          <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>
            <EyeOff /> Sembunyikan secret
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => reveal(false)} disabled={pending}>
            <Eye /> Secret
          </Button>
        )}
        {confirmDelete ? (
          <>
            <Button variant="danger" size="sm" onClick={remove} disabled={pending}>
              Hapus webhook ini?
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Batal
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Hapus webhook ${url}`}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {secret && (
        <div className="flex flex-col gap-1.5">
          <CopyField label={`Secret webhook ${url}`} value={secret} />
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => reveal(true)}
            disabled={pending}
          >
            <RotateCcw /> Ganti secret
          </Button>
        </div>
      )}
    </div>
  );
}

export function Redeliver({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await redeliverWebhookAction(id);
          if (result.ok) toast.success(result.message);
          else toast.error(result.error);
        })
      }
    >
      {pending ? <LoaderCircle className="animate-spin" /> : <RotateCcw />} Kirim ulang
    </Button>
  );
}
