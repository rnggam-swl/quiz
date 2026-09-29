"use client";

import { BarChart3, Eye, EyeOff, KeyRound, LoaderCircle, Share2 } from "lucide-react";
import Link from "next/link";
import { Tabs } from "radix-ui";
import { useEffect, useMemo, useState, useTransition } from "react";
import { renderSVG } from "uqr";

import { useEditor } from "@/components/editor/EditorContext";
import { Button } from "@/components/ui/Button";
import { CopyField } from "@/components/ui/CopyField";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/Dialog";
import { Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";

import {
  getEmbedSecretAction,
  getShareStateAction,
  rotateEmbedSecretAction,
  updateEmbedOriginsAction,
  updatePracticeSettingsAction,
  updateVisibilityAction,
  type PracticeSettings,
  type ShareState,
  type Visibility,
} from "../../share-actions";

const tabClass =
  "border-b-2 border-transparent px-3 py-2 text-sm font-medium text-fg-subtle transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-accent-fg";

/** "Bagikan" in the editor header: practice link, code, QR and embed settings. */
export function ShareButton({ quizId }: { quizId: string }) {
  const published = useEditor((s) => s.latestVersion !== null);
  const [open, setOpen] = useState(false);

  const trigger = (
    <Button variant="secondary" disabled={!published} aria-label="Bagikan">
      <Share2 /> <span className="hidden sm:inline">Bagikan</span>
    </Button>
  );

  if (!published) {
    return (
      <Tooltip content="Publish quiz dulu untuk membagikannya">
        <span tabIndex={0}>{trigger}</span>
      </Tooltip>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="Bagikan untuk latihan"
        description="Peserta bisa mengerjakan kapan saja lewat link, kode, atau quiz yang dipasang di situs lain."
        className="max-w-2xl"
      >
        {open && <ShareBody quizId={quizId} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareBody({ quizId }: { quizId: string }) {
  const [state, setState] = useState<ShareState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getShareStateAction(quizId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setState(result.state);
        else setError(result.error);
      })
      .catch(() => !cancelled && setError("Gagal memuat. Coba lagi."));
    return () => {
      cancelled = true;
    };
  }, [quizId]);

  if (error) return <p className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{error}</p>;
  if (!state) {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
        <LoaderCircle className="size-4 animate-spin" /> Menyiapkan sesi…
      </p>
    );
  }

  return (
    <Tabs.Root defaultValue="link" className="flex flex-col gap-4">
      <Tabs.List className="flex gap-2 border-b border-line" aria-label="Cara berbagi">
        <Tabs.Trigger value="link" className={tabClass}>
          Link &amp; kode
        </Tabs.Trigger>
        <Tabs.Trigger value="embed" className={tabClass}>
          Embed
        </Tabs.Trigger>
        <Tabs.Trigger value="library" className={tabClass}>
          Library
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="link">
        <LinkTab
          quizId={quizId}
          state={state}
          onSettings={(settings) => setState({ ...state, settings })}
        />
      </Tabs.Content>
      <Tabs.Content value="embed">
        <EmbedTab
          quizId={quizId}
          state={state}
          onChange={(patch) => setState({ ...state, ...patch })}
        />
      </Tabs.Content>
      <Tabs.Content value="library">
        <LibraryTab
          quizId={quizId}
          visibility={state.visibility}
          onChange={(visibility) => setState({ ...state, visibility })}
        />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function LinkTab({
  quizId,
  state,
  onSettings,
}: {
  quizId: string;
  state: ShareState;
  onSettings: (settings: PracticeSettings) => void;
}) {
  const [pending, startTransition] = useTransition();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const playUrl = `${origin}/play/${state.code}`;
  const qr = useMemo(() => renderSVG(playUrl, { border: 1 }), [playUrl]);

  function save(patch: Partial<PracticeSettings>) {
    const next = { ...state.settings, ...patch };
    onSettings(next);
    startTransition(async () => {
      const result = await updatePracticeSettingsAction(state.sessionId, next);
      if (!result.ok) toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium text-fg-subtle">Kode</p>
          <p className="font-mono text-4xl font-bold tracking-[0.2em] tabular-nums">
            {state.code.slice(0, 3)} {state.code.slice(3)}
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            Masukkan di <span className="font-mono">{origin}/join</span>
          </p>
        </div>
        <CopyField label="Link" value={playUrl} />

        <fieldset className="flex flex-col gap-3 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm font-medium">Pengaturan latihan</legend>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="share-instant" className="font-normal">
              Tunjukkan benar/salah langsung
            </Label>
            <Switch
              id="share-instant"
              checked={state.settings.feedback === "instant"}
              onCheckedChange={(on) => save({ feedback: on ? "instant" : "end" })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="share-shuffle-q" className="font-normal">
              Acak urutan soal
            </Label>
            <Switch
              id="share-shuffle-q"
              checked={state.settings.shuffleQuestions}
              onCheckedChange={(shuffleQuestions) => save({ shuffleQuestions })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="share-shuffle-o" className="font-normal">
              Acak urutan opsi
            </Label>
            <Switch
              id="share-shuffle-o"
              checked={state.settings.shuffleOptions}
              onCheckedChange={(shuffleOptions) => save({ shuffleOptions })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="share-attempts" className="font-normal">
              Kesempatan per peserta
            </Label>
            <Select
              id="share-attempts"
              className="w-36"
              value={state.settings.attempts}
              onChange={(e) => save({ attempts: Number(e.target.value) })}
            >
              <option value={0}>Tanpa batas</option>
              <option value={1}>1 kali</option>
              <option value={2}>2 kali</option>
              <option value={3}>3 kali</option>
            </Select>
          </div>
          <p className="text-xs text-fg-subtle" aria-live="polite">
            {pending ? "Menyimpan…" : "Perubahan berlaku untuk percobaan berikutnya."}
          </p>
        </fieldset>

        <Button asChild variant="ghost" className="self-start">
          <Link href={`/quizzes/${quizId}/results`}>
            <BarChart3 /> Lihat hasil peserta
          </Link>
        </Button>
      </div>

      <figure className="flex flex-col items-center gap-2">
        {/* uqr renders a plain SVG string from our own URL — no user HTML involved. */}
        <div
          className="size-44 overflow-hidden rounded-xl border border-line bg-white p-1"
          role="img"
          aria-label={`Kode QR untuk ${playUrl}`}
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <figcaption className="text-xs text-fg-subtle">Pindai untuk bergabung</figcaption>
      </figure>
    </div>
  );
}

function EmbedTab({
  quizId,
  state,
  onChange,
}: {
  quizId: string;
  state: ShareState;
  onChange: (patch: Partial<ShareState>) => void;
}) {
  const [origins, setOrigins] = useState(state.embedOrigins.join("\n"));
  const [originsError, setOriginsError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const appOrigin = typeof window === "undefined" ? "" : window.location.origin;
  const slug = state.slug ?? "…";

  const scriptSnippet = `<div data-quiz="${slug}"></div>\n<script src="${appOrigin}/embed.js" async></script>`;
  const iframeSnippet = `<iframe src="${appOrigin}/embed/${slug}"\n  style="width:100%;border:0;min-height:560px"\n  allow="fullscreen; autoplay" loading="lazy"></iframe>`;

  function saveOrigins() {
    setOriginsError(null);
    startTransition(async () => {
      const result = await updateEmbedOriginsAction(quizId, origins.split(/\s+/));
      if (!result.ok) {
        setOriginsError(result.error);
        return;
      }
      setOrigins(result.origins.join("\n"));
      onChange({ embedOrigins: result.origins });
      toast.success("Domain disimpan. Berlaku dalam ±1 menit.");
    });
  }

  function revealSecret() {
    startTransition(async () => {
      const result = await getEmbedSecretAction(quizId);
      if (result.ok) setSecret(result.secret);
    });
  }

  function rotate() {
    startTransition(async () => {
      const result = await rotateEmbedSecretAction(quizId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSecret(result.secret);
      onChange({ hasEmbedSecret: true });
      toast.success(
        state.hasEmbedSecret ? "Secret diganti. Token lama tidak berlaku lagi." : "Secret dibuat.",
      );
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="embed-origins">Domain yang boleh memasang quiz ini</Label>
        <Textarea
          id="embed-origins"
          rows={3}
          value={origins}
          onChange={(e) => setOrigins(e.target.value)}
          placeholder={"https://blog-sekolah.sch.id\nhttps://lms.contoh.id"}
          aria-invalid={originsError ? true : undefined}
          className="font-mono text-xs"
        />
        <p className="text-xs text-fg-subtle">
          Satu per baris, dengan <span className="font-mono">https://</span>. Kosongkan untuk
          mematikan embed.
          {state.embedOrigins.length === 0 && " Embed sedang mati."}
        </p>
        {originsError && <p className="text-xs text-danger">{originsError}</p>}
        <Button variant="secondary" className="self-start" disabled={pending} onClick={saveOrigins}>
          Simpan domain
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Pasang dengan script (disarankan)</span>
        <CopyField label="Snippet script" value={scriptSnippet} multiline />
        <span className="text-sm font-medium">Atau iframe langsung</span>
        <CopyField label="Snippet iframe" value={iframeSnippet} multiline />
        <span className="text-sm font-medium">Atau tempel link di WordPress, Notion, dll.</span>
        <CopyField label="Link embed (oEmbed)" value={`${appOrigin}/embed/${slug}`} />
        <p className="text-xs text-fg-subtle">
          WordPress butuh plugin Quiz Embed agar quiz tidak dibatasi (lihat dokumentasi embed).
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="size-4" /> Identitas peserta dari situsmu (opsional)
        </span>
        <p className="text-xs text-fg-muted">
          Server situsmu menandatangani token JWT (HS256) dengan secret ini, lalu mengirimnya lewat{" "}
          <span className="font-mono">data-token</span>. Nama asli peserta akan muncul di laporan.
          Contoh kode ada di dokumentasi embed.
        </p>
        {secret ? (
          <CopyField label="Embed secret" value={secret} />
        ) : state.hasEmbedSecret ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={revealSecret}
            disabled={pending}
          >
            <Eye /> Tampilkan secret
          </Button>
        ) : null}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={rotate} disabled={pending}>
            {state.hasEmbedSecret ? "Ganti secret" : "Buat secret"}
          </Button>
          {secret && (
            <Button variant="ghost" size="sm" onClick={() => setSecret(null)}>
              <EyeOff /> Sembunyikan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const VISIBILITY: { value: Visibility; label: string; body: string }[] = [
  {
    value: "private",
    label: "Pribadi",
    body: "Hanya kamu. Peserta tetap bisa bermain lewat link dan kode.",
  },
  {
    value: "unlisted",
    label: "Dengan link",
    body: "Tidak muncul di library, tapi siapa pun yang punya link library bisa melihat dan menyalinnya.",
  },
  {
    value: "public",
    label: "Publik di library",
    body: "Muncul di pencarian library. Guru lain bisa melihat soal dan menyalinnya ke akun mereka.",
  },
];

function LibraryTab({
  quizId,
  visibility,
  onChange,
}: {
  quizId: string;
  visibility: Visibility;
  onChange: (visibility: Visibility) => void;
}) {
  const [pending, startTransition] = useTransition();
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  function choose(next: Visibility) {
    startTransition(async () => {
      const result = await updateVisibilityAction(quizId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onChange(result.visibility);
      toast.success(
        next === "public"
          ? "Quiz muncul di library."
          : next === "unlisted"
            ? "Quiz bisa dilihat lewat link."
            : "Quiz tidak dibagikan ke library.",
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2" disabled={pending}>
        <legend className="mb-1 text-sm font-medium">
          Siapa yang bisa melihat dan menyalin soal?
        </legend>
        {VISIBILITY.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name="visibility"
              value={option.value}
              checked={visibility === option.value}
              onChange={() => choose(option.value)}
              className="mt-1 accent-accent"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{option.label}</span>
              <span className="text-xs text-fg-muted">{option.body}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {visibility !== "private" && (
        <>
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            Salinan berisi kunci jawaban. Jangan bagikan quiz yang dipakai untuk ujian.
          </p>
          <CopyField label="Link library" value={`${origin}/library/${quizId}`} />
          <p className="text-xs text-fg-subtle">
            Library selalu menampilkan versi terbit terakhir, bukan draf yang sedang diedit.
          </p>
        </>
      )}
    </div>
  );
}
