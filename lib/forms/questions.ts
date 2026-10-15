import { emptyField, keyFromLabel, type FieldDefinition, type FieldType } from "@/lib/forms/fields";

/**
 * Questions as a builder makes and renames them. Pure: Build's form builder
 * and its document builder both edit questions this way.
 */

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
