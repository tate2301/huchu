"use client";

/**
 * The bits of a register record the shared layer does not draw.
 *
 * `components/management/ui` gives every register its list column, its record
 * header, its section headings, its record lists and its activity trail. What
 * it does not give is the **Details** block, because the register boards draw
 * that block differently from a form page: `FormField` is a label *over* a
 * control, and `Sections.dc.html` / `Sites.dc.html` / `DowntimeCodes.dc.html` /
 * `SettlementTypes.dc.html` all draw a label *beside* one, on a
 * `132px / minmax(0, 320px)` grid with the label in meta type rather than
 * field-label type.
 *
 * That is a real difference and not a skin: a register record is read far more
 * often than it is edited, and a label column you can run your eye down is what
 * makes it readable. So the grid lives here, at the call site, exactly as the
 * shared layer's docs say to extend it — no shared file is touched.
 *
 * Everything here is presentation. No query, no mutation, no gate.
 */

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import styles from "./register-fields.module.css";

/* ------------------------------------------------------------------ *
 * The Details grid
 * ------------------------------------------------------------------ */

/**
 * `grid-template-columns: 132px minmax(0, 320px); gap: 12px 16px` — the board's
 * own numbers. The control column is capped rather than fluid so a 1400px
 * window does not stretch a status picker to nine hundred pixels.
 */
export function DetailGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[132px_minmax(0,320px)] items-center gap-x-4 gap-y-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One row of the grid: the label, then whatever control the caller renders.
 *
 * The label is `400 12/1.45 #5E6573` — the contract's meta rung, not its field
 * label rung. On a form page a label is the only thing naming the control and
 * carries weight for it; here it sits in a column of its own beside four
 * siblings, and 500-weight down that column reads as five headings.
 */
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode | ((id: string) => React.ReactNode);
}) {
  const id = React.useId();

  return (
    <>
      <label htmlFor={id} className={styles.detailLabel}>
        {label}
      </label>
      {typeof children === "function" ? children(id) : children}
    </>
  );
}

/** The 13px input the boards draw. The DS `.input` is 14px outside the surface. */
export const DETAIL_CONTROL_CLASS = "h-9 w-full text-[13px] leading-[1.5]";

/* ------------------------------------------------------------------ *
 * Controls that commit
 * ------------------------------------------------------------------ */

/**
 * A text field that commits on blur or Enter and abandons on Escape.
 *
 * The register boards draw no Save button anywhere on a record — the record
 * *is* the form, the way the old master-data sheet never was. So the commit has
 * to be the field's own: Enter or leaving it writes, Escape puts the stored
 * value back. Nothing here decides *how* the write happens; `onCommit` is the
 * page's existing mutation.
 */
export function CommitInput({
  value,
  onCommit,
  mono,
  inputMode,
  disabled,
  placeholder,
  id,
}: {
  value: string;
  onCommit: (next: string) => void;
  mono?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  disabled?: boolean;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const [editing, setEditing] = React.useState(false);

  // A value that lands from elsewhere — a save, an invalidation, another tab —
  // should show, and should not be pulled out from under somebody typing.
  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = React.useCallback(() => {
    setEditing(false);
    const next = draft.trim();
    if (next === value.trim()) return;
    onCommit(next);
  }, [draft, onCommit, value]);

  return (
    <Input
      id={id}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      inputMode={inputMode}
      className={cn(DETAIL_CONTROL_CLASS, mono && "font-mono")}
      onFocus={() => setEditing(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          setDraft(value);
          setEditing(false);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** A read-only fact drawn on the control's own baseline, without a control. */
export function DetailValue({
  children,
  mono,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <span
      className={cn(
        "min-w-0 truncate text-[13px] font-normal leading-[1.5] text-[#262A33]",
        mono && "font-mono tabular-nums",
      )}
    >
      {children}
    </span>
  );
}

/** The design system's select, at the board's 13px, committing on change. */
export function DetailSelect({
  id,
  value,
  onValueChange,
  placeholder,
  disabled,
  children,
}: {
  id?: string;
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger id={id} className={DETAIL_CONTROL_CLASS}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );
}

/**
 * Active / Archived, as one control rather than a toggle button wearing a
 * status word — which is what the four sheets this replaces all did, and which
 * left "Active" looking like a thing you press to become active.
 */
export function StatusSelect({
  id,
  active,
  onChange,
  disabled,
  archivedLabel = "Archived",
}: {
  id?: string;
  active: boolean;
  onChange: (nextActive: boolean) => void;
  disabled?: boolean;
  archivedLabel?: string;
}) {
  return (
    <DetailSelect
      id={id}
      value={active ? "active" : "archived"}
      disabled={disabled}
      onValueChange={(next) => onChange(next === "active")}
    >
      <SelectItem value="active">Active</SelectItem>
      <SelectItem value="archived">{archivedLabel}</SelectItem>
    </DetailSelect>
  );
}

/* ------------------------------------------------------------------ *
 * The empty record
 * ------------------------------------------------------------------ */

/**
 * What the record column shows when the list has nothing selected — because it
 * is still loading, because it is empty, or because a search matched nothing.
 *
 * Deliberately a single muted line and no illustration: the list column beside
 * it is already drawing the state, with the verb that fixes it. Two empty
 * states side by side is one state said twice.
 */
export function NoRecord({ label }: { label: string }) {
  return (
    <p className="mt-2 text-[13px] font-normal leading-[1.5] text-[#5E6573]">
      {label}
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Creating a record
 * ------------------------------------------------------------------ */

/**
 * The sheet the `+ New` verb opens.
 *
 * No board draws creation, so this is the one surface in the group with no
 * pixel to match. It follows the contract's form page instead — a label-over-
 * control stack at `gap 7 / margin-bottom 22`, and Submit/Cancel at the bottom
 * above a `#EEF0F4` rule, which rule 2 says is the only place a button may sit
 * at the bottom of anything. It stays a sheet rather than becoming a blank
 * record in the right-hand column because a half-made record in a register is
 * a row the list cannot show.
 */
export function CreateSheet({
  open,
  onOpenChange,
  title,
  submitLabel,
  busy,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="w-full p-6">
        <SheetHeader>
          {/* Rule 4: the title, then the content. No lede under it. */}
          <SheetTitle className="text-[17px] font-semibold leading-[1.25] tracking-[-0.012em] text-[#16181D]">
            {title}
          </SheetTitle>
        </SheetHeader>
        <form onSubmit={onSubmit} className="mt-6">
          {children}
          <div className="mt-9 flex items-center gap-2 border-t border-[#EEF0F4] pt-[22px]">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-[34px] items-center rounded-lg border border-[#0B5DF0] bg-[#0B5DF0] px-3 text-[13px] font-medium leading-[1.4] text-white disabled:opacity-60"
            >
              {submitLabel}
            </button>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-[34px] items-center rounded-lg border border-transparent bg-transparent px-3 text-[13px] font-medium leading-[1.4] text-[#565C69]"
            >
              Cancel
            </button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** A label over a control, `gap 7 / margin-bottom 22`, per the contract. */
export function CreateField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode | ((id: string) => React.ReactNode);
}) {
  const id = React.useId();

  return (
    <div className="mb-[22px] flex flex-col gap-[7px]">
      <label htmlFor={id} className={styles.createLabel}>
        {label}
      </label>
      {typeof children === "function" ? children(id) : children}
    </div>
  );
}
