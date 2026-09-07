import * as React from "react";
import {
  ButtonGroup as DsButtonGroup,
  ButtonGroupSeparator as DsButtonGroupSeparator,
  ButtonGroupText as DsButtonGroupText,
  type ButtonGroupOrientation,
} from "@corelithzw/react";

import { cn } from "../lib/utils";
import { Separator } from "./separator";

/**
 * ButtonGroup — the design system's, behind this repo's export names.
 *
 * The whole attached-segment recipe the local `cva` spelled out by hand — the
 * shared outer border, the zeroed inner radii, the hairline between segments,
 * the vertical flip — is what `.btn-group` already draws, keyed off the
 * `data-orientation` attribute the DS emits. The three call sites here fill the
 * group with the local `Button`, which already renders the DS `.btn`, so the
 * `[&>*]` descendant selectors are no longer needed either.
 *
 * `buttonGroupVariants` is kept as a class-string function (the same trick
 * `button.tsx` uses to outlive its `cva`) so `cn(buttonGroupVariants(…))` call
 * sites still compile. Note that it can only ever return `btn-group`: the DS
 * expresses orientation as a data attribute, not a class, so a caller who
 * wants the vertical form has to render `<ButtonGroup orientation="vertical">`
 * rather than splice the class string in by hand.
 *
 * `ButtonGroupSeparator` keeps `React.ComponentProps<typeof Separator>` as its
 * prop type — it is part of this repo's published shape — but the DS derives a
 * separator's direction from the parent group, so `orientation` is passed
 * through as `data-orientation` for styling only and `decorative` is dropped
 * (the DS separator is always `role="none"`).
 *
 * New code should import `ButtonGroup` from `@corelithzw/react`.
 */
/**
 * Kept so existing `cn(buttonGroupVariants({ orientation }))` call sites still
 * compile. `orientation` cannot be expressed as a class here — the DS keys it
 * off `data-orientation` — so it is accepted and ignored rather than silently
 * producing a class name that has no rule behind it.
 */
function buttonGroupVariants({
  orientation,
}: { orientation?: ButtonGroupOrientation } = {}): string {
  void orientation;
  return "btn-group";
}

function ButtonGroup({
  className,
  orientation,
  ...props
}: React.ComponentProps<typeof DsButtonGroup>) {
  return (
    <DsButtonGroup
      data-slot="button-group"
      orientation={orientation}
      className={cn(className)}
      {...props}
    />
  );
}

function ButtonGroupText({
  className,
  ...props
}: React.ComponentProps<typeof DsButtonGroupText>) {
  return (
    <DsButtonGroupText
      data-slot="button-group-text"
      className={cn(className)}
      {...props}
    />
  );
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  decorative,
  ...props
}: React.ComponentProps<typeof Separator>) {
  // The DS separator is always `role="none"`, so `decorative` has nothing to
  // switch — accepted for signature compatibility, then dropped.
  void decorative;

  return (
    <DsButtonGroupSeparator
      data-slot="button-group-separator"
      data-orientation={orientation}
      className={cn(className)}
      {...props}
    />
  );
}

export { ButtonGroup, ButtonGroupSeparator, ButtonGroupText, buttonGroupVariants };
