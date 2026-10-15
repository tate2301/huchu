"use client";

import * as React from "react";

import { Button, Field, Input, Segmented, Select, Setting, Switch } from "@/components/core";
import {
  CHOICE_FIELD_TYPES,
  DISPLAY_FIELD_TYPES,
  FIELD_TYPE_LABELS,
  LENGTH_FIELD_TYPES,
  LENGTH_UNIT_FIELD_TYPES,
  LENGTH_UNITS,
  MEASURE_FIELD_TYPES,
  NUMERIC_FIELD_TYPES,
  choiceValueFromLabel,
  measureUnit,
  retypeField,
  type FieldDefinition,
  type FieldType,
} from "@/lib/forms/fields";
import type { QuoteLine } from "@/lib/forms/quote";

import { RuleEditor } from "./rule-editor";

const toNumber = (value: string): number | undefined => (value.trim() === "" || !Number.isFinite(Number(value)) ? undefined : Number(value));

/**
 * The selected question in the builder's inspector (BuildForm, PageIntakeForm):
 * what it asks and how it is answered, whether it is required, what it measures
 * in and warns about, which quote lines it feeds, and when it is asked.
 */
export function FieldInspector({
  field,
  index,
  fields,
  types,
  keyLocked,
  requiredNote,
  onChange,
  quoteLines,
  onUseInQuote,
  onOpenLine,
}: {
  field: FieldDefinition;
  index: number;
  fields: readonly FieldDefinition[];
  types: readonly FieldType[];
  keyLocked: boolean;
  /** Under Required: what it holds up ("A visit cannot finish without it"). */
  requiredNote: string;
  onChange: (field: FieldDefinition) => void;
  /** The form's quote lines, when the form drafts a quote. */
  quoteLines?: readonly QuoteLine[];
  onUseInQuote?: (key: string) => void;
  onOpenLine?: (lineId: string) => void;
}) {
  const patch = (next: Partial<FieldDefinition>) => {
    const merged = { ...field, ...next } as FieldDefinition;
    for (const name of Object.keys(next) as Array<keyof FieldDefinition>) if (next[name] === undefined) delete merged[name];
    onChange(merged);
  };
  const id = (part: string) => `inspect-${index}-${part}`;
  const display = DISPLAY_FIELD_TYPES.includes(field.type);
  const measures = MEASURE_FIELD_TYPES.includes(field.type);
  const feeds = (quoteLines ?? []).filter((line) => line.quantity.from === "field" && line.quantity.key === field.key);

  return (
    <>
      <h2>{field.label || FIELD_TYPE_LABELS[field.type]}</h2>
      <Field label={display ? "Text" : "Question"} htmlFor={id("label")}>
        <Input id={id("label")} value={field.label} onChange={(event) => patch({ label: event.target.value })} />
      </Field>
      <Field label="Answered as" htmlFor={id("type")}>
        <Select id={id("type")} value={field.type} onChange={(event) => onChange(retypeField(field, event.target.value as FieldType))}>
          {types.map((type) => (
            <option key={type} value={type}>
              {FIELD_TYPE_LABELS[type]}
              {LENGTH_UNIT_FIELD_TYPES.includes(type) && type === field.type ? `, in ${field.unit === "cm" ? "centimetres" : field.unit === "mm" ? "millimetres" : "metres"}` : ""}
            </option>
          ))}
        </Select>
      </Field>
      {display ? null : (
        <Setting
          htmlFor={id("required")}
          title="Required"
          description={requiredNote}
          control={<Switch id={id("required")} checked={field.required} onCheckedChange={(required) => patch({ required })} />}
        />
      )}
      <Field label={field.type === "note" ? "More" : "Help"} htmlFor={id("help")} optional>
        <Input id={id("help")} value={field.help ?? ""} placeholder="Shown under the question" onChange={(event) => patch({ help: event.target.value || undefined })} />
      </Field>

      {CHOICE_FIELD_TYPES.includes(field.type) ? <Choices field={field} onChange={onChange} /> : null}

      {measures || NUMERIC_FIELD_TYPES.includes(field.type) || LENGTH_FIELD_TYPES.includes(field.type) ? (
        <div className="pl">
          <div className="pl-h">{measures ? "Measure" : "Limits"}</div>
          {LENGTH_UNIT_FIELD_TYPES.includes(field.type) ? (
            <Field label="Unit">
              <Segmented<(typeof LENGTH_UNITS)[number]>
                label="Unit"
                value={(field.unit ?? "m") as (typeof LENGTH_UNITS)[number]}
                onChange={(unit) => patch({ unit })}
                items={LENGTH_UNITS.map((unit) => ({ value: unit, label: unit }))}
              />
            </Field>
          ) : measures && field.type !== "count" ? (
            <Field label="Unit" htmlFor={id("unit")}>
              <Input id={id("unit")} value={field.unit ?? ""} placeholder="%, kg, °C" onChange={(event) => patch({ unit: event.target.value.trim() ? event.target.value : undefined })} />
            </Field>
          ) : null}
          {field.type === "area" ? (
            <Field label="Shape">
              <Segmented<"rect" | "total">
                label="Shape"
                value={field.shape ?? "rect"}
                onChange={(shape) => patch({ shape })}
                items={[
                  { value: "rect", label: "L × W" },
                  { value: "total", label: "Area only" },
                ]}
              />
            </Field>
          ) : null}
          {NUMERIC_FIELD_TYPES.includes(field.type) || LENGTH_FIELD_TYPES.includes(field.type) ? (
            <Field label={LENGTH_FIELD_TYPES.includes(field.type) ? "Characters" : "Between"}>
              <span className="rb-pair">
                <Input aria-label="Lowest" type="number" value={field.min ?? ""} placeholder="Any" onChange={(event) => patch({ min: toNumber(event.target.value) })} />
                <Input aria-label="Highest" type="number" value={field.max ?? ""} placeholder="Any" onChange={(event) => patch({ max: toNumber(event.target.value) })} />
              </span>
            </Field>
          ) : null}
          {measures ? (
            <>
              <Field label="Warn when">
                <span className="rb-pair">
                  <Input aria-label="Warn over" type="number" value={field.warnAbove ?? ""} placeholder="Over" onChange={(event) => patch({ warnAbove: toNumber(event.target.value) })} />
                  <Input aria-label="Warn under" type="number" value={field.warnBelow ?? ""} placeholder="Under" onChange={(event) => patch({ warnBelow: toNumber(event.target.value) })} />
                </span>
              </Field>
              {field.warnAbove !== undefined || field.warnBelow !== undefined ? (
                <Field label="Say" htmlFor={id("warning")}>
                  <Input id={id("warning")} value={field.warning ?? ""} placeholder="Over 4% — add a damp-proof primer" onChange={(event) => patch({ warning: event.target.value || undefined })} />
                </Field>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {["text", "longText", "number", "email", "phone", "length", "count", "reading"].includes(field.type) ? (
        <Field label="Placeholder" htmlFor={id("placeholder")} optional>
          <Input id={id("placeholder")} value={field.placeholder ?? ""} onChange={(event) => patch({ placeholder: event.target.value || undefined })} />
        </Field>
      ) : null}

      {measures && quoteLines && onUseInQuote ? (
        <div className="pl">
          <div className="pl-h">Feeds the quote</div>
          {feeds.map((line) => (
            <button key={line.id} type="button" className="prow" onClick={() => onOpenLine?.(line.id)}>
              <b>{line.description}</b>
              <span>
                {line.quantity.from === "field" && line.quantity.factor !== 1 ? `× ${line.quantity.factor}` : ""}
                {line.quantity.from === "field" && line.quantity.per ? ` in ${line.quantity.per} ${measureUnit(field)} packs` : ""}
              </span>
            </button>
          ))}
          <Button variant="quiet" icon="plus" onClick={() => onUseInQuote(field.key)}>
            {feeds.length ? "Use in another line" : "Use in a quote line"}
          </Button>
        </div>
      ) : null}

      <RuleEditor id={id("rule")} label="Ask it only when" rule={field.showWhen} candidates={fields.slice(0, index)} onChange={(rule) => patch({ showWhen: rule })} />

      {display ? null : (
        <Field label="Saved as" htmlFor={id("key")} help={keyLocked ? "Kept once the form is saved, so answers stay with their question." : undefined}>
          <Input
            id={id("key")}
            className="mono"
            value={field.key}
            disabled={keyLocked}
            onChange={(event) => patch({ key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
          />
        </Field>
      )}
    </>
  );
}

/** The choices of a pick-one or pick-several, typed where they are listed. */
function Choices({ field, onChange }: { field: FieldDefinition; onChange: (field: FieldDefinition) => void }) {
  const options = field.options ?? [];
  const set = (next: typeof options) => onChange({ ...field, options: next });
  return (
    <div className="pl">
      <div className="pl-h">Choices</div>
      {options.map((option, position) => (
        <span key={position} className="rb-pair rb-choice">
          <Input
            aria-label={`Choice ${position + 1}`}
            value={option.label}
            onChange={(event) => set(options.map((other, at) => (at === position ? { ...other, label: event.target.value } : other)))}
          />
          <Button
            variant="quiet"
            iconOnly
            icon="x"
            label={`Remove ${option.label || "choice"}`}
            disabled={options.length <= 1}
            onClick={() => set(options.filter((_, at) => at !== position))}
          />
        </span>
      ))}
      <Button
        variant="quiet"
        icon="plus"
        onClick={() => {
          const label = `Option ${options.length + 1}`;
          set([...options, { value: choiceValueFromLabel(label, new Set(options.map((option) => option.value))), label }]);
        }}
      >
        Add a choice
      </Button>
    </div>
  );
}
