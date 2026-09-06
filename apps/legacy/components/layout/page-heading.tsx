"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@corelithzw/react";

import { cn } from "@corelithzw/ui/lib/utils";

type PageHeadingProps = {
  title: string;
  description?: string;
  className?: string;
  /** The one primary call to action, per the DS page recipe. */
  primaryAction?: ReactNode;
  /** Up to two more, rendered left of the primary. */
  secondaryActions?: ReactNode;
};

/**
 * The page title block, on the design system's `PageHeader`.
 *
 * Used by 73 pages. It previously accepted a `description` and then never
 * rendered it — every caller that passed one was writing into a void. The DS
 * header has a `lede` slot, so those descriptions now actually appear.
 */
export function PageHeading({
  title,
  description,
  className,
  primaryAction,
  secondaryActions,
}: PageHeadingProps) {
  return (
    <PageHeader
      title={title}
      lede={description}
      primaryAction={primaryAction}
      secondaryActions={secondaryActions}
      className={cn("mb-5", className)}
    />
  );
}
