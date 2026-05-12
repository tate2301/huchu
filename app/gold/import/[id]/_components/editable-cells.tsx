"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ClientDate } from "@/app/gold/components/client-date";

export type EditableNumberProps = {
  value: number | null | undefined;
  onSave: (next: number | null) => void;
  step?: number;
  align?: "left" | "right";
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  format?: (n: number) => string;
};

export function EditableNumber({
  value,
  onSave,
  step = 0.01,
  align = "right",
  placeholder = "—",
  disabled,
  className,
  format = (n) => n.toFixed(3),
}: EditableNumberProps) {
  const [editing, setEditing] = useState(false);
  // `draft` is only displayed while editing. The click-to-edit handler below
  // seeds it from the current `value` each time the editor opens, so we
  // don't need a useEffect to keep them in sync when not editing.
  const [draft, setDraft] = useState(value != null ? String(value) : "");

  if (disabled || value === undefined) {
    return (
      <span
        className={cn(
          "font-mono",
          align === "right" ? "text-right" : "text-left",
          className,
        )}
      >
        {value != null ? format(value) : placeholder}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          // Stop the click from bubbling to the surrounding <td>/<tr>; their
          // own onClicks call setActiveCell, which would trigger a parent
          // re-render in the same batch as this component's setEditing(true)
          // and — depending on how the columns useMemo settles — can clobber
          // local edit state. Clicking the button IS the activation.
          e.stopPropagation();
          setDraft(value != null ? String(value) : "");
          setEditing(true);
        }}
        className={cn(
          "font-mono cursor-text rounded px-1 py-0.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          align === "right" ? "ml-auto block text-right" : "block text-left",
          value == null && "text-muted-foreground italic",
          className,
        )}
        title="Click to edit"
      >
        {value != null ? format(value) : placeholder}
      </button>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    let next: number | null = null;
    if (trimmed !== "") {
      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) next = parsed;
    }
    if (next !== (value ?? null)) onSave(next);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      type="number"
      step={step}
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      // Keep clicks/keys inside the input from bubbling to the row.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value != null ? String(value) : "");
          setEditing(false);
        }
      }}
      className={cn(
        "w-20 rounded border border-primary/40 bg-background px-1 py-0.5 text-xs font-mono outline-none ring-2 ring-primary/20 focus:ring-primary/30",
        align === "right" ? "text-right" : "text-left",
      )}
    />
  );
}

export type EditableDateProps = {
  value: string | null | undefined;
  onSave: (iso: string | null) => void;
  disabled?: boolean;
};

export function EditableDate({ value, onSave, disabled }: EditableDateProps) {
  const display = <ClientDate value={value} mode="date" />;
  const isoDate = value ? new Date(value).toISOString().slice(0, 10) : "";
  const [editing, setEditing] = useState(false);
  // See note in EditableNumber: draft is only used while editing, seeded at
  // open-time by the click handler below.
  const [draft, setDraft] = useState(isoDate);

  if (disabled) {
    return <span className="whitespace-nowrap">{display}</span>;
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setDraft(isoDate);
          setEditing(true);
        }}
        className="cursor-text rounded px-1 py-0.5 transition-colors hover:bg-muted/60 whitespace-nowrap"
        title="Click to edit"
      >
        {display}
      </button>
    );
  }

  const commit = () => {
    if (draft && draft !== isoDate) onSave(draft);
    else if (!draft && value) onSave(null);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      type="date"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(isoDate);
          setEditing(false);
        }
      }}
      className="rounded border border-primary/40 bg-background px-1 py-0.5 text-xs outline-none ring-2 ring-primary/20"
    />
  );
}
