"use client";

import * as React from "react";
import { Input as DsInput } from "@corelithzw/react";

import { cn } from "../lib/utils";

/**
 * Input — the design system's, behind this repo's older shape.
 *
 * 163 files import this, so the local signature is preserved exactly: it stays
 * `React.ComponentProps<"input">`, which means the native numeric `size`
 * attribute keeps its meaning here. The DS redefines `size` as
 * `'sm' | 'md' | 'lg'` and omits the native one from its props, so the cast
 * below is what lets a numeric `size` still reach the underlying `<input>`.
 *
 * `data-slot="input"` is load-bearing — `app/themes/admin.css` targets
 * `[data-portal="admin"] [data-slot="input"]` — so it is set explicitly.
 *
 * New code should import `Input` from `@corelithzw/react` and use its
 * `leadingIcon` / `endIcon` / `prefix` / `suffix` / `label` props.
 */
export type InputProps = React.ComponentProps<"input">;

const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <DsInput
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(className)}
      {...(props as React.ComponentProps<typeof DsInput>)}
    />
  );
});

export { Input };
