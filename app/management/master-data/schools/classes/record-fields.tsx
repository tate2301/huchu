"use client";

import * as React from "react";
import Link from "next/link";

import { Input } from "@/components/ui/input";
import { ArrowLeft } from "@/lib/icons";

/**
 * The record's own detail fields, as the register boards draw them.
 *
 * `Classes.dc.html`, `Subjects.dc.html` and `Years.dc.html` all draw the
 * Details section as a **horizontal** label/control grid —
 * `132px minmax(0, 320px)`, label `400 12/1.45 #5E6573`, 12px rows and 16px
 * between the two columns. The shared layer's `FormField` is the *form page's*
 * stack (label over control, `gap 7px`), which is a different shape for a
 * different screen, so this is the one thing in this group the shared layer did
 * not already have.
 *
 * It lives in this route folder rather than in `components/management/ui`
 * because this agent owns only the three schools register folders. All three
 * registers in the group import it from here; moving it into the shared layer
 * is a one-line change when somebody owns that directory again.
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
 * can take the generated id without the caller inventing one.
 */
export function DetailField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode | ((id: string) => React.ReactNode);
}) {
  const generated = React.useId();
  const id = htmlFor ?? generated;

  return (
    <>
      <label
        htmlFor={id}
        style={{
          alignSelf: "center",
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

/** The same, for a code or a date — the boards set those in the mono face. */
export const MONO_CONTROL_CLASS = "font-mono text-[13px] leading-[1.5]";

/**
 * A text field that commits where it loses focus.
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
  mono,
  disabled,
  inputMode,
  placeholder,
}: {
  id?: string;
  value: string;
  onCommit: (next: string) => void;
  mono?: boolean;
  disabled?: boolean;
  inputMode?: React.ComponentProps<"input">["inputMode"];
  placeholder?: string;
}) {
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
      type="text"
      value={draft}
      disabled={disabled}
      inputMode={inputMode}
      placeholder={placeholder}
      className={mono ? MONO_CONTROL_CLASS : CONTROL_CLASS}
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
        if (event.key === "Enter") {
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

/**
 * One muted line where a section has nothing in it.
 *
 * `RecordList` draws its column-header line and then nothing when `rows` is
 * empty, which reads as a list that failed rather than a class with no streams
 * yet — rule 13's empty case, which the shared layer has for `ListColumn` and
 * not for `RecordList`. Said here rather than there because this agent does not
 * own that directory; it is reported as the one gap found.
 */
export function RecordEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        maxWidth: 470,
        margin: 0,
        font: "400 13px/1.5 var(--font-sans)",
        color: "#5E6573",
      }}
    >
      {children}
    </p>
  );
}

/**
 * The way back to the list below 900px, where `RegisterLayout` shows one column
 * at a time.
 *
 * A link rather than a handler, because in these two registers the open record
 * *is* the route — `/classes/[id]` — so going back to the list is going back to
 * `/classes`. Hidden on desktop, where both columns are on screen.
 */
export function BackToList({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-3 hidden items-center gap-2 text-[13px] font-medium leading-[1.4] text-[#565C69] max-[899px]:inline-flex"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {label}
    </Link>
  );
}
