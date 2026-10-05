"use client";

import * as React from "react";

import { Field } from "@/components/workspace/fields/field";
import { MoneyInput } from "@/components/workspace/fields/money-input";
import { PhotoField } from "@/components/workspace/fields/photo-field";
import { ReadValue } from "@/components/workspace/fields/read-value";
import { TagsInput } from "@/components/workspace/fields/tags-input";
import { TextArea } from "@/components/workspace/fields/text-area";
import { TextInput } from "@/components/workspace/fields/text-input";
import { OptionCardGroup } from "@/components/workspace/option-card";
import { Segmented } from "@/components/workspace/segmented";
import { SwitchRow } from "@/components/workspace/switch";
import { fetchJson } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { FieldSpec, PickedOption, SheetCtx, SheetCurrency, SheetLine, SheetValues } from "@/lib/workspace/sheet-kind";

import { LinesField } from "./lines-field";
import { LookupField } from "./lookup-field";

/**
 * One field of a sheet (00-foundations 5.7.4): the label (with "optional"),
 * the control its type draws, then its hint or its error. Toggles, lines and
 * `nolabel` fields draw no label above.
 */

/** The existing catalogue image route: `POST` multipart → `{ url }`. */
async function uploadPicture(file: File): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  const answer = await fetchJson<{ url: string }>("/api/v2/retail/catalog/image", { method: "POST", body: form });
  return answer.url;
}

/** The field's options, fixed or worked out from the values. */
function optionsOf(field: FieldSpec, values: SheetValues): Array<string | [label: string, sub?: string, badge?: string]> {
  return (typeof field.o === "function" ? field.o(values) : field.o) ?? [];
}

function cardOptions(field: FieldSpec, values: SheetValues) {
  return optionsOf(field, values).map((entry) => {
    const [label, description, badge] = Array.isArray(entry) ? entry : [entry];
    return { value: label, title: label, description, badge };
  });
}

function segItems(field: FieldSpec, values: SheetValues) {
  return optionsOf(field, values).map((entry) => {
    const label = Array.isArray(entry) ? entry[0] : entry;
    return { value: label, label };
  });
}

export type SheetFieldProps = {
  field: FieldSpec;
  /** The control's id, so the sheet can focus the first field with a message. */
  controlId: string;
  ctx: SheetCtx;
  values: SheetValues;
  currency: SheetCurrency;
  error?: string | null;
  onChange: (value: unknown) => void;
  onListOpen?: (open: boolean) => void;
  /** The sheet is open to read only: values are shown as they stand. */
  readOnly?: boolean;
};

/** A value as words, for a sheet opened to read only. */
function shownValue(value: unknown): string {
  if (value && typeof value === "object" && "label" in value) return String((value as PickedOption).label);
  if (Array.isArray(value)) return value.length > 0 ? value.map(String).join(", ") : "—";
  if (typeof value === "string" && value.trim()) return value;
  return "—";
}

export function SheetField({
  field,
  controlId,
  ctx,
  values,
  currency,
  error,
  onChange,
  onListOpen,
  readOnly = false,
}: SheetFieldProps) {
  const value = values[field.id];
  const hint = typeof field.h === "function" ? field.h(values) : field.h;
  const fixed = field.fixed?.(ctx) ?? null;
  const t = fixed || (readOnly && field.t !== "toggle") ? "read" : field.t;
  const nolabel = field.nolabel || t === "toggle" || t === "lines";
  const disabled = readOnly || (field.disabled?.(values) ?? false);
  const warn = typeof field.warn === "function" ? field.warn(values) : (field.warn ?? false);

  if (t === "toggle") {
    return (
      <div className="cx-field" data-field={field.id}>
        <SwitchRow
          id={controlId}
          checked={value === true}
          onCheckedChange={onChange}
          label={field.l}
          hint={hint && warn ? <span className="cx-hint--warn">{hint}</span> : hint}
          disabled={disabled}
        />
        {error ? <span className="cx-error">{error}</span> : null}
      </div>
    );
  }

  return (
    <Field
      id={controlId}
      label={field.l}
      optional={field.opt}
      hint={hint}
      warn={warn}
      error={error}
      nolabel={nolabel}
      data-field={field.id}
    >
      {(control) => {
        switch (t) {
          case "read": {
            const shown = fixed ? fixed.shown : readOnly ? shownValue(value) : typeof value === "string" ? value : String(value ?? "");
            return (
              <ReadValue id={control.id} mono={field.mono} right={field.right} tone={field.tone}>
                {shown}
              </ReadValue>
            );
          }
          case "money":
            return (
              <MoneyInput
                {...control}
                currency={field.cur ?? currency}
                value={typeof value === "string" ? value : ""}
                onValueChange={onChange}
              />
            );
          case "area":
            return (
              <TextArea
                {...control}
                rows={field.rows ?? 3}
                placeholder={field.p}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(event.target.value)}
              />
            );
          case "auto":
            return (
              <LookupField
                {...control}
                label={field.l}
                noun={field.noun ?? field.id}
                context={typeof field.context === "function" ? field.context(ctx) : field.context}
                disabled={disabled}
                placeholder={field.p}
                value={(value as PickedOption | null) ?? null}
                onValueChange={onChange}
                onOpenChange={onListOpen}
              />
            );
          case "seg":
            return (
              <Segmented
                id={control.id}
                aria-label={field.l}
                block
                disabled={disabled}
                items={segItems(field, values)}
                value={typeof value === "string" ? value : ""}
                onValueChange={onChange}
              />
            );
          case "cards":
            return (
              <OptionCardGroup
                id={control.id}
                aria-label={field.l}
                cols={field.cols}
                options={cardOptions(field, values)}
                value={typeof value === "string" ? value : null}
                onValueChange={onChange}
              />
            );
          case "tags":
            return (
              <TagsInput
                {...control}
                keepOne={field.keepOne}
                disabled={disabled}
                placeholder={field.p}
                value={Array.isArray(value) ? (value as string[]) : []}
                onValueChange={onChange}
              />
            );
          case "photo":
            return (
              <PhotoField
                {...control}
                prompt={field.prompt ?? field.p ?? "Add a photo"}
                value={typeof value === "string" ? value : null}
                onValueChange={onChange}
                upload={uploadPicture}
              />
            );
          case "lines":
            return (
              <LinesField
                id={control.id}
                label={field.l}
                noun={field.noun ?? "product"}
                currency={field.cur ?? currency}
                quantityLabel={field.ql}
                costLabel={field.cl}
                placeholder={field.p}
                value={Array.isArray(value) ? (value as SheetLine[]) : []}
                onValueChange={onChange}
                onOpenChange={onListOpen}
              />
            );
          default:
            if (field.o) {
              return (
                <select
                  {...control}
                  className={cn("cx-input cx-input--select", field.mono && "cx-input--mono")}
                  disabled={disabled}
                  value={typeof value === "string" ? value : ""}
                  onChange={(event) => onChange(event.target.value)}
                >
                  {segItems(field, values).map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              );
            }
            return (
              <TextInput
                disabled={disabled}
                {...control}
                mono={field.mono}
                right={field.right}
                placeholder={field.p}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.upper ? event.target.value.toUpperCase() : event.target.value)}
              />
            );
        }
      }}
    </Field>
  );
}
