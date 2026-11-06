"use client";

import Link from "next/link";
import {
  ci_arrow_right,
  ci_lock,
  ci_shield,
  ci_user,
} from "@/components/books/icons/glyphs";
import { CiGlyphIcon } from "@/components/books/icons/glyph-icon";
import { PageChrome } from "@/components/layout/page-chrome";
import { useOptionalShellNav } from "@/components/layout/shell-nav";

const RECOVERY_STEPS = [
  {
    step: "01",
    title: "Verify your signed-in identity",
    desc: "Confirm you are signed in with the corporate email address provisioned for this organization.",
  },
  {
    step: "02",
    title: "Contact your workspace administrator",
    desc: "Ask your administrator or billing owner to confirm that your seat assignment and organization lease are active.",
  },
  {
    step: "03",
    title: "Retry once permissions are updated",
    desc: "After membership or organization status has been restored, refresh or retry connection.",
  },
] as const;

function AccessGateCard() {
  return (
    <div className="w-full max-w-[540px]">
      {/* Brand / System badge */}
      <div className="mb-6 flex items-center justify-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-md border border-border bg-surface text-text-muted">
          <CiGlyphIcon glyph={ci_shield} className="size-4 text-text-muted" />
        </span>
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-text-muted">
          Platform Access Gate
        </span>
      </div>

      {/* Central Gate Panel */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface shadow-xs">
        {/* Header section */}
        <div className="border-b border-border bg-surface-muted/50 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface text-text-strong">
              <CiGlyphIcon glyph={ci_lock} className="size-5" />
            </div>
            <span className="inline-flex items-center rounded-md border border-border bg-surface px-2.5 py-0.5 font-mono text-xs font-medium tracking-tight text-text-muted">
              Access Restricted
            </span>
          </div>

          <h1
            id="access-gate-title"
            className="mt-4 text-xl font-semibold tracking-tight text-text-strong sm:text-2xl"
          >
            Access blocked for this organization
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Your signed-in account is not authorized to access this tenant host, or the organization membership is currently inactive.
          </p>
        </div>

        {/* Body Section */}
        <div className="space-y-6 p-6 sm:p-7">
          {/* Status notice */}
          <div className="rounded-md border border-border bg-surface-muted/30 p-4 text-sm leading-relaxed text-text-body">
            <span className="font-semibold text-text-strong">Why this happens: </span>
            Access to this host is gated by organization tenant policy. If your team recently switched domains, modified subscription tiers, or changed roles, permissions may need to be refreshed.
          </div>

          {/* Structured Recovery Steps */}
          <div>
            <h2 className="text-sm font-semibold text-text-strong">
              Recommended Resolution
            </h2>
            <ol className="mt-3 divide-y divide-border rounded-md border border-border">
              {RECOVERY_STEPS.map((item) => (
                <li key={item.step} className="flex items-start gap-3.5 bg-surface p-3.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded bg-surface-muted font-mono text-xs font-semibold tabular-nums text-text-muted">
                    {item.step}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text-strong">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-sm leading-normal text-text-muted">
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:items-center">
            <Link
              href="/"
              className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-medium text-white transition hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span>Retry Access</span>
              <CiGlyphIcon glyph={ci_arrow_right} className="size-3.5" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-sm font-medium text-text-strong transition hover:bg-surface-muted focus-visible:outline-none"
            >
              <CiGlyphIcon glyph={ci_user} className="size-3.5 text-text-muted" />
              <span>Switch Account</span>
            </Link>
          </div>
        </div>

        {/* Footer note */}
        <div className="border-t border-border bg-surface-muted/50 px-6 py-3 sm:px-7">
          <p className="text-center font-mono text-xs tabular-nums text-text-muted">
            Tenant ID & host records logged for security auditing
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AccessBlockedPage() {
  const nav = useOptionalShellNav();

  if (nav) {
    return (
      <>
        <PageChrome title="Access Blocked" />
        <main
          className="flex flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8"
          aria-labelledby="access-gate-title"
        >
          <AccessGateCard />
        </main>
      </>
    );
  }

  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12 sm:px-6 lg:px-8"
      aria-labelledby="access-gate-title"
    >
      <AccessGateCard />
    </main>
  );
}
