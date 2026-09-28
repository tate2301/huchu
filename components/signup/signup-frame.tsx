import type { ReactNode } from "react";

import { Lightning } from "@/lib/icons";

/** Steps from the signup page to a workspace: who you are, the code, the workspace. */
export const SIGNUP_STEPS = 3;

/**
 * The page every signup step sits on: the product's mark, where you are in
 * the steps, one card with a title and one line under it, and a footer line.
 *
 * On a phone the card loses its border and ground, so the form sits on the
 * page rather than in a white box floating on it.
 */
export function SignupFrame({
  productName,
  step,
  totalSteps,
  title,
  lede,
  footer,
  children,
}: {
  productName: string;
  step?: number;
  totalSteps?: number;
  title: string;
  lede?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const showSteps = Boolean(step && totalSteps);

  return (
    <div className="min-h-dvh bg-[var(--canvas)] px-4 py-10 sm:py-14">
      <div className="mx-auto flex w-full max-w-[420px] flex-col">
        <div className="mb-7 flex items-center justify-center gap-2 text-[var(--text-strong)] [font:var(--type-section-title)]">
          <Lightning aria-hidden="true" className="size-[22px] text-[var(--brand)]" />
          {productName}
        </div>

        {showSteps ? (
          <>
            <p className="mb-2.5 text-[var(--text-muted)] [font:var(--type-caption)]">
              Step {step} of {totalSteps}
            </p>
            <div
              role="progressbar"
              aria-label={`Step ${step} of ${totalSteps}`}
              aria-valuemin={1}
              aria-valuemax={totalSteps}
              aria-valuenow={step}
              className="mb-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface-deep)]"
            >
              <div
                className="h-full rounded-full bg-[var(--brand)]"
                style={{ width: `${((step ?? 0) / (totalSteps ?? 1)) * 100}%` }}
              />
            </div>
          </>
        ) : null}

        <main className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] p-6 max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
          <h1 className="mb-1 text-balance text-[var(--text-strong)] [font:var(--type-page-title)]">{title}</h1>
          {lede ? <p className="mb-5 text-[var(--text-muted)] [font:var(--type-body-sm)]">{lede}</p> : null}
          {children}
        </main>

        {footer ? (
          <p className="mt-4 text-center text-[var(--text-muted)] [font:var(--type-caption)]">{footer}</p>
        ) : null}
      </div>
    </div>
  );
}
