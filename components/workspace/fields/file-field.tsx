"use client";

import * as React from "react";

/**
 * FileField — PhotoField's dashed drop zone for a document the sheet sends
 * with its request (a spreadsheet to import): the prompt and its sub while
 * empty ("Drop the spreadsheet here" / "Or choose a file · .xlsx or .csv"),
 * then the file's name with "Change" and "Remove". The field holds the File.
 */
export type FileFieldProps = {
  id?: string;
  value: File | null;
  onValueChange: (file: File | null) => void;
  prompt: string;
  sub: string;
  accept?: string;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function FileField({ id, value, onValueChange, prompt, sub, accept, disabled = false, ...aria }: FileFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const open = () => {
    if (!disabled) inputRef.current?.click();
  };
  const take = (file: File | undefined) => {
    if (file && !disabled) onValueChange(file);
  };
  return (
    <div
      className="cx-photo"
      data-dragging={dragging ? "true" : undefined}
      role={value ? undefined : "button"}
      tabIndex={value || disabled ? undefined : 0}
      aria-label={value ? undefined : prompt}
      onClick={value ? undefined : open}
      onKeyDown={
        value
          ? undefined
          : (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open();
              }
            }
      }
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        take(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        tabIndex={-1}
        disabled={disabled}
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = "";
        }}
        {...aria}
      />
      <span className="cx-photo__text">
        <span className="cx-photo__value">{value ? value.name : prompt}</span>
        <span className="cx-photo__sub">{value ? `${Math.max(1, Math.round(value.size / 1024))} KB` : sub}</span>
      </span>
      {value ? (
        <span className="cx-photo__actions">
          <button type="button" className="cx-photo__action" onClick={open} disabled={disabled}>
            Change
          </button>
          <button type="button" className="cx-photo__action" onClick={() => onValueChange(null)} disabled={disabled}>
            Remove
          </button>
        </span>
      ) : null}
    </div>
  );
}
