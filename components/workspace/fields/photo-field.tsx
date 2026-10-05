"use client";

import * as React from "react";

/**
 * PhotoField — a 76px dashed drop zone on `--ground`: the value line (500,
 * "Add your logo") and "Drop it here, or take one on a phone". With a picture,
 * the image cover-fit with "Change" and "Remove". The caller uploads the file
 * (`upload` resolves to its url, the existing catalogue image route pattern)
 * and the field holds the url it sends.
 */
export type PhotoFieldProps = {
  id?: string;
  value: string | null;
  onValueChange: (url: string | null) => void;
  upload: (file: File) => Promise<string>;
  /** The value line while empty: "Add your logo", "Add a photo". */
  prompt: string;
  disabled?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

export function PhotoField({
  id,
  value,
  onValueChange,
  upload,
  prompt,
  disabled = false,
  ...aria
}: PhotoFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const take = async (file: File | undefined) => {
    if (!file || disabled) return;
    setBusy(true);
    setError(null);
    try {
      onValueChange(await upload(file));
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "That picture did not upload. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const open = () => {
    if (!disabled && !busy) inputRef.current?.click();
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
        void take(event.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        tabIndex={-1}
        disabled={disabled}
        onChange={(event) => {
          void take(event.target.files?.[0]);
          event.target.value = "";
        }}
        {...aria}
      />
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- an uploaded url of any origin, shown at 52px
        <img className="cx-photo__img" src={value} alt="" />
      ) : null}
      <span className="cx-photo__text">
        <span className="cx-photo__value">{busy ? "Uploading…" : value ? "Picture added" : prompt}</span>
        <span className="cx-photo__sub" style={error ? { color: "var(--bad)" } : undefined}>
          {error ?? "Drop it here, or take one on a phone"}
        </span>
      </span>
      {value ? (
        <span className="cx-photo__actions">
          <button type="button" className="cx-photo__action" onClick={open} disabled={disabled || busy}>
            Change
          </button>
          <button
            type="button"
            className="cx-photo__action"
            onClick={() => onValueChange(null)}
            disabled={disabled || busy}
          >
            Remove
          </button>
        </span>
      ) : null}
    </div>
  );
}
