"use client";

import * as React from "react";
import { PageSection as DsPageSection } from "@corelithzw/react";

/**
 * PageSection — the design system's, behind this repo's prop names.
 *
 * The header this file used to hand-roll (framed panel, section title,
 * description, right-aligned actions) is now `PageSection` in
 * `@corelithzw/react`, which maps it onto the `.page-section*` rules in the DS
 * stylesheet. `framed` is passed explicitly because the DS defaults it off,
 * while this repo's header has always been the boxed variant — the same one
 * `workflow-step.tsx` renders.
 *
 * Two things the DS does better and this file no longer has to do:
 *   - the heading is a real `h2` with an id, and the `<section>` is wired to it
 *     via `aria-labelledby`;
 *   - the outer `space-y-4` is gone. The DS puts the gap on the header's
 *     `margin-bottom` instead, so a section with one child is spaced exactly as
 *     before.
 *
 * New code should import `PageSection` from `@corelithzw/react` — it also takes
 * `badge`, `collapsed`, `headerStyle` and `headingLevel`, which this shim does
 * not expose.
 */
type PageSectionProps = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  headerClassName?: string;
  children: React.ReactNode;
};

export function PageSection({
  title,
  description,
  actions,
  className,
  headerClassName,
  children,
}: PageSectionProps) {
  return (
    <DsPageSection
      framed
      title={title}
      description={description}
      actions={actions}
      className={className}
      headerClassName={headerClassName}
    >
      {children}
    </DsPageSection>
  );
}
