import type { ReactNode } from "react";

/** A small centred page for the sign-in-as steps that happen outside a workspace's shell. */
export function SignInAsFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--ground)] px-4 py-10">
      <div className="w-full max-w-md space-y-4 rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6">
        <h1 className="t-section text-[var(--ink)]">{title}</h1>
        {children}
      </div>
    </main>
  );
}
