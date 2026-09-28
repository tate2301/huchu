"use client";

import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_RATING_MAX,
  formatAnswer,
  type FieldDefinition,
} from "@/lib/forms/fields";

import styles from "./forms.module.css";

/**
 * One question, as the person answering it meets it.
 *
 * Every form in the app draws its questions through this: the public intake
 * form, a template being filled in, and the form builder's canvas. The builder
 * renders it inert rather than drawing a picture of a control, so what an
 * author arranges is exactly what a respondent will get — a drawing can drift
 * from the real thing; the real thing cannot.
 *
 * - `fill` — a live control.
 * - `preview` — the same control, inert: it looks answerable and is not.
 * - `read` — the answer as a fact. A greyed-out input is a promise the reader
 *   can edit it once they find the right button, so this is not that.
 */
export type FieldInputMode = "fill" | "preview" | "read";

export type FieldInputProps = {
  field: FieldDefinition;
  value?: unknown;
  onChange?: (value: unknown) => void;
  mode?: FieldInputMode;
  /** Prefix for the control's DOM id; the field's key is appended. */
  idPrefix?: string;
  /** Why the current answer is not accepted, under the control. */
  error?: string;
  /** Where a file answer is uploaded. Without one, a file question cannot be answered here. */
  uploadUrl?: string;
};

export function FieldInput({
  field,
  value,
  onChange,
  mode = "fill",
  idPrefix = "field",
  error,
  uploadUrl,
}: FieldInputProps) {
  const id = `${idPrefix}-${field.key}`;
  const describedBy = [field.help ? `${id}-help` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ") || undefined;

  if (mode === "read") {
    const shown = formatAnswer(field, value);
    return (
      <div className={styles.fact}>
        <p className={styles.factLabel}>{field.label}</p>
        {field.type === "file" && typeof value === "string" && value ? (
          <a href={value} target="_blank" rel="noreferrer" className={styles.fileLink}>
            {fileNameFrom(value)}
          </a>
        ) : (
          <p className={styles.factValue} data-empty={shown ? undefined : "true"}>
            {shown || "—"}
          </p>
        )}
      </div>
    );
  }

  const set = (next: unknown) => onChange?.(next);

  return (
    <div className={styles.field} inert={mode === "preview"}>
      {/* A single yes-or-no carries its own label beside the box. */}
      {field.type === "checkbox" ? null : (
        <label htmlFor={id} className={styles.label}>
          {field.label}
          {field.required ? (
            <span className={styles.required} aria-hidden="true">
              {" *"}
            </span>
          ) : null}
        </label>
      )}

      {field.help ? (
        <p id={`${id}-help`} className={styles.help}>
          {field.help}
        </p>
      ) : null}
      <Control
        field={field}
        id={id}
        value={value}
        set={set}
        describedBy={describedBy}
        invalid={Boolean(error)}
        uploadUrl={mode === "fill" ? uploadUrl : undefined}
      />

      {error ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Control({
  field,
  id,
  value,
  set,
  describedBy,
  invalid,
  uploadUrl,
}: {
  field: FieldDefinition;
  id: string;
  value: unknown;
  set: (next: unknown) => void;
  describedBy?: string;
  invalid: boolean;
  uploadUrl?: string;
}) {
  const aria = {
    "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined,
    "aria-required": field.required || undefined,
  };
  const text = typeof value === "string" || typeof value === "number" ? String(value) : "";

  switch (field.type) {
    case "longText":
      return (
        <Textarea
          id={id}
          rows={4}
          placeholder={field.placeholder}
          value={text}
          maxLength={field.max}
          onChange={(event) => set(event.target.value)}
          {...aria}
        />
      );

    case "select":
      return (
        <Select value={text} onValueChange={(next) => set(next)}>
          <SelectTrigger id={id} {...aria}>
            <SelectValue placeholder={field.placeholder ?? "Pick one"} />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((choice) => (
              <SelectItem key={choice.value} value={choice.value}>
                {choice.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case "multiSelect": {
      const picked = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div
          id={id}
          role="group"
          aria-label={field.label}
          className={styles.choices}
          {...aria}
        >
          {(field.options ?? []).map((choice) => {
            const on = picked.includes(choice.value);
            return (
              <label key={choice.value} className={styles.choice}>
                <Checkbox
                  checked={on}
                  onCheckedChange={() =>
                    set(on ? picked.filter((entry) => entry !== choice.value) : [...picked, choice.value])
                  }
                />
                {choice.label}
              </label>
            );
          })}
        </div>
      );
    }

    case "checkbox":
      return (
        <label className={styles.choice}>
          <Checkbox
            id={id}
            checked={value === true}
            onCheckedChange={(next) => set(next === true)}
            {...aria}
          />
          <span className={styles.checkLabel}>
            {field.label}
            {field.required ? (
              <span className={styles.required} aria-hidden="true">
                {" *"}
              </span>
            ) : null}
          </span>
        </label>
      );

    case "rating":
      return (
        <Rating
          id={id}
          label={field.label}
          max={field.max ?? DEFAULT_RATING_MAX}
          min={field.min ?? 1}
          value={typeof value === "number" ? value : Number(value) || null}
          onChange={set}
          describedBy={describedBy}
        />
      );

    case "file":
      return <FileAnswer id={id} value={typeof value === "string" ? value : null} uploadUrl={uploadUrl} onChange={set} />;

    case "number":
      // Kept as typed. Converting on every keystroke eats "1." and "-", and
      // the answer is coerced to a number where it is validated anyway.
      return (
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          className={styles.mono}
          placeholder={field.placeholder}
          value={text}
          onChange={(event) => set(event.target.value)}
          {...aria}
        />
      );

    case "date":
      return (
        <Input
          id={id}
          type="date"
          className={styles.mono}
          value={text}
          onChange={(event) => set(event.target.value)}
          {...aria}
        />
      );

    case "email":
    case "phone":
    case "text":
      return (
        <Input
          id={id}
          type={field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text"}
          autoComplete={field.type === "email" ? "email" : field.type === "phone" ? "tel" : undefined}
          placeholder={field.placeholder}
          value={text}
          maxLength={field.type === "text" ? field.max : undefined}
          onChange={(event) => set(event.target.value)}
          {...aria}
        />
      );
  }
}

/** A row of numbered buttons: a rating is a pick along a scale, not a number to type. */
function Rating({
  id,
  label,
  min,
  max,
  value,
  onChange,
  describedBy,
}: {
  id: string;
  label: string;
  min: number;
  max: number;
  value: number | null;
  onChange: (next: number) => void;
  describedBy?: string;
}) {
  const steps = Array.from({ length: Math.max(0, max - min + 1) }, (_, index) => min + index);
  return (
    <div id={id} role="radiogroup" aria-label={label} aria-describedby={describedBy} className={styles.rating}>
      {steps.map((step) => (
        <button
          key={step}
          type="button"
          role="radio"
          aria-checked={value === step}
          className={styles.ratingStep}
          onClick={() => onChange(step)}
        >
          {step}
        </button>
      ))}
    </div>
  );
}

function fileNameFrom(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
    return decodeURIComponent(last);
  } catch {
    return url;
  }
}

function FileAnswer({
  id,
  value,
  uploadUrl,
  onChange,
}: {
  id: string;
  value: string | null;
  uploadUrl?: string;
  onChange: (next: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={styles.file}>
      {value ? (
        <div className={styles.fileRow}>
          <a href={value} target="_blank" rel="noreferrer" className={styles.fileLink}>
            {fileNameFrom(value)}
          </a>
          {uploadUrl ? (
            <button type="button" className={styles.fileRemove} onClick={() => onChange(null)}>
              Remove
            </button>
          ) : null}
        </div>
      ) : null}

      <input
        id={id}
        type="file"
        disabled={busy}
        className={styles.fileDrop}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          // Cleared either way: what the input holds is a picking gesture, not
          // the answer, and leaving it filled makes a failed upload look like
          // a successful one.
          event.target.value = "";
          if (!file || !uploadUrl) return;

          setBusy(true);
          setError(null);
          try {
            const body = new FormData();
            body.append("file", file);
            const response = await fetch(uploadUrl, { method: "POST", body });
            const payload = (await response.json()) as {
              url?: string;
              data?: { url?: string };
              error?: string;
            };
            const url = payload.url ?? payload.data?.url;
            if (!response.ok || !url) throw new Error(payload.error ?? "Upload failed");
            onChange(url);
          } catch (uploadError) {
            setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
          } finally {
            setBusy(false);
          }
        }}
      />

      {busy ? <p className={styles.help}>Uploading…</p> : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
