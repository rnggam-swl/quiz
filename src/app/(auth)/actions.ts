"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser, safeNextPath } from "@/lib/auth";
import { authMessage, MIN_PASSWORD, newPasswordSchema } from "@/lib/auth-errors";
import { RECOVERY_COOKIE, verifyRecoveryMarker } from "@/lib/recovery";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  notice?: string;
  email?: string;
  name?: string;
};

const credentials = z.object({
  email: z.email("Email tidak valid.").max(254),
  password: z.string().min(1, "Password wajib diisi.").max(128),
});

const signUpSchema = credentials.extend({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(80),
  password: z.string().min(MIN_PASSWORD, `Password minimal ${MIN_PASSWORD} karakter.`).max(128),
});

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
      emailRedirectTo: `${await requestOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
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
    options: {
      redirectTo: `${await requestOrigin()}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error || !data.url) redirect("/login?error=oauth");
  redirect(data.url);
}

/**
 * Lupa password (P8-16). Always the same answer, whether or not the email has an account,
 * so the form can't be used to find out who is registered.
 */
export async function requestPasswordResetAction(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const email = String(form.get("email") ?? "");
  const parsed = z.email("Email tidak valid.").max(254).safeParse(email.trim());
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await requestOrigin()}/auth/callback?flow=recovery&next=/reset-password`,
  });
  if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return { error: authMessage(error.code), email };
  }
  return {
    notice: `Jika ${parsed.data} terdaftar, kami sudah mengirim link untuk membuat password baru. Link berlaku sebentar, buka di browser ini.`,
  };
}

/** Set a new password from the reset link: needs the recovery marker, not the old password. */
export async function resetPasswordAction(
  _prev: AuthFormState,
  form: FormData,
): Promise<AuthFormState> {
  const user = await getSessionUser();
  const jar = await cookies();
  if (
    !user ||
    user.isAnonymous ||
    !verifyRecoveryMarker(jar.get(RECOVERY_COOKIE)?.value, user.id)
  ) {
    return { error: "Link reset sudah kedaluwarsa. Minta link baru." };
  }
  const parsed = newPasswordSchema.safeParse({
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: authMessage(error.code) };

  jar.delete(RECOVERY_COOKIE);
  redirect("/account?password=reset");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
