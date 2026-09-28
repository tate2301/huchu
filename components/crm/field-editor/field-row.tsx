"use client";

/**
 * One editable field definition, shared by the intake form builder and the
 * site-visit question editor.
 *
 * The two sit on different storage — intake fields are a JSON blob on
 * `CrmIntakeForm`, site-visit questions are `CrmQuestion` rows with a foreign
 * key from every answer and every photograph. That difference is deliberate
 * and is not worth collapsing. What *is* worth sharing is this: the row an
 * admin actually types into. Two screens that ask for a key, a label, a type
 * and a list of choices should not drift into two different ideas of what a
 * field is.
 *
 * So the shape is generic over the type union. Each caller passes its own
 * types, its own labels, and whichever types need a list of choices.
 */

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X } from "@/lib/icons";

export type FieldChoice = { value: string; label: string };

export type EditableField<T extends string> = {
  key: string;
  label: string;
  type: T;
  required: boolean;
  options?: FieldChoice[] | null;
};

export type FieldRowProps<T extends string, F extends EditableField<T>> = {
  field: F;
  types: readonly T[];
  /** Human words for each type. Falls back to the raw value. */
  typeLabels?: Partial<Record<T, string>>;
  /** Types that are meaningless without a list of choices. */
  choiceTypes: readonly T[];
  /**
   * False once the field has been saved and answers may reference it. A key is
   * the join between a captured answer and its definition; renaming one
   * silently orphans every answer already given.
   */
  keyEditable?: boolean;
  /** Why the key is locked, said out loud rather than left to be guessed. */
  keyLockedReason?: string;
  onChange: (field: F) => void;
  onRemove: () => void;
  /** Anything this caller needs that the other does not — a unit, a flag. */
  children?: ReactNode;
};

export function FieldRow<T extends string, F extends EditableField<T>>({
  field,
  types,
  typeLabels,
  choiceTypes,
  keyEditable = true,
  keyLockedReason,
  onChange,
  onRemove,
  children,
}: FieldRowProps<T, F>) {
  const needsChoices = choiceTypes.includes(field.type);

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3">
      <div className="grid grid-cols-6 items-center gap-2 sm:grid-cols-12">
        <Input
          className="col-span-3 sm:col-span-3"
          placeholder="key"
          aria-label="Field key"
          value={field.key}
          disabled={!keyEditable}
          title={keyEditable ? undefined : keyLockedReason}
          onChange={(event) => onChange({ ...field, key: event.target.value })}
        />
        <Input
          className="col-span-3 sm:col-span-4"
          placeholder="Label"
          aria-label="Field label"
          value={field.label}
          onChange={(event) => onChange({ ...field, label: event.target.value })}
        />
        <Select
          value={field.type}
          onValueChange={(value) => onChange({ ...field, type: value as T })}
        >
          <SelectTrigger className="col-span-3 sm:col-span-3" aria-label="Field type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {typeLabels?.[type] ?? type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="col-span-2 flex cursor-pointer items-center gap-1.5 text-sm sm:col-span-1">
          <Checkbox
            checked={field.required}
            onCheckedChange={(checked) => onChange({ ...field, required: checked === true })}
          />
          <span>Req</span>
        </label>
        <Button
          className="col-span-1 justify-self-end sm:justify-self-auto"
          variant="ghost"
          size="sm"
          aria-label={`Remove ${field.label || field.key}`}
          onClick={onRemove}
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {keyEditable ? null : keyLockedReason ? (
        <p className="text-sm text-[var(--text-muted)]">{keyLockedReason}</p>
      ) : null}

      {children}

      {/* A choice field with no choices is not a half-finished field, it is a
          broken one: the server rejects it on save. The editor that offers
          the type has to offer the choices too. */}
      {needsChoices ? (
        <ChoiceRows
          choices={field.options ?? []}
          onChange={(options) => onChange({ ...field, options })}
        />
      ) : null}
    </div>
  );
}

export function ChoiceRows({
  choices,
  onChange,
}: {
  choices: FieldChoice[];
  onChange: (choices: FieldChoice[]) => void;
}) {
  return (
    <div className="space-y-2 border-t border-[var(--border-subtle)] pt-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text-strong)]">Choices</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            onChange([...choices, { value: `option_${choices.length + 1}`, label: "" }])
          }
        >
          Add choice
        </Button>
      </div>

      {choices.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          This type needs at least one choice before it can be saved.
        </p>
      ) : null}

      {choices.map((choice, index) => (
        <div key={index} className="grid grid-cols-6 items-center gap-2 sm:grid-cols-12">
          <Input
            className="col-span-2 sm:col-span-4"
            placeholder="value"
            aria-label={`Choice ${index + 1} value`}
            value={choice.value}
            onChange={(event) => {
              const next = [...choices];
              next[index] = { ...choice, value: event.target.value };
              onChange(next);
            }}
          />
          <Input
            className="col-span-3 sm:col-span-7"
            placeholder="What the rep sees"
            aria-label={`Choice ${index + 1} label`}
            value={choice.label}
            onChange={(event) => {
              const next = [...choices];
              next[index] = { ...choice, label: event.target.value };
              onChange(next);
            }}
          />
          <Button
            className="col-span-1"
            variant="ghost"
            size="sm"
            aria-label={`Remove choice ${choice.value}`}
            onClick={() => onChange(choices.filter((_, i) => i !== index))}
          >
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}
