"use client";

import * as React from "react";
import type * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Checkbox as DsCheckbox } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Checkbox — the design system's, behind the Radix prop names.
 *
 * The exported prop type stays Radix's so the ~41 `onCheckedChange` call sites
 * and anything spreading a Radix-shaped object keep compiling. Two translations
 * happen here:
 *
 *   - Radix models the third state as `checked="indeterminate"`; the DS takes a
 *     separate `indeterminate` boolean alongside a real `checked`.
 *   - Radix reports changes through `onCheckedChange(checked)`; the DS is a
 *     native input, so the change is read off the event.
 *
 * The rendered element changes from `<button role="checkbox">` to a real
 * `<input type="checkbox">`. `data-state` is emitted anyway so existing
 * `data-[state=checked]:` utilities at call sites still match, and `ref` now
 * points at the input.
 */
export type CheckboxProps = Omit<
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
  "asChild"
>;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, checked, defaultChecked, onCheckedChange, onChange, ...props },
  ref,
) {
  const indeterminate = checked === "indeterminate";
  const state = indeterminate ? "indeterminate" : checked ? "checked" : "unchecked";

  return (
    <DsCheckbox
      ref={ref}
      className={cn(className)}
      data-state={state}
      indeterminate={indeterminate}
      checked={checked === undefined ? undefined : checked === true}
      defaultChecked={defaultChecked === undefined ? undefined : defaultChecked === true}
      onChange={(event) => {
        // `onChange` is inherited from the Radix prop type, which types its
        // host as a <button>; the host is really an <input>. The cast reconciles
        // the two element types — the handler receives the actual DOM event, so
        // the only thing it loses is a compile-time claim that was already false.
        onChange?.(event as unknown as React.FormEvent<HTMLButtonElement>);
        onCheckedChange?.(event.currentTarget.checked);
      }}
      {...(props as React.ComponentProps<typeof DsCheckbox>)}
    />
  );
});

export { Checkbox };
