"use client";

import type { ReactNode } from "react";

import { PageEditor, type EditorKind } from "@/components/editor/page-editor";
import {
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  emptyField,
  fieldProblems,
  keyFromLabel,
  type FieldDefinition,
  type FieldType,
} from "@/lib/forms/fields";

import { FIELD_TYPE_ICONS } from "./field-icons";
import { QuestionEditor, QuestionToolbar } from "./question-editor";
import type { PrefillVariable } from "./question-settings";

export type { PrefillVariable };

export type FormBuilderProps = {
  fields: FieldDefinition[];
  onChange: (fields: FieldDefinition[]) => void;
  /** The top of the form — its title, as the respondent sees it, edited in place. */
  header?: ReactNode;
  /** Drawn above the questions: what every submission asks regardless. */
  before?: ReactNode;
  /** Drawn below the questions and the line for the next one. */
  after?: ReactNode;
  /** Keys saved answers are stored under. Their questions keep them. */
  lockedKeys?: ReadonlySet<string>;
  /** Variables a question may be filled from. Omit to leave prefill out. */
  prefillVariables?: readonly PrefillVariable[];
  /** The kinds of question on offer. All of them unless narrowed. */
  types?: readonly FieldType[];
};

export function questionKinds(types: readonly FieldType[]): EditorKind[] {
  return types.map((type) => ({ id: type, label: FIELD_TYPE_LABELS[type], icon: FIELD_TYPE_ICONS[type] }));
}

/**
 * A form, written the way Tally writes one: on the page.
 *
 * Type a question on the line at the foot and press Enter; type `/` for any
 * other kind. Choices are typed into the list they will be picked from. The
 * handle beside a question drags it; `+` puts a new one under it. Selecting a
 * question shows its kind, whether it is required, and a button for the few
 * settings with no place on the page.
 *
 * The same builder edits an intake form's questions and a template's, because
 * they are the same questions: `lib/forms/fields.ts` is the one definition.
 */
export function FormBuilder({
  fields,
  onChange,
  header,
  before,
  after,
  lockedKeys = new Set<string>(),
  prefillVariables,
  types = FIELD_TYPES,
}: FormBuilderProps) {
  return (
    <PageEditor<FieldDefinition>
      items={fields}
      onChange={onChange}
      kinds={questionKinds(types)}
      defaultKind="text"
      addPlaceholder="Type a question, or / for another kind"
      itemName={(field) => field.label || "question"}
      create={(type, text, existing) => newQuestion(type as FieldType, text, existing)}
      duplicate={(field, existing) => {
        const label = `${field.label} (copy)`;
        return { ...field, label, key: keyFromLabel(label, keysOf(existing)) };
      }}
      normalize={(previous, next, others) => followLabel(previous, next, others, lockedKeys)}
      renderItem={(field, update, context) => <QuestionEditor field={field} onChange={update} context={context} />}
      renderToolbar={(field, update) => (
        <QuestionToolbar
          field={field}
          types={types}
          keyEditable={!lockedKeys.has(field.key)}
          prefillVariables={prefillVariables}
          onChange={update}
        />
      )}
      problems={fieldProblems(fields)}
      header={header}
      before={before}
      after={after}
    />
  );
}

function keysOf(fields: readonly FieldDefinition[]): Set<string> {
  return new Set(fields.map((field) => field.key));
}

/** A new question of a kind, labelled with what was typed if anything was. */
export function newQuestion(type: FieldType, text: string, existing: readonly FieldDefinition[]): FieldDefinition {
  const taken = keysOf(existing);
  const field = emptyField(type, taken);
  if (!text) return field;
  return { ...field, label: text, key: keyFromLabel(text, taken) };
}

/**
 * A key follows its label until the question has been saved — so a question
 * is never stored under the name of the one it used to be, and a saved one is
 * never quietly moved away from its answers.
 */
export function followLabel(
  previous: FieldDefinition,
  next: FieldDefinition,
  others: readonly FieldDefinition[],
  lockedKeys: ReadonlySet<string>,
): FieldDefinition {
  const taken = keysOf(others);
  const follows =
    !lockedKeys.has(previous.key) &&
    previous.label !== next.label &&
    previous.key === next.key &&
    previous.key === keyFromLabel(previous.label, taken) &&
    next.label.trim() !== "";
  return follows ? { ...next, key: keyFromLabel(next.label, taken) } : next;
}
