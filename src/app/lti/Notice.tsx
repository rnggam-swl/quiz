export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <main className="m-auto flex max-w-sm flex-col items-center gap-2 p-6 text-center text-fg-muted">
      <p className="text-3xl" aria-hidden>
        🧩
      </p>
      {children}
    </main>
  );
}
