import type { ReactNode } from "react";

import { getAdminPortalHost } from "@/lib/admin-portal";

/**
 * The two halves every sign-in step stands in: the form, and what this place
 * is. The second half says the one thing an operator must know before they
 * sign in — that everything they do here carries their name.
 */
export function SignInFrame({ eyebrow, title, children }: { eyebrow: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-[var(--surface)] md:grid-cols-2">
      <main className="flex items-center justify-center px-4 py-10 sm:px-6 md:py-16">
        <div className="w-full max-w-sm space-y-6">
          <header className="space-y-1">
            <p className="t-body-sm text-[var(--text-muted)]">{eyebrow}</p>
            <h1 className="t-page-title text-[var(--text-strong)]">{title}</h1>
          </header>
          {children}
        </div>
      </main>
      <aside
        aria-label="About this portal"
        className="flex items-center border-t border-[var(--border)] bg-[var(--canvas)] px-4 py-8 sm:px-6 md:border-l md:border-t-0 md:px-12"
      >
        <div className="max-w-md space-y-6">
          <p className="t-section text-[var(--text-strong)]">
            For Corelith staff only.{" "}
            <span className="text-[var(--text-muted)]">Everything you do here is written to the audit log with your name.</span>
          </p>
          <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-2 t-body-sm">
            <dt className="text-[var(--text-muted)]">This address</dt>
            <dd className="font-mono text-[var(--text-body)]">{getAdminPortalHost()}</dd>
            <dt className="text-[var(--text-muted)]">Lost your phone</dt>
            <dd className="text-[var(--text-body)]">Ask an owner to reset your authenticator.</dd>
            <dt className="text-[var(--text-muted)]">Forgot your password</dt>
            <dd className="text-[var(--text-body)]">Ask an owner to send you a new invite.</dd>
          </dl>
        </div>
      </aside>
    </div>
  );
}
