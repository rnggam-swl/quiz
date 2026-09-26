"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { safeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  notice?: string;
  email?: string;
  name?: string;
};

const MIN_PASSWORD = 8;

const credentials = z.object({
  email: z.email("Email tidak valid.").max(254),
  password: z.string().min(1, "Password wajib diisi.").max(128),
});

const signUpSchema = credentials.extend({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(80),
  password: z.string().min(MIN_PASSWORD, `Password minimal ${MIN_PASSWORD} karakter.`).max(128),
});

/** Supabase auth error codes → messages people understand. */
function authMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "Email atau password salah.";
    case "email_not_confirmed":
      return "Email belum dikonfirmasi. Cek kotak masuk kamu.";
    case "user_already_exists":
    case "email_exists":
      return "Email ini sudah terdaftar. Silakan masuk.";
    case "weak_password":
      return "Password terlalu lemah. Pakai kombinasi huruf dan angka.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
    case "signup_disabled":
      return "Pendaftaran sedang ditutup.";
    default:
      return "Terjadi kesalahan. Coba lagi.";
  }
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signInAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = String(form.get("email") ?? "");
  const parsed = credentials.safeParse({ email, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authMessage(error.code), email };

  redirect(safeNextPath(String(form.get("next") ?? "")));
}

export async function signUpAction(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const email = String(form.get("email") ?? "");
  const name = String(form.get("name") ?? "");
  const parsed = signUpSchema.safeParse({ email, name, password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email, name };

  const next = safeNextPath(String(form.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: authMessage(error.code), email, name };

  // With email confirmation on, there's no session yet.
  if (!data.session) {
    return { notice: `Hampir selesai! Buka email ${parsed.data.email} untuk konfirmasi akun.` };
  }
  redirect(next);
}

export async function signInWithGoogleAction(form: FormData): Promise<void> {
  const next = safeNextPath(String(form.get("next") ?? ""));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
