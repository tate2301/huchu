import * as React from "react";
import { Status, type StatusTone as DsStatusTone } from "@corelithzw/react";

import { cn } from "@/lib/utils";
import {
  getUiStatusPresentation,
  type CanonicalUiStatus,
  type StatusTone,
} from "@/lib/ui/status-map";

/**
 * StatusDot — the design system's `Status`, behind this repo's status
 * vocabulary.
 *
 * The DS now owns the markup (`.status-dot` + a real `.status-dot-mark`
 * element rather than a `::before`), the sizing, the typography, the
 * `role="img"` treatment when the label is hidden, and the `hideLabel` /
 * `dotClassName` props the local copy had hand-rolled.
 *
 * Two things stay local:
 *
 *   - **Labels and canonicalisation** still come from `@/lib/ui/status-map`,
 *     which normalises ~90 raw backend strings onto seven canonical statuses.
 *     The DS has no opinion about any of that.
 *   - **Colour.** This is the deliberate deviation. huchu has seven tones; the
 *     DS has five, and those five collapse onto only *four* dot colours in CSS
 *     — `warn` and `danger` both resolve to `.attention`, which is
 *     `--dot-attention` (brand). Delegating colour outright would render
 *     `failing` and `need_changes` in brand blue and make them
 *     indistinguishable from each other, which is the one thing a status dot
 *     must never do. So the tone is still mapped onto the DS axis (for
 *     structure, ring behaviour and sizing) but the actual colours are pinned
 *     to the `--status-*` tokens, which are themselves aliases into the DS
 *     token set (see `app/themes/corelith-bridge.css`).
 *
 * Those colours are applied as utility classes rather than inline styles so
 * that a caller's `className` / `dotClassName` still wins: Tailwind's layer
 * sits above `@layer corelith`, and `cn()`'s tailwind-merge drops the tone
 * colour when a caller supplies its own — a caller drawing a dot over a dark
 * surface combines `hideLabel` + `dotClassName="h-2 w-2"` +
 * `className="text-white"` and gets white, not the tone.
 *
 * No `"use client"`: `Status` is a plain `forwardRef` with no hooks, so this
 * stays renderable from a server component, as the local copy was.
 *
 * ⚠ `components/ui/status-chip.tsx` exports a *different*, unrelated
 * `StatusDot`. This is not that one.
 */
const TONE_TO_DS: Record<StatusTone, DsStatusTone> = {
  success: "success",
  error: "danger",
  warning: "warn",
  info: "info",
  progress: "info",
  pending: "neutral",
  inactive: "neutral",
};

/**
 * Written out longhand rather than built from `presentation.tokens` so that
 * Tailwind's source scanner can actually see the class names.
 */
const TONE_TEXT_CLASS: Record<StatusTone, string> = {
  success: "text-[var(--status-success-text)]",
  error: "text-[var(--status-error-text)]",
  warning: "text-[var(--status-warning-text)]",
  info: "text-[var(--status-info-text)]",
  progress: "text-[var(--status-progress-text)]",
  pending: "text-[var(--status-pending-text)]",
  inactive: "text-[var(--status-inactive-text)]",
};

const TONE_DOT_CLASS: Record<StatusTone, string> = {
  success: "bg-[var(--status-success-border)]",
  error: "bg-[var(--status-error-border)]",
  warning: "bg-[var(--status-warning-border)]",
  info: "bg-[var(--status-info-border)]",
  progress: "bg-[var(--status-progress-border)]",
  pending: "bg-[var(--status-pending-border)]",
  inactive: "bg-[var(--status-inactive-border)]",
};

/**
 * The DS types `aria-label` as mandatory whenever `hideLabel` is `true`. This
 * shim always derives one from the status map, so the contract holds at
 * runtime — but it cannot be proven to the compiler through a `boolean` prop.
 */
type StatusRootProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: DsStatusTone;
  size?: "sm" | "md";
  ring?: boolean;
  hideLabel?: boolean;
  dotClassName?: string;
};

const StatusRoot = Status as unknown as React.FC<StatusRootProps>;

export interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: string | CanonicalUiStatus | null | undefined;
  label?: string;
  hideLabel?: boolean;
  dotClassName?: string;
}

function StatusDot({
  status,
  label,
  hideLabel = false,
  className,
  dotClassName,
  style,
  "aria-label": ariaLabel,
  ...props
}: StatusDotProps) {
  const presentation = getUiStatusPresentation(status);
  const resolvedLabel = label ?? presentation.label;

  return (
    <StatusRoot
      tone={TONE_TO_DS[presentation.tone]}
      hideLabel={hideLabel}
      className={cn(TONE_TEXT_CLASS[presentation.tone], className)}
      dotClassName={cn(TONE_DOT_CLASS[presentation.tone], dotClassName)}
      data-slot="status-dot"
      data-status={presentation.status}
      data-tone={presentation.tone}
      aria-label={hideLabel ? (ariaLabel ?? resolvedLabel) : ariaLabel}
      style={style}
      {...props}
    >
      {hideLabel ? null : resolvedLabel}
    </StatusRoot>
  );
}

export { StatusDot };
