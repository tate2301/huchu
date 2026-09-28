"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

import { RecordHeader, type RecordHeaderProps } from "./record-header";
import styles from "./settings.module.css";

export type FormPageProps = Omit<RecordHeaderProps, "className"> & {
  /** The column's max width. 560 by default; a few boards draw 600. */
  width?: number;
  /** The fields. A stack of `<FormField />`s, with `<SectionHeading />`s between. */
  children: React.ReactNode;
  /**
   * Submit/Cancel. Omit `onSubmit` and no footer is drawn — a read-only page
   * (Appearance, the organization overview) has nothing to submit, and rule 2
   * says the bottom of a form is the *only* place a button may sit, not a
   * place one must.
   */
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  /** Disables submit while a mutation is in flight. */
  busy?: boolean;
  /** Replaces the default two buttons outright. */
  footer?: React.ReactNode;
  className?: string;
};

/**
 * A form page: a thin centred column with its own title line inside it.
 *
 * The title line is a `RecordHeader`, not a variant of one — a settings form
 * and a register record are the same object seen with and without a list
 * beside it, and their headers drifting apart is most of what made the old
 * surface feel like two products. It sits *inside* the centred column: a title
 * pinned to the page's left margin while its fields sit centred 200px away
 * reads as two unrelated things.
 *
 * Submit and Cancel are the only buttons the contract puts at the bottom of
 * anything. Everything else a form can do belongs in the header or on the
 * section it acts on.
 */
export function FormPage({
  width = 560,
  children,
  onSubmit,
  onCancel,
  submitLabel = "Save changes",
  cancelLabel = "Cancel",
  busy,
  footer,
  className,
  ...header
}: FormPageProps) {
  const body = (
    <>
      <RecordHeader {...header} />
      {children}
      {footer ??
        (onSubmit ? (
          <div className={styles.formFooter}>
            <button
              type="submit"
              disabled={busy}
              className={cn(styles.button, styles.formSubmit)}
            >
              {submitLabel}
            </button>
            {onCancel ? (
              <button
                type="button"
                onClick={onCancel}
                className={cn(styles.button, styles.formCancel)}
              >
                {cancelLabel}
              </button>
            ) : null}
          </div>
        ) : null)}
    </>
  );

  return (
    <div className={cn(styles.formPage, className)}>
      {onSubmit ? (
        <form
          onSubmit={onSubmit}
          className={styles.formColumn}
          style={{ "--form-width": `${width}px` } as React.CSSProperties}
        >
          {body}
        </form>
      ) : (
        <div
          className={styles.formColumn}
          style={{ "--form-width": `${width}px` } as React.CSSProperties}
        >
          {body}
        </div>
      )}
    </div>
  );
}

export type FormFieldProps = {
  label: string;
  /** Ties the label to the control. Generated when omitted. */
  htmlFor?: string;
  /**
   * The control. `components/ui/input.tsx`, `select.tsx` or
   * `searchable-select.tsx` — `Fields.dc.html` requires the design system's
   * own select and autocomplete, not a hand-rolled dropdown.
   *
   * A render function receives the generated id when `htmlFor` is omitted.
   */
  children: React.ReactNode | ((id: string) => React.ReactNode);
  className?: string;
};

/**
 * A label over a control, and nothing else.
 *
 * There is no `description` prop and there will not be one. Rule 1: if a
 * control needs explaining, its name is wrong — delete the description, fix
 * the name. Every helper string on the old preferences forms was either
 * restating the label or documenting a decision that should have been made
 * before the field shipped.
 */
export function FormField({ label, htmlFor, children, className }: FormFieldProps) {
  const generated = React.useId();
  const id = htmlFor ?? generated;

  return (
    <div className={cn(styles.field, className)}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      {typeof children === "function" ? children(id) : children}
    </div>
  );
}
