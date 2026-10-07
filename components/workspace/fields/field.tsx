import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Field — a label over a control, then its hint or its error (5.7.4).
 *
 * Label 13/500 `--ink`, then "optional" in 400 `--ink-3` when `optional`.
 * The hint is 12.5 `--ink-3` (`--warn` when `warn`); an error replaces the
 * hint in `--bad` ("Name is needed."). Toggles and lines draw no label above,
 * so `nolabel` drops it and the control names itself.
 *
 * The control is a render prop so it gets the ids it must point at: its own
 * `id`, `aria-describedby` for the hint or error, and `aria-invalid`.
 */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export type FieldProps = Omit<React.ComponentProps<"div">, "children"> & {
  label: React.ReactNode;
  optional?: boolean;
  hint?: React.ReactNode;
  warn?: boolean;
  error?: string | null;
  nolabel?: boolean;
  /** Use a given id instead of a generated one. */
  id?: string;
  children: (control: FieldControlProps) => React.ReactNode;
};

export function Field({
  label,
  optional = false,
  hint,
  warn = false,
  error,
  nolabel = false,
  id,
  className,
  children,
  ...props
}: FieldProps) {
  const generated = React.useId();
  const controlId = id ?? generated;
  const noteId = `${controlId}-note`;
  const note = error || hint;

  return (
    <div className={cn("cx-field", className)} {...props}>
      {nolabel ? null : (
        <label className="cx-label" htmlFor={controlId}>
          {label}
          {optional ? <span className="cx-label__opt">{" optional"}</span> : null}
        </label>
      )}
      {children({
        id: controlId,
        "aria-describedby": note ? noteId : undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <span id={noteId} className="cx-error">
          {error}
        </span>
      ) : hint ? (
        <span id={noteId} className={cn("cx-hint", warn && "cx-hint--warn")}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

/** "<Label> is needed." — the message a required field shows when empty. */
export function neededMessage(label: string): string {
  return `${label} is needed.`;
}
