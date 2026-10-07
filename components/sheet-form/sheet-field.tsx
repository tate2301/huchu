"use client";

import * as React from "react";

import { DatePicker } from "@/components/ui/date-picker";
import { Field } from "@/components/workspace/fields/field";
import { MoneyInput } from "@/components/workspace/fields/money-input";
import { FileField } from "@/components/workspace/fields/file-field";
import { PhotoField } from "@/components/workspace/fields/photo-field";
import { ReadValue } from "@/components/workspace/fields/read-value";
import { TagsInput } from "@/components/workspace/fields/tags-input";
import { TextArea } from "@/components/workspace/fields/text-area";
import { TextInput } from "@/components/workspace/fields/text-input";
import { OptionCardGroup } from "@/components/workspace/option-card";
import { Segmented } from "@/components/workspace/segmented";
import { SwitchRow } from "@/components/workspace/switch";
import { fetchJson } from "@/lib/api-client";
import { CalendarIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { formatPicked } from "@/lib/workspace/format";
import type { FieldSpec, PickedOption, SheetCtx, SheetCurrency, SheetLine, SheetValues } from "@/lib/workspace/sheet-kind";

import { LinesField } from "./lines-field";
import { dayBound } from "./model";
import { QrCode } from "./qr-code";
import { LookupField } from "./lookup-field";
import { LookupTags } from "./lookup-tags";

/**
 * One field of a sheet (00-foundations 5.7.4): the label (with "optional"),
 * the control its type draws, then its hint or its error. Toggles, lines and
 * `nolabel` fields draw no label above.
 */

/** A picture to the field's upload route (the product image route by default): `POST` multipart → `{ url }`. */
async function uploadPicture(file: File, url = "/api/v2/retail/products/image"): Promise<string> {
  const form = new FormData();
  form.set("file", file);
  const answer = await fetchJson<{ data: { url: string } }>(url, { method: "POST", body: form });
  return answer.data.url;
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
  /** A `lines` field's messages by line ("Only 9 at Harare Main Branch."). */
  lineErrors?: Record<number, string>;
  onChange: (value: unknown) => void;
  onListOpen?: (open: boolean) => void;
  /** The sheet is open to read only: values are shown as they stand. */
  readOnly?: boolean;
};

/** A value as words, for a sheet opened to read only. */
/** A text area's rows: one a line typed, from `rows` up to `maxRows`, so nothing typed hides behind a scroll. */
function areaRows(rows: number, maxRows: number | undefined, value: unknown): number {
  if (!maxRows) return rows;
  const lines = typeof value === "string" ? value.split("\n").length : 1;
  return Math.min(Math.max(lines, rows), Math.max(maxRows, rows));
}

/**
 * The tag that stands for all of them ("All sites"): picking it removes the
 * rest, picking another removes it.
 */
export function withAllTag(before: unknown, next: string[], all: string): string[] {
  const had = Array.isArray(before) && before.includes(all);
  if (next.includes(all) && !had) return [all];
  if (had && next.length > 1) return next.filter((tag) => tag !== all);
  return next;
}

function shownValue(value: unknown): string {
  if (value && typeof value === "object" && "label" in value) return String((value as PickedOption).label);
  if (Array.isArray(value)) {
    const words = value.map((entry) => (entry && typeof entry === "object" && "label" in entry ? String(entry.label) : String(entry)));
    return words.length > 0 ? words.join(", ") : "—";
  }
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
  lineErrors,
  onChange,
  onListOpen,
  readOnly = false,
}: SheetFieldProps) {
  const context = typeof field.context === "function" ? field.context(ctx, values) : field.context;
  const value = values[field.id];
  const hint = typeof field.h === "function" ? field.h(values) : field.h;
  const fixed = field.fixed?.(ctx) ?? null;
  const readHere = field.readWhen?.(values, ctx) ?? false;
  const t = fixed || ((readOnly || readHere) && field.t !== "toggle") ? "read" : field.t;
  const nolabel = field.nolabel || t === "toggle" || t === "lines";
  const disabled = readOnly || (field.disabled?.(values) ?? false);
  const warn = typeof field.warn === "function" ? field.warn(values) : (field.warn ?? false);
  const label = field.lw?.(values) ?? field.l;
  const tone = typeof field.tone === "function" ? field.tone(values) : field.tone;
  const qr = field.qr?.(values) ?? null;

  if (t === "toggle") {
    return (
      <div className="cx-field" data-field={field.id}>
        <SwitchRow
          id={controlId}
          checked={value === true}
          onCheckedChange={onChange}
          label={label}
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
      label={label}
      optional={field.opt && !field.optQuiet}
      hint={hint}
      warn={warn}
      error={error}
      nolabel={nolabel}
      data-field={field.id}
    >
      {(control) => {
        switch (t) {
          case "read": {
            const shown = fixed
              ? fixed.shown
              : readOnly || readHere
                ? shownValue(value)
                : typeof value === "string"
                  ? value
                  : String(value ?? "");
            const read = (
              <ReadValue
                id={control.id}
                mono={field.mono}
                right={field.right}
                tone={tone}
                className={field.oneLine ? "sf-read-line" : undefined}
                title={field.oneLine ? shown : undefined}
              >
                {shown}
              </ReadValue>
            );
            if (!qr) return read;
            return (
              <div className="sf-qr-row">
                {read}
                <QrCode payload={qr} label={`${field.l}, as a QR code`} />
              </div>
            );
          }
          case "money":
            return (
              <MoneyInput
                {...control}
                currency={(typeof field.cur === "function" ? field.cur(values) : field.cur) ?? currency}
                maxDecimals={field.decimals}
                disabled={disabled}
                value={typeof value === "string" ? value : ""}
                onValueChange={onChange}
              />
            );
          case "area":
            return (
              <TextArea
                {...control}
                rows={areaRows(field.rows ?? 3, field.maxRows, value)}
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
                context={context}
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
                disabled={disabled}
                options={cardOptions(field, values)}
                value={typeof value === "string" ? value : null}
                onValueChange={onChange}
              />
            );
          case "tags":
            if (field.noun) {
              return (
                <LookupTags
                  {...control}
                  label={field.l}
                  noun={field.noun}
                  context={context}
                  disabled={disabled}
                  placeholder={field.p}
                  value={Array.isArray(value) ? (value as PickedOption[]) : []}
                  onValueChange={onChange}
                  onOpenChange={onListOpen}
                />
              );
            }
            return (
              <TagsInput
                {...control}
                keepOne={field.keepOne}
                disabled={disabled}
                placeholder={field.p}
                suggestions={field.tagOptions?.(values)}
                value={Array.isArray(value) ? (value as string[]) : []}
                onValueChange={(next) => onChange(field.tagAll ? withAllTag(value, next, field.tagAll) : next)}
              />
            );
          case "photo":
            return (
              <PhotoField
                {...control}
                prompt={field.prompt ?? field.p ?? "Add a photo"}
                value={typeof value === "string" ? value : null}
                onValueChange={onChange}
                upload={(file) => uploadPicture(file, field.upload)}
              />
            );
          case "file":
            return (
              <FileField
                {...control}
                prompt={field.prompt ?? field.p ?? "Drop the file here"}
                sub={field.fileSub ?? "Or choose a file"}
                accept={field.accept}
                value={value instanceof File ? value : null}
                onValueChange={onChange}
              />
            );
          case "date":
          case "datetime": {
            const picked = typeof value === "string" && value ? value : null;
            return (
              <DatePicker
                value={picked}
                onChange={onChange}
                time={t === "datetime"}
                earliest={dayBound(field.earliest, values) ?? undefined}
                latest={dayBound(field.latest, values) ?? undefined}
                clearable={field.clearable}
                label={field.l}
                disabled={disabled}
                trigger={
                  <button
                    type="button"
                    id={control.id}
                    className="cx-input dp-field"
                    disabled={disabled}
                    aria-describedby={control["aria-describedby"]}
                    data-invalid={control["aria-invalid"] ? "true" : undefined}
                  >
                    <span className={picked ? "dp-trigger__value" : "dp-trigger__placeholder"}>
                      {picked ? formatPicked(picked) : (field.p ?? (t === "datetime" ? "Choose a date and time" : "Choose a date"))}
                    </span>
                    <CalendarIcon className="dp-trigger__icon" aria-hidden="true" />
                  </button>
                }
              />
            );
          }
          case "lines":
            return (
              <LinesField
                id={control.id}
                label={field.l}
                noun={field.noun ?? "product"}
                currency={(typeof field.cur === "function" ? field.cur(values) : field.cur) ?? currency}
                quantityLabel={field.ql}
                costLabel={field.cl}
                placeholder={field.p}
                context={context}
                showCost={ctx.can("retail.catalog", "view-cost")}
                lineErrors={lineErrors}
                closed={field.closed}
                lineWarn={field.lineWarn ? (line) => field.lineWarn!(line, values) : undefined}
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
                maxLength={field.max}
                {...(field.masked ? { type: "password", inputMode: "numeric" as const, autoComplete: "off" } : {})}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(field.upper ? event.target.value.toUpperCase() : event.target.value)}
              />
            );
        }
      }}
    </Field>
  );
}
