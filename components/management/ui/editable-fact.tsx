"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import styles from "./settings.module.css";

export type FactEdit = {
  /** What the field starts from, as text. */
  value: string;
  /** `decimal` brings up the number pad on a phone and sets figures in mono. */
  kind?: "text" | "decimal" | "date";
  /** Choose one instead of typing. An empty `value` option means "none". */
  options?: Array<{ value: string; label: string }>;
  /** Save it. Rejecting shows the error under the field and keeps it open. */
  onSave: (value: string) => Promise<unknown>;
};

/**
 * A fact you can change where it stands.
 *
 * The value is a button until it is pressed, then the field it was drawn
 * from: Enter or leaving the field saves, Escape puts it back. One fact at a
 * time, saved on its own — the record is never half-edited behind a form.
 */
export function EditableFactValue({
  label,
  display,
  edit,
}: {
  label: string;
  display: React.ReactNode;
  edit: FactEdit;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(edit.value);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const field = React.useRef<HTMLInputElement & HTMLSelectElement>(null);

  React.useEffect(() => {
    if (editing) field.current?.focus();
  }, [editing]);

  const open = () => {
    setDraft(edit.value);
    setError(null);
    setEditing(true);
  };

  const commit = async (value = draft) => {
    if (saving) return;
    if (value === edit.value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await edit.onSave(value);
      setEditing(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That was not saved");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className={styles.factEditable} onClick={open} aria-label={`Change ${label}`}>
        {display}
      </button>
    );
  }

  const shared = {
    ref: field,
    "aria-label": label,
    disabled: saving,
    className: cn(styles.factInput, edit.kind === "decimal" && styles.factInputMono),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setEditing(false);
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void commit();
      }
    },
  };

  return (
    <span className={styles.factEditing}>
      {edit.options ? (
        <select
          {...shared}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            void commit(event.target.value);
          }}
          onBlur={() => setEditing(false)}
        >
          {edit.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={edit.kind === "date" ? "date" : "text"}
          inputMode={edit.kind === "decimal" ? "decimal" : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
        />
      )}
      {error ? (
        <span role="alert" className={styles.factError}>
          {error}
        </span>
      ) : null}
    </span>
  );
}
