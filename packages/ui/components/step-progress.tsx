"use client"

import { Stepper } from "@corelithzw/react"

/**
 * StepProgress — the design system's `Stepper` in its compact `bars` form.
 *
 * The bar track, the "Step name — 2/4" counter row and the visually-hidden
 * `<ol>` that names every step for assistive tech are all the DS's now
 * (`variant="bars"` + `showCounter`), so the hand-rolled bar states and the
 * `space-y-2` wrapper are gone.
 *
 * ── The off-by-one, and why this file uses `currentIndex` ──────────────────
 *
 * This component's `currentStepIndex` is **0-BASED** — all three call sites
 * (`platform-wizards`, `employee-wizard`, `onboarding-dialog`) pass raw wizard
 * state where the first step is `0`.
 *
 * The DS `Stepper` has *two* ways in:
 *   - `current`      — **1-BASED**, and it defaults to `1`;
 *   - `currentIndex` — **0-BASED**, added precisely so callers like this one
 *                      cannot get the conversion wrong.
 *
 * Forwarding `currentStepIndex` into `current` would compile, run, and be
 * silently wrong on every wizard in the app: step 0 would highlight step 1,
 * step 1 would highlight step 2, and the final step would fall off the end.
 * There is no type error and no runtime error to catch it — only the wrong bar
 * lit up. So the value goes into `currentIndex` untouched and no arithmetic is
 * written anywhere in this file. If you ever switch this to `current`, you must
 * write `currentStepIndex + 1` — and `current` wins when both are supplied, so
 * do not pass both.
 *
 * `ariaLabel` lands on the DS root as `aria-label`, overriding its default
 * "Progress steps". The DS calls a step's visible text `title` where this file
 * calls it `label`; that rename is the only shape change to `steps`.
 */
type StepProgressItem = {
  id: string
  label: string
}

type StepProgressProps = {
  steps: StepProgressItem[]
  /** 0-BASED. See the note above before touching how this is forwarded. */
  currentStepIndex: number
  ariaLabel: string
  className?: string
}

export function StepProgress({
  steps,
  currentStepIndex,
  ariaLabel,
  className,
}: StepProgressProps) {
  return (
    <Stepper
      variant="bars"
      showCounter
      steps={steps.map((step) => ({ id: step.id, title: step.label }))}
      // 0-based in, 0-based out. Never `current` — that prop is 1-based.
      currentIndex={currentStepIndex}
      aria-label={ariaLabel}
      className={className}
    />
  )
}
