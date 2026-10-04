import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";

import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { PasswordForm, ProfileForm } from "./AccountForms";

export const metadata: Metadata = { title: "Akun" };

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const user = await requireHost("/account");
  const { password } = await searchParams;
  const supabase = await createClient();
  const [{ data: profile }, { data: hasPassword }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).single(),
    supabase.rpc("account_has_password"),
  ]);

  return (
    <>
      {password === "reset" && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm font-medium text-success"
        >
          <CircleCheck className="size-4 shrink-0" aria-hidden /> Password baru tersimpan.
        </p>
      )}
      <ProfileForm name={profile?.display_name ?? ""} email={user.email} />
      <PasswordForm hasPassword={hasPassword === true} email={user.email} />
    </>
  );
}
