"use client";

import { useState } from "react";
import { Switch } from "@corelithzw/react";

import { FIELD_TYPE_ICONS } from "@/components/forms/form-builder/field-icons";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ReceiptLong, X } from "@/lib/icons";
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
import styles from "./builder.module.css";

const toNumber = (value: string): number | undefined => (value.trim() === "" || !Number.isFinite(Number(value)) ? undefined : Number(value));

/**
 * The selected question's settings: what it asks and how, what it measures
 * in and warns about, which quote lines it feeds, and when it is asked.
 */
export function FieldInspector({
  field,
  index,
  fields,
  types,
  keyLocked,
  onChange,
  quoteLines,
  onUseInQuote,
}: {
  field: FieldDefinition;
  index: number;
  fields: readonly FieldDefinition[];
  types: readonly FieldType[];
  keyLocked: boolean;
  onChange: (field: FieldDefinition) => void;
  /** The form's quote lines, when the form drafts a quote. */
  quoteLines?: readonly QuoteLine[];
  onUseInQuote?: (key: string) => void;
}) {
  const [tab, setTab] = useState<"settings" | "rules">("settings");
  const Icon = FIELD_TYPE_ICONS[field.type];
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
      <div className={styles.inspectorHead}>
        <Icon aria-hidden />
        <span className={styles.inspectorTitle}>{field.label || FIELD_TYPE_LABELS[field.type]}</span>
        <span className={styles.inspectorKey}>{field.key}</span>
      </div>
      <div className={styles.paneTabs} role="tablist" aria-label="Question settings">
        {(["settings", "rules"] as const).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} className={styles.paneTab} onClick={() => setTab(name)}>
            {name === "settings" ? "Settings" : "Rules"}
          </button>
        ))}
      </div>

      <div className={styles.paneBody}>
        {tab === "rules" ? (
          <>
            <RuleEditor
              id={id("rule")}
              label="Ask it"
              rule={field.showWhen}
              candidates={fields.slice(0, index)}
              onChange={(rule) => patch({ showWhen: rule })}
            />
            <p className={styles.hint} style={{ marginTop: 10 }}>
              A question that is not asked is not required, and nothing is saved for it.
            </p>
          </>
        ) : (
          <>
            <div className={styles.group}>
              <div className={styles.row}>
                <label htmlFor={id("label")}>{display ? "Text" : "Question"}</label>
                <Input id={id("label")} value={field.label} onChange={(event) => patch({ label: event.target.value })} />
              </div>
              <div className={styles.row}>
                <label htmlFor={id("help")}>{field.type === "note" ? "More" : "Help"}</label>
                <Input id={id("help")} value={field.help ?? ""} placeholder="Shown under the question" onChange={(event) => patch({ help: event.target.value || undefined })} />
              </div>
              <div className={styles.row}>
                <label htmlFor={id("type")}>Kind</label>
                <Select value={field.type} onValueChange={(type) => onChange(retypeField(field, type as FieldType))}>
                  <SelectTrigger id={id("type")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {FIELD_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {display ? null : (
                <>
                  <div className={styles.row}>
                    <label htmlFor={id("required")}>Required</label>
                    <Switch id={id("required")} checked={field.required} onChange={(event) => patch({ required: event.target.checked })} />
                  </div>
                  <div className={styles.row}>
                    <label htmlFor={id("key")}>Saved as</label>
                    <Input
                      id={id("key")}
                      className="font-mono"
                      value={field.key}
                      disabled={keyLocked}
                      onChange={(event) => patch({ key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                    />
                  </div>
                  {keyLocked ? <p className={styles.hint}>Kept once the form is saved, so answers stay with their question.</p> : null}
                </>
              )}
            </div>

            {CHOICE_FIELD_TYPES.includes(field.type) ? <Choices field={field} onChange={onChange} /> : null}

            {measures || NUMERIC_FIELD_TYPES.includes(field.type) || LENGTH_FIELD_TYPES.includes(field.type) ? (
              <div className={styles.group}>
                <p className={styles.groupHead}>{measures ? "Measure" : "Limits"}</p>
                {LENGTH_UNIT_FIELD_TYPES.includes(field.type) ? (
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Unit</span>
                    <SegmentedControl
                      ariaLabel="Unit"
                      value={(field.unit ?? "m") as (typeof LENGTH_UNITS)[number]}
                      onValueChange={(unit) => patch({ unit })}
                      options={LENGTH_UNITS.map((unit) => ({ value: unit, label: unit }))}
                    />
                  </div>
                ) : measures && field.type !== "count" ? (
                  <div className={styles.row}>
                    <label htmlFor={id("unit")}>Unit</label>
                    <Input id={id("unit")} value={field.unit ?? ""} placeholder="%, kg, °C" onChange={(event) => patch({ unit: event.target.value.trim() ? event.target.value : undefined })} />
                  </div>
                ) : null}
                {field.type === "area" ? (
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>Shape</span>
                    <SegmentedControl
                      ariaLabel="Shape"
                      value={field.shape ?? "rect"}
                      onValueChange={(shape) => patch({ shape })}
                      options={[
                        { value: "rect", label: "L × W" },
                        { value: "total", label: "Area only" },
                      ]}
                    />
                  </div>
                ) : null}
                {NUMERIC_FIELD_TYPES.includes(field.type) || LENGTH_FIELD_TYPES.includes(field.type) ? (
                  <div className={styles.row}>
                    <span className={styles.rowLabel}>{LENGTH_FIELD_TYPES.includes(field.type) ? "Characters" : "Between"}</span>
                    <div className={styles.inline}>
                      <Input aria-label="Lowest" type="number" value={field.min ?? ""} placeholder="Any" onChange={(event) => patch({ min: toNumber(event.target.value) })} />
                      <span className={styles.muted}>and</span>
                      <Input aria-label="Highest" type="number" value={field.max ?? ""} placeholder="Any" onChange={(event) => patch({ max: toNumber(event.target.value) })} />
                    </div>
                  </div>
                ) : null}
                {measures ? (
                  <>
                    <div className={styles.row}>
                      <span className={styles.rowLabel}>Warn when</span>
                      <div className={styles.inline}>
                        <Input aria-label="Warn over" type="number" value={field.warnAbove ?? ""} placeholder="Over" onChange={(event) => patch({ warnAbove: toNumber(event.target.value) })} />
                        <Input aria-label="Warn under" type="number" value={field.warnBelow ?? ""} placeholder="Under" onChange={(event) => patch({ warnBelow: toNumber(event.target.value) })} />
                      </div>
                    </div>
                    {field.warnAbove !== undefined || field.warnBelow !== undefined ? (
                      <div className={styles.row}>
                        <label htmlFor={id("warning")}>Say</label>
                        <Input id={id("warning")} value={field.warning ?? ""} placeholder="Over 4% — add a damp-proof primer" onChange={(event) => patch({ warning: event.target.value || undefined })} />
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
            ) : null}

            {["text", "longText", "number", "email", "phone", "length", "count", "reading"].includes(field.type) ? (
              <div className={styles.group}>
                <div className={styles.row}>
                  <label htmlFor={id("placeholder")}>Placeholder</label>
                  <Input id={id("placeholder")} value={field.placeholder ?? ""} onChange={(event) => patch({ placeholder: event.target.value || undefined })} />
                </div>
              </div>
            ) : null}

            {measures && quoteLines && onUseInQuote ? (
              <div className={styles.group}>
                <p className={styles.groupHead}>
                  Feeds the quote <span className={styles.count}>{feeds.length ? `${feeds.length} ${feeds.length === 1 ? "line" : "lines"}` : ""}</span>
                </p>
                {feeds.map((line) => (
                  <div key={line.id} className={styles.feedLine}>
                    <span className={styles.inline}>
                      <ReceiptLong aria-hidden width={15} height={15} />
                      <b>{line.description}</b>
                    </span>
                    <span className={styles.muted}>
                      {line.quantity.from === "field" && line.quantity.factor !== 1 ? `× ${line.quantity.factor}` : ""}
                      {line.quantity.from === "field" && line.quantity.per ? ` in ${line.quantity.per} ${measureUnit(field)} packs` : ""}
                    </span>
                  </div>
                ))}
                <button type="button" className={styles.addLink} onClick={() => onUseInQuote(field.key)}>
                  <Plus aria-hidden />
                  {feeds.length ? "Use in another line" : "Use in a quote line"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

/** The choices of a pick-one or pick-several, typed where they are listed. */
function Choices({ field, onChange }: { field: FieldDefinition; onChange: (field: FieldDefinition) => void }) {
  const options = field.options ?? [];
  const set = (next: typeof options) => onChange({ ...field, options: next });
  return (
    <div className={styles.group}>
      <p className={styles.groupHead}>Choices</p>
      {options.map((option, position) => (
        <div key={position} className={styles.choiceRow}>
          <Input
            aria-label={`Choice ${position + 1}`}
            value={option.label}
            onChange={(event) => set(options.map((other, at) => (at === position ? { ...other, label: event.target.value } : other)))}
          />
          <button
            type="button"
            className={styles.tool}
            aria-label={`Remove ${option.label || "choice"}`}
            disabled={options.length <= 1}
            onClick={() => set(options.filter((_, at) => at !== position))}
          >
            <X aria-hidden />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.addLink}
        onClick={() => {
          const label = `Option ${options.length + 1}`;
          set([...options, { value: choiceValueFromLabel(label, new Set(options.map((option) => option.value))), label }]);
        }}
      >
        <Plus aria-hidden />
        Add a choice
      </button>
    </div>
  );
}
