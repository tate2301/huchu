"use client";

import * as React from "react";

import { ActivityTrail } from "@/components/management/ui";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The parts the four compliance registers share.
 *
 * `Permits.dc.html`, `Inspections.dc.html`, `Incidents.dc.html` and
 * `Training.dc.html` all draw the record's Details as a **horizontal**
 * label/control grid — `132px minmax(0, 320px)`, label `400 12/1.45 #5E6573`,
 * 12px between rows and 16px between the two columns. The shared layer's
 * `FormField` is the *form page's* stack (label over control, `gap 7px`),
 * which is a different shape for a different screen, so this is the one thing
 * the four boards need that `components/management/ui` does not already have.
 *
 * It lives here rather than in the shared layer because this agent owns
 * `components/compliance/**` and nothing else; moving it up is a one-line
 * change when somebody owns that directory again.
 */

/** `132px minmax(0, 320px)`, `gap: 12px 16px` — the board's Details grid. */
export function DetailGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "132px minmax(0, 320px)",
        alignItems: "center",
        gap: "12px 16px",
      }}
    >
      {children}
    </div>
  );
}

/**
 * One label/control pair. `children` may be a render function so the control
 * takes the generated id without the caller inventing one.
 */
export function DetailField({
  label,
  htmlFor,
  align = "center",
  children,
}: {
  label: string;
  htmlFor?: string;
  /** `start` for a textarea, whose label belongs at the top of the box. */
  align?: "center" | "start";
  children: React.ReactNode | ((id: string) => React.ReactNode);
}) {
  const generated = React.useId();
  const id = htmlFor ?? generated;

  return (
    <>
      <label
        htmlFor={id}
        style={{
          alignSelf: align === "start" ? "start" : "center",
          paddingTop: align === "start" ? 9 : 0,
          font: "400 12px/1.45 var(--font-sans)",
          color: "#5E6573",
        }}
      >
        {label}
      </label>
      {typeof children === "function" ? children(id) : children}
    </>
  );
}

/**
 * The 13px control class.
 *
 * The design system's `.input` is `400 14px/1.5`; the contract's field value is
 * 13. The shared module scopes that to `.formPage` and `.field`, neither of
 * which wraps a register's Details grid, so it is said here instead — as a
 * utility, which outranks the `corelith` layer.
 */
export const CONTROL_CLASS = "text-[13px] leading-[1.5]";

/** The same, for a reference or a date — the boards set those in the mono face. */
export const MONO_CONTROL_CLASS = "font-mono text-[13px] leading-[1.5]";

/**
 * The list column's filter row.
 *
 * `Audit.dc.html` is the board that draws filters on this surface: a plain
 * flex row of 36px design-system selects under the header line, 8px apart, no
 * labels over them and no helper text under them (rule 1). A register's row is
 * the same thing in a narrower column, so it wraps rather than crushing three
 * selects into 300px.
 *
 * Left edge 20px, which is where the list's title and its row names both sit
 * (`.listHead` pads 20 on the left; `.listBody` pads 10 and each row another
 * 10), so the row lines up with the list rather than floating over it.
 */
export function RegisterFilters({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        flexShrink: 0,
        padding: "0 20px 12px",
      }}
    >
      {children}
    </div>
  );
}

export type RegisterFilterOption = { value: string; label: string };

/**
 * One filter: the repo's `Select`, never a hand-rolled dropdown (contract §3).
 *
 * The value says what is being filtered — "Any site", "Any status" — so the
 * row needs no visible label. `label` is what a screen reader gets instead,
 * because a select with nothing pointing at it is a control nobody can name.
 */
export function RegisterFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: RegisterFilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className={CONTROL_CLASS}
        /* Share the row, wrap rather than shrink past reading width, and stop
           a lone filter from stretching the whole column — `Audit.dc.html`
           keeps its selects between 170 and 200. */
        style={{ flex: "1 1 120px", minWidth: 120, maxWidth: 220 }}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * A fact the record holds but the endpoint will not take.
 *
 * A permit's, an inspection's and an incident's `siteId` are all absent from
 * their PATCH schemas (the `[id]` routes under `app/api/compliance`), so a
 * select there would be a control that cannot do what it offers. Rule 9 says
 * hide an invalid action rather than disable it — so the value is drawn as a
 * value.
 */
export function StaticValue({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ font: "400 13px/1.5 var(--font-sans)", color: "#262A33" }}>
      {children}
    </span>
  );
}

type InlineTextProps = {
  id?: string;
  value: string;
  onCommit: (next: string) => void;
  type?: "text" | "date" | "url" | "datetime-local";
  mono?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * A field that commits where it loses focus.
 *
 * The record has no Save button — the boards draw none, and rule 2 puts submit
 * buttons at the bottom of a *form*, which a record is not. So a field behaves
 * like the title above it: Enter or blur commits, Escape abandons. The commit
 * is skipped when nothing changed, so tabbing through a record writes nothing.
 */
export function InlineText({
  id,
  value,
  onCommit,
  type = "text",
  mono,
  disabled,
  placeholder,
}: InlineTextProps) {
  const [draft, setDraft] = React.useState(value);
  const editing = React.useRef(false);
  const abandoning = React.useRef(false);

  // A value that lands from elsewhere (a save, a refetch) shows — but never
  // over the top of somebody who is mid-word.
  React.useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  return (
    <Input
      id={id}
      type={type}
      value={draft}
      disabled={disabled}
      placeholder={placeholder}
      className={mono || type === "date" ? MONO_CONTROL_CLASS : CONTROL_CLASS}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        editing.current = false;
        if (abandoning.current) {
          abandoning.current = false;
          setDraft(value);
          return;
        }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && type !== "datetime-local") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          abandoning.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/** The same contract for a block of prose. Escape abandons; blur commits. */
export function InlineTextarea({
  id,
  value,
  onCommit,
  rows = 3,
  disabled,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onCommit: (next: string) => void;
  rows?: number;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const editing = React.useRef(false);
  const abandoning = React.useRef(false);

  React.useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);

  return (
    <Textarea
      id={id}
      rows={rows}
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      className={CONTROL_CLASS}
      onFocus={() => {
        editing.current = true;
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        editing.current = false;
        if (abandoning.current) {
          abandoning.current = false;
          setDraft(value);
          return;
        }
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          abandoning.current = true;
          event.currentTarget.blur();
        }
      }}
    />
  );
}

/**
 * The Activity section for a record whose entity has no audit route yet.
 *
 * `PlatformAuditEvent` is written for these entities, but the only route that
 * reads it back for one record is `/api/users/[id]/audit`. Reading it for a
 * permit, an inspection, an incident or a training record would be a new
 * endpoint — a data-fetching change the brief forbids — so the section is drawn
 * and says, accurately, that it has nothing. The boards' "Chain verified"
 * footer is deliberately absent: `lib/audit/platform.ts` documents that
 * concurrent writes fork the chain, so a shield drawn from arrival order would
 * be a false claim about the one thing the footer exists to assert.
 */
export function ActivitySection() {
  return <ActivityTrail events={[]} />;
}

/** A person's initials for the 30px list mark and the 32px record mark. */
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

/** The 30px initials mark a `ListRow` takes in place of a code column. */
export function PersonMark({ name, selected }: { name: string; selected?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: 9999,
        background: selected ? "#FFFFFF" : "#F1F3F6",
        color: selected ? "#16181D" : "#565C69",
        font: "600 12px/1 var(--font-sans)",
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/** `2024-10-12` out of whatever the API returned. */
export const toDateInput = (value?: string | null) => (value ? value.slice(0, 10) : "");

/** Whole days from today to `value`; negative once it is past. */
export function daysUntil(value?: string | null) {
  if (!value) return null;
  const then = new Date(`${toDateInput(value)}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((then.getTime() - today.getTime()) / 86_400_000);
}
