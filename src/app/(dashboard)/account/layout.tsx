import { HostHeader } from "@/components/host/HostHeader";
import { requireHost } from "@/lib/auth";

export default async function AccountLayout({ children }: LayoutProps<"/account">) {
  const user = await requireHost("/account");
  return (
    <>
      <HostHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold">Akun</h1>
        {children}
      </main>
    </>
  );
}
