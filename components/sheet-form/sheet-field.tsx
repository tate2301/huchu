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

function cardOptions(field: FieldSpec) {
  return (field.o ?? []).map((entry) => {
    const [label, description, badge] = Array.isArray(entry) ? entry : [entry];
    return { value: label, title: label, description, badge };
  });
}

function segItems(field: FieldSpec) {
  return (field.o ?? []).map((entry) => {
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
};

export function SheetField({ field, controlId, ctx, values, currency, error, onChange, onListOpen }: SheetFieldProps) {
  const value = values[field.id];
  const hint = typeof field.h === "function" ? field.h(values) : field.h;
  const fixed = field.fixed?.(ctx) ?? null;
  const t = fixed ? "read" : field.t;
  const nolabel = field.nolabel || t === "toggle" || t === "lines";

  if (t === "toggle") {
    return (
      <div className="cx-field" data-field={field.id}>
        <SwitchRow id={controlId} checked={value === true} onCheckedChange={onChange} label={field.l} hint={hint} />
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
      warn={field.warn}
      error={error}
      nolabel={nolabel}
      data-field={field.id}
    >
      {(control) => {
        switch (t) {
          case "read": {
            const shown = fixed ? fixed.shown : typeof value === "string" ? value : String(value ?? "");
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
                context={field.context}
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
                items={segItems(field)}
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
                options={cardOptions(field)}
                value={typeof value === "string" ? value : null}
                onValueChange={onChange}
              />
            );
          case "tags":
            return (
              <TagsInput
                {...control}
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
            return (
              <TextInput
                {...control}
                mono={field.mono}
                right={field.right}
                placeholder={field.p}
                value={typeof value === "string" ? value : ""}
                onChange={(event) => onChange(event.target.value)}
              />
            );
        }
      }}
    </Field>
  );
}
