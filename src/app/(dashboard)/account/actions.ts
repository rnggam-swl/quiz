"use server";

import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHost } from "@/lib/auth";
import { authMessage, newPasswordSchema } from "@/lib/auth-errors";
import { getPublicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AccountFormState = { error?: string; notice?: string };

const nameSchema = z.string().trim().min(1, "Nama wajib diisi.").max(80, "Nama maksimal 80 huruf.");

export async function updateProfileAction(
  _prev: AccountFormState,
  form: FormData,
): Promise<AccountFormState> {
  const user = await requireHost("/account");
  const parsed = nameSchema.safeParse(form.get("name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data })
    .eq("id", user.id);
  if (error) return { error: "Nama gagal disimpan. Coba lagi." };
  revalidatePath("/account");
  return { notice: "Nama tersimpan." };
}

/**
 * Checks a password without touching the cookie session: a throwaway client signs in,
 * then signs that one session out again.
 */
async function passwordMatches(email: string, password: string): Promise<boolean> {
  const env = getPublicEnv();
  const verifier = createStatelessClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  const { error } = await verifier.auth.signInWithPassword({ email, password });
  if (error) return false;
  await verifier.auth.signOut({ scope: "local" });
  return true;
}

/** Ubah password (P8-16). Accounts that already have one must confirm the current password. */
export async function changePasswordAction(
  _prev: AccountFormState,
  form: FormData,
): Promise<AccountFormState> {
  const user = await requireHost("/account");
  const parsed = newPasswordSchema.safeParse({
    password: form.get("password"),
    confirm: form.get("confirm"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };

  const supabase = await createClient();
  const { data: hasPassword, error: checkError } = await supabase.rpc("account_has_password");
  if (checkError) return { error: "Terjadi kesalahan. Coba lagi." };
  if (hasPassword) {
    const current = String(form.get("current") ?? "");
    if (!current) return { error: "Masukkan password saat ini." };
    if (!user.email || !(await passwordMatches(user.email, current))) {
      return { error: "Password saat ini salah." };
    }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: authMessage(error.code) };
  revalidatePath("/account");
  return {
    notice: hasPassword
      ? "Password diganti."
      : "Password dibuat. Sekarang kamu juga bisa masuk dengan email.",
  };
}
