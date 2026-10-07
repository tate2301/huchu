"use client";

import * as React from "react";

import "@/components/sheet-form/sheet-form.css";
import { LookupField } from "@/components/sheet-form/lookup-field";
import { DatePicker } from "@/components/ui/date-picker";
import { Segmented } from "@/components/workspace/segmented";
import { Check, Loader2, Pencil } from "@/lib/icons";
import { todayIn } from "@/lib/workspace/format";
import type { PickedOption } from "@/lib/workspace/sheet-kind";
import type { RailEdit, RailRow } from "@/lib/retail/record-kinds/types";

/**
 * One row of the details rail (5.6.6): a key and its value. An editable row's
 * value is a button; clicking it turns the value into its field's control at
 * 30px with an ink save button. Enter or the button saves (W-62), Esc puts
 * the old value back. A `seg` row's choices take their own line under the
 * key and save as one is picked, with no save button; focus lands on the
 * chosen one so Esc cancels at once, and clicking the chosen one again closes
 * the editor unchanged. "Saved" shows under the key until another row is
 * edited; a refusal shows under the control and the
 * control stays open.
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
  if (editable && row.edit?.type === "date") {
    return (
      <div className="cx-rf-row">
        <span className="cx-rf-row__key">
          {row.label}
          {saved && !editing ? <span className="cx-rf-row__saved">Saved</span> : null}
        </span>
        <DateRowEditor row={row} edit={row.edit} editing={editing} valueClass={valueClass} onEdit={onEdit} onCancel={onCancel} onSave={onSave} />
      </div>
    );
  }
  // A choice being made takes its own line under the key, across both columns.
  const seg = editing && row.edit?.type === "seg";
  return (
    <div className={`cx-rf-row${seg ? " cx-rf-row--seg" : ""}`}>
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
  const [picked, setPicked] = React.useState<PickedOption | null>(edit.lookup?.picked ?? null);
  const lookupId = React.useId();
  const [listOpen, setListOpen] = React.useState(false);
  React.useEffect(() => {
    if (edit.type !== "auto") return;
    const input = document.getElementById(lookupId) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, [edit.type, lookupId]);
  const segRef = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => {
    if (edit.type !== "seg") return;
    const items = segRef.current?.querySelectorAll<HTMLButtonElement>(".cx-seg__item");
    const chosen = segRef.current?.querySelector<HTMLButtonElement>('.cx-seg__item[aria-pressed="true"]');
    (chosen ?? items?.[0])?.focus();
  }, [edit.type]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorId = React.useId();

  const save = async (value: string = edit.type === "auto" ? (picked?.id ?? "") : text) => {
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
    // The lookup's own keys (a pick with Enter, Esc closing its list) come first.
    if (event.defaultPrevented || (listOpen && event.key === "Escape")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    } else if (event.key === "Enter" && edit.type !== "seg") {
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
    <span className={`cx-rf-edit${edit.type === "seg" ? " cx-rf-edit--seg" : ""}`}>
      <span className="cx-rf-edit__line">
        {edit.type === "auto" && edit.lookup ? (
          <span className="cx-rf-edit__auto" onKeyDown={keys}>
            <LookupField
              id={lookupId}
              label={row.label}
              noun={edit.lookup.noun}
              context={edit.lookup.context}
              value={picked}
              onValueChange={setPicked}
              onOpenChange={setListOpen}
              disabled={busy}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          </span>
        ) : edit.type === "seg" ? (
          // A choice saves as it is picked; the chosen one again leaves it as it was.
          <span
            ref={segRef}
            className="cx-rf-edit__seg"
            onKeyDown={keys}
            onClick={(event) => {
              const item = (event.target as HTMLElement).closest(".cx-seg__item");
              if (!busy && item?.getAttribute("aria-pressed") === "true") onCancel();
            }}
          >
            <Segmented
              aria-label={row.label}
              block
              disabled={busy}
              items={(edit.options ?? []).map((option) => ({ value: option, label: option }))}
              value={text}
              onValueChange={(next) => {
                setText(next);
                void save(next);
              }}
            />
          </span>
        ) : edit.type === "money" ? (
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
        {edit.type === "seg" ? null : (
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
        )}
      </span>
      {error ? (
        <span id={errorId} role="alert" className="cx-rf-edit__error">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** A rail bound: "today" is today in the shop's zone. */
function railBound(bound: string | undefined): string | undefined {
  return bound === "today" ? todayIn() : bound;
}

/**
 * A `date` row: the row's own edit button opens the date picker, labelled by
 * the row, and picking a day saves it at once through the same path a `seg`
 * choice takes. A refusal shows under the value.
 */
function DateRowEditor({
  row,
  edit,
  editing,
  valueClass,
  onEdit,
  onCancel,
  onSave,
}: {
  row: RailRow;
  edit: RailEdit;
  editing: boolean;
  valueClass: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (edit: RailEdit, value: unknown) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const errorId = React.useId();

  const save = async (day: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(edit, day);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That was not saved. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={valueClass}>
      <DatePicker
        value={edit.initial || null}
        onChange={(day) => void save(day)}
        label={row.label}
        earliest={railBound(edit.earliest)}
        latest={railBound(edit.latest)}
        clearable={edit.clearable}
        open={editing}
        onOpenChange={(next) => (next ? onEdit() : onCancel())}
        trigger={
          <button
            type="button"
            className="cx-rf-ev"
            aria-label={`Edit ${row.label}: ${row.value}`}
            aria-describedby={error ? errorId : undefined}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            <span className="cx-rf-ev__text">{row.value}</span>
            {busy ? <Loader2 className="cx-rf-ev__pen" aria-hidden="true" /> : <Pencil className="cx-rf-ev__pen" aria-hidden="true" />}
          </button>
        }
      />
      {error ? (
        <span id={errorId} role="alert" className="cx-rf-edit__error">
          {error}
        </span>
      ) : null}
    </span>
  );
}
