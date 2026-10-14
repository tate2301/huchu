"use client";

import * as React from "react";

/**
 * A choice of a few, each with a line saying what it means (the kit's
 * `.ropt`): Seen by, an export's Layout, which rows. A real radio group, so
 * arrow keys move through it.
 */
export function RadioOptions<V extends string>({
  label,
  name,
  value,
  onChange,
  options,
  help,
}: {
  label: string;
  name: string;
  value: V;
  onChange: (value: V) => void;
  options: Array<{ value: V; label: React.ReactNode; note?: React.ReactNode; disabled?: boolean }>;
  help?: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <div className="rp-ropts" role="radiogroup" aria-labelledby={id}>
      <span id={id} className="rp-label">
        {label}
      </span>
      {options.map((option) => (
        <label key={option.value} className={option.value === value ? "ropt is-on" : "ropt"} aria-disabled={option.disabled || undefined}>
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={option.value}
            checked={option.value === value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span className="rdot" aria-hidden="true" />
          <span>
            <b>{option.label}</b>
            {option.note ? <span>{option.note}</span> : null}
          </span>
        </label>
      ))}
      {help ? <p className="help">{help}</p> : null}
    </div>
  );
}
