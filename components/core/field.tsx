"use client";

import * as React from "react";

import { Kbd } from "./button";
import { Icon, type IconName } from "./icon";
import { useShortcut, type Shortcut } from "./shortcuts";

const join = (...names: Array<string | false | null | undefined>) => names.filter(Boolean).join(" ");

/** A label over its control, with a note or an error under it. */
export function Field({
  label,
  optional,
  help,
  error,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  optional?: boolean;
  help?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {optional ? <span className="opt"> (optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p className="error" role="alert">
          <Icon name="warn" />
          {error}
        </p>
      ) : help ? (
        <p className="help">{help}</p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { large?: boolean }>(
  function Input({ className, large, ...rest }, ref) {
    return <input ref={ref} className={join("input", large && "input-lg", className)} {...rest} />;
  },
);

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={join("input", className)} {...rest} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={join("select", className)} {...rest} />;
  },
);

/**
 * An input with an icon before it and a shortcut after it: the panel's search
 * (`/`), the top bar's search everything (`Ctrl K`). The shortcut focuses it.
 */
export const InputWithIcon = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & {
    icon?: IconName;
    shortcut?: Shortcut;
    wrapClassName?: string;
    large?: boolean;
  }
>(function InputWithIcon({ icon = "search", shortcut, wrapClassName, large, ...rest }, forwarded) {
  const own = React.useRef<HTMLInputElement>(null);
  React.useImperativeHandle(forwarded, () => own.current as HTMLInputElement);
  useShortcut(shortcut, () => own.current?.focus());
  return (
    <label className={join("input-wrap", large && "input-lg", wrapClassName)}>
      <Icon name={icon} />
      <input ref={own} {...rest} />
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </label>
  );
});

/** A switch with its words beside it. Management's switches use ink (`ink`). */
export function Switch({
  checked,
  onCheckedChange,
  label,
  ink = false,
  disabled,
  id,
}: {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  ink?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const input = (
    <input
      id={id}
      type="checkbox"
      role="switch"
      className={join("switch", ink && "is-ink")}
      checked={checked}
      disabled={disabled}
      aria-checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
    />
  );
  if (!label) return input;
  return (
    <label className="check">
      {input}
      {label}
    </label>
  );
}

export function Check({
  checked,
  onCheckedChange,
  label,
  radio = false,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  onCheckedChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  radio?: boolean;
}) {
  const input = (
    <input
      type={radio ? "radio" : "checkbox"}
      checked={checked}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      {...rest}
    />
  );
  return (
    <label className="check">
      {input}
      {label}
    </label>
  );
}
