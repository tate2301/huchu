"use client";

import { Button } from "@corelithzw/ui/components/button";
import {
  ArrowRight,
  CalendarCheck,
  Clock,
  FileText,
  Mail,
  Payments,
  Phone,
  Plus,
  Send,
  Wrench,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";
import type { NextStep, NextStepAction } from "@/lib/crm/tones";

/**
 * The "Up next" call to action, the way the canvas draws it.
 *
 * The rail used to end a record with a grey sentence — "Nothing scheduled,
 * this deal will go quiet" — and nothing to press. That is a page telling
 * somebody off for a state it could have let them fix in one click, and it is
 * the reason the record pages read as reference material rather than as work.
 *
 * So: an amber callout that says what happens if nobody acts, and directly
 * under it one full-width primary button carrying the verb. Amber only while
 * the record is actually drifting — an urgency colour spent on every record is
 * a colour that stops meaning urgent — and never more than one button, because
 * two next steps is no next step.
 *
 * Which sheet the button opens is the page's business; `resolveNextStep` in
 * `lib/crm/tones` decides which verb it carries.
 */
const STEP_ICON: Record<NextStepAction, LucideIcon> = {
  call: Phone,
  visit: CalendarCheck,
  quote: FileText,
  chase: Send,
  payment: Payments,
  job: Wrench,
  convert: ArrowRight,
  deal: Plus,
  email: Mail,
};

type NextStepProps = {
  step: NextStep;
  onAct: () => void;
  /** The action cannot be taken yet — quoting with no company to bill, say. */
  disabled?: boolean;
  disabledReason?: string;
};

/**
 * The verb on its own, for the app bar.
 *
 * The bar and the rail carry the same decision, so they share one component
 * rather than two lists of buttons that can disagree about what a record needs
 * next — which is exactly what had happened on the deal page.
 */
export function NextStepButton({
  step,
  onAct,
  disabled,
  disabledReason,
  className,
}: NextStepProps & { className?: string }) {
  const Icon = STEP_ICON[step.action];

  return (
    <Button
      size="sm"
      className={className ? `gap-1.5 ${className}` : "gap-1.5"}
      onClick={onAct}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
    >
      <Icon className="size-4" aria-hidden="true" />
      {step.label}
    </Button>
  );
}

export function NextStepCard({ step, onAct, disabled, disabledReason }: NextStepProps) {
  return (
    <div className="space-y-2">
      {step.urgent ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--status-warning-border)] bg-[var(--badge-warn-bg)] px-2.5 py-2">
          <Clock
            className="mt-px size-4 shrink-0 text-[var(--badge-warn-fg)]"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--badge-warn-fg)]">{step.reason}</p>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-muted)]">{step.reason}</p>
      )}

      <NextStepButton
        step={step}
        onAct={onAct}
        disabled={disabled}
        disabledReason={disabledReason}
        className="w-full"
      />
    </div>
  );
}
