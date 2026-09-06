"use client";

import * as React from "react";
import { Label as DsLabel } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Label — the design system's, under the local name.
 *
 * The DS `Label` maps to `.field-label`. The two `peer-disabled:` utilities are
 * kept because they are a Tailwind sibling mechanism the DS class has no way to
 * express, and 55 files rely on a disabled control dimming its own label.
 *
 * Note this is deliberately *not* the DS `FieldLabel`: that one pulls `htmlFor`
 * and the required marker from a surrounding `Field` context, which no call
 * site here provides.
 */
export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <DsLabel
      ref={ref}
      className={cn("peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  );
});

export { Label };
