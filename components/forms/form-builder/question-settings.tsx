"use client";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_RATING_MAX,
  LENGTH_FIELD_TYPES,
  type FieldDefinition,
} from "@/lib/forms/fields";

import styles from "./form-builder.module.css";

export type PrefillVariable = { key: string; label: string };

const NO_PREFILL = "__none__";

/**
 * What a question rarely needs, kept off the question itself.
 *
 * The label, the choices, the placeholder and whether it is required are typed
 * or toggled where the question sits. What is left — its key, its bounds, a
 * variable to fill it from — is here, one click away and out of sight otherwise.
 */
export function QuestionSettings({
  field,
  keyEditable,
  prefillVariables,
  onChange,
}: {
  field: FieldDefinition;
  keyEditable: boolean;
  prefillVariables?: readonly PrefillVariable[];
  onChange: (field: FieldDefinition) => void;
}) {
  const id = (part: string) => `settings-${field.key}-${part}`;
  const patch = (next: Partial<FieldDefinition>) => onChange({ ...field, ...next });

  return (
    <div className={styles.settings}>
      {field.type === "rating" ? (
        <div className={styles.control}>
          <label htmlFor={id("scale")}>Out of</label>
          <Select
            value={String(field.max ?? DEFAULT_RATING_MAX)}
            onValueChange={(value) => patch({ max: Number(value) })}
          >
            <SelectTrigger id={id("scale")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 7, 10].map((scale) => (
                <SelectItem key={scale} value={String(scale)}>
                  {scale}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {field.type === "number" || LENGTH_FIELD_TYPES.includes(field.type) ? (
        <div className={styles.pair}>
          <Bound
            id={id("min")}
            label={field.type === "number" ? "Lowest" : "Fewest characters"}
            value={field.min}
            onChange={(min) => patch({ min })}
          />
          <Bound
            id={id("max")}
            label={field.type === "number" ? "Highest" : "Most characters"}
            value={field.max}
            onChange={(max) => patch({ max })}
          />
        </div>
      ) : null}

      {field.type === "select" ? (
        <div className={styles.control}>
          <label htmlFor={id("placeholder")}>Placeholder</label>
          <Input
            id={id("placeholder")}
            value={field.placeholder ?? ""}
            placeholder="Pick one"
            onChange={(event) => patch({ placeholder: event.target.value || undefined })}
          />
        </div>
      ) : null}

      {prefillVariables?.length ? (
        <div className={styles.control}>
          <label htmlFor={id("prefill")}>Filled from</label>
          <Select
            value={field.prefill ?? NO_PREFILL}
            onValueChange={(value) => patch({ prefill: value === NO_PREFILL ? undefined : value })}
          >
            <SelectTrigger id={id("prefill")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PREFILL}>Nothing</SelectItem>
              {prefillVariables.map((variable) => (
                <SelectItem key={variable.key} value={variable.key}>
                  {variable.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className={styles.control}>
        <label htmlFor={keyEditable ? id("key") : undefined}>Key</label>
        {keyEditable ? (
          <Input
            id={id("key")}
            className={styles.mono}
            value={field.key}
            onChange={(event) => patch({ key: event.target.value.toLowerCase() })}
          />
        ) : (
          // Saved answers are stored under this key, so it is a fact about the
          // question now rather than something to edit.
          <p className={`${styles.keyFact} ${styles.mono}`}>{field.key}</p>
        )}
      </div>
    </div>
  );
}

function Bound({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className={styles.control}>
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        inputMode="decimal"
        className={styles.mono}
        value={value ?? ""}
        onChange={(event) => {
          const raw = event.target.value.trim();
          const parsed = Number(raw);
          onChange(raw === "" || Number.isNaN(parsed) ? undefined : parsed);
        }}
      />
    </div>
  );
}
