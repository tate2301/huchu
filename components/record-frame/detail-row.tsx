"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Check, Loader2, Pencil } from "@/lib/icons";
import type { RailEdit, RailRow } from "@/lib/retail/record-kinds/types";

/**
 * One row of the details rail (5.6.6): a key and its value. An editable row's
 * value is a button; clicking it turns the value into its field's control at
 * 30px with an ink save button. Enter or the button saves (W-62), Esc puts
 * the old value back. "Saved" shows under the key until another row is
 * edited; a refusal shows under the control and the control stays open.
 */
export function DetailRow({
  row,
  editable,
  editing,
  saved,
  onEdit,
  onCancel,
  onSave,
}: {
  row: RailRow;
  editable: boolean;
  editing: boolean;
  saved: boolean;
  onEdit: () => void;
  onCancel: () => void;
  /** Sends the field; throws the server's sentence. */
  onSave: (edit: RailEdit, value: unknown) => Promise<void>;
}) {
  const valueClass = `cx-rf-row__value${row.mono ? " cx-rf-mono" : ""}${row.muted ? " cx-rf-row__value--muted" : ""}`;
  return (
    <div className="cx-rf-row">
      <span className="cx-rf-row__key">
        {row.label}
        {saved && !editing ? <span className="cx-rf-row__saved">Saved</span> : null}
      </span>
      {editing && row.edit ? (
        <RowEditor row={row} edit={row.edit} onCancel={onCancel} onSave={onSave} />
      ) : editable && row.edit ? (
        <span className={valueClass}>
          <button type="button" className="cx-rf-ev" aria-label={`Edit ${row.label}: ${row.value}`} onClick={onEdit}>
            <span className="cx-rf-ev__text">{row.value}</span>
            <Pencil className="cx-rf-ev__pen" aria-hidden="true" />
          </button>
        </span>
      ) : (
        <span className={valueClass}>{row.value}</span>
      )}
    </div>
  );
}

function RowEditor({
  row,
  edit,
  onCancel,
  onSave,
}: {
  row: RailRow;
  edit: RailEdit;
  onCancel: () => void;
  onSave: (edit: RailEdit, value: unknown) => Promise<void>;
}) {
  const [text, setText] = React.useState(edit.initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorId = React.useId();
  const options = useQuery({
    queryKey: edit.loadOptions?.key ?? ["rail-options", row.key],
    queryFn: () => edit.loadOptions!.load(),
    enabled: Boolean(edit.loadOptions),
  });
  const choices = edit.options ?? options.data ?? [];

  const save = async (value: string = text) => {
    let parsed: unknown;
    try {
      parsed = edit.parse ? edit.parse(value) : value;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That value cannot be used.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(edit, parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That was not saved. Try again.");
      setBusy(false);
    }
  };

  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  };

  const aria = {
    "aria-label": row.label,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? errorId : undefined,
    onKeyDown: keys,
    disabled: busy,
    autoFocus: true,
  } as const;

  return (
    <span className="cx-rf-edit">
      <span className="cx-rf-edit__line">
        {edit.type === "money" ? (
          <span className="cx-rf-edit__money">
            <span aria-hidden="true">US$</span>
            <input
              {...aria}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onFocus={(event) => event.target.select()}
            />
          </span>
        ) : edit.type === "select" ? (
          <select
            {...aria}
            className="cx-rf-edit__control"
            value={text}
            onChange={(event) => setText(event.target.value)}
          >
            {choices.length === 0 && text ? <option value={text}>{row.value}</option> : null}
            {choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...aria}
            className={`cx-rf-edit__control${edit.mono || edit.type === "number" ? " cx-rf-edit__control--mono" : ""}`}
            inputMode={edit.type === "number" ? "decimal" : undefined}
            autoComplete="off"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onFocus={(event) => event.target.select()}
          />
        )}
        <button
          type="button"
          className="cx-rf-edit__save"
          aria-label={`Save ${row.label}`}
          onClick={() => void save()}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? <Loader2 aria-hidden="true" /> : <Check weight="bold" aria-hidden="true" />}
        </button>
      </span>
      {error ? (
        <span id={errorId} role="alert" className="cx-rf-edit__error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
