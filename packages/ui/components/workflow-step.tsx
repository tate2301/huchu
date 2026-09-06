"use client";

import * as React from "react";
import { WorkflowStep as DsWorkflowStep } from "@corelithzw/react";

/**
 * WorkflowStep — the design system's, behind this repo's prop names.
 *
 * This file and `page-section.tsx` emitted byte-identical header markup, so the
 * DS folded both into one component: `WorkflowStep` is a `PageSection` preset
 * with `framed` defaulted on. That is the only difference between the two, and
 * it is now expressed once instead of twice.
 *
 * The badge coercion is *not* duplicated here. The DS does the same thing this
 * file used to — a `string` or `number` badge becomes an outline `Badge`, any
 * other node renders as-is — verified in `src/primitives/PageSection.tsx`. It
 * emits the DS `Badge` with `tone="outline"`, which is exactly what this repo's
 * `<Badge variant="outline">` shim resolves to, so the rendered markup matches.
 *
 * `collapsed` still renders the header and suppresses the children, and the
 * outer `space-y-4` is gone for the reason described in `page-section.tsx`.
 *
 * New code should import `WorkflowStep` from `@corelithzw/react`.
 */
type WorkflowStepProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  badge?: React.ReactNode;
  collapsed?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function WorkflowStep({
  title,
  description,
  actions,
  badge,
  collapsed = false,
  className,
  children,
}: WorkflowStepProps) {
  return (
    <DsWorkflowStep
      title={title}
      description={description}
      actions={actions}
      badge={badge}
      collapsed={collapsed}
      className={className}
    >
      {children}
    </DsWorkflowStep>
  );
}
