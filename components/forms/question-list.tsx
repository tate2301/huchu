"use client";

import { useState, type ReactNode } from "react";
import { Switch } from "@corelithzw/react";

import {
  ColumnList,
  ColumnName,
  ColumnText,
  SectionAction,
  SectionHeading,
} from "@/components/management/ui";
import { Input } from "@/components/ui/input";
import { SelectItem } from "@/components/ui/select";
import {
  DETAIL_CONTROL_CLASS,
  DetailGrid,
  DetailRow,
  DetailSelect,
} from "@/app/management/master-data/operations/_components/register-fields";
import { RecordEmpty } from "@/app/management/master-data/schools/classes/record-fields";
import { choiceValueFromLabel, keyFromLabel, type FieldChoice } from "@/lib/forms/fields";
import { ChevronDown, ChevronUp, ListBullets, Plus, Trash2, Warning, X } from "@/lib/icons";

/** Wide enough for a question's editor, opened in its row. */
const LIST_WIDTH = 720;

/**
 * What a question is, wherever it is stored: an intake form keeps its
 * questions as JSON on the form, a site visit as rows answers point at. Each
 * caller brings its own kinds; the editing is the same.
 */
export type QuestionItem<T extends string> = {
  /** What the answer is stored under. */
  key: string;
  label: string;
  type: T;
  required: boolean;
  help?: string | null;
  options?: FieldChoice[] | null;
};

export type QuestionListProps<T extends string, Q extends QuestionItem<T>> = {
  questions: Q[];
  onChange: (questions: Q[]) => void;
  types: readonly T[];
  typeLabels: Record<T, string>;
  /** Kinds that are answered by picking from a list, and need one. */
  choiceTypes: readonly T[];
  /** A question of the first kind, as "Add a question" appends it. */
  create: (key: string) => Q;
  /**
   * Whether the key is already what answers are stored under. A locked key
   * stays put when the question is reworded; an unlocked one follows it.
   */
  keyLocked: (question: Q) => boolean;
  /** What this caller asks of a question that the other does not. */
  extra?: (question: Q, set: (next: Q) => void) => ReactNode;
  /** A line under a question in the list, beside "Required". */
  meta?: (question: Q) => string | null;
  /** Why the list cannot be saved yet. */
  problems?: string[];
  /** Beside the section's verb: whether the edits are saved. */
  status?: ReactNode;
  readOnly?: boolean;
};

/**
 * The questions on a record, as a management record draws a list: under a
 * heading that counts them and carries the one verb, "Add a question", each
 * one a row that opens in place to be edited.
 *
 * Intake forms and site visits both use it — one editor for one idea of a
 * question, so the two screens cannot drift apart.
 */
export function QuestionList<T extends string, Q extends QuestionItem<T>>({
  questions,
  onChange,
  types,
  typeLabels,
  choiceTypes,
  create,
  keyLocked,
  extra,
  meta,
  problems = [],
  status,
  readOnly = false,
}: QuestionListProps<T, Q>) {
  const [open, setOpen] = useState<number | null>(null);
  const [added, setAdded] = useState<number | null>(null);

  const keys = (except: number) => new Set(questions.filter((_, at) => at !== except).map((q) => q.key));

  const set = (index: number, next: Q) => {
    const previous = questions[index];
    // An unsaved question's key follows its wording, so it is never stored
    // under the name of what it used to ask.
    const follows = !keyLocked(previous) && next.label !== previous.label && next.label.trim();
    const keyed = follows ? { ...next, key: keyFromLabel(next.label, keys(index)) } : next;
    onChange(questions.map((question, at) => (at === index ? keyed : question)));
  };

  const add = () => {
    const question = create(keyFromLabel("question", keys(-1)));
    onChange([...questions, question]);
    setOpen(questions.length);
    setAdded(questions.length);
  };

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
    setOpen(to);
  };

  const remove = (index: number) => {
    onChange(questions.filter((_, at) => at !== index));
    setOpen(null);
  };

  return (
    <section aria-label="Questions" className="mb-8">
      <SectionHeading
        icon={ListBullets}
        count={questions.length}
        maxWidth={LIST_WIDTH}
        action={
          readOnly ? (
            status
          ) : (
            <span className="inline-flex items-center gap-3">
              {status}
              <SectionAction icon={Plus} onClick={add}>
                Add a question
              </SectionAction>
            </span>
          )
        }
      >
        Questions
      </SectionHeading>

      {questions.length === 0 ? (
        <RecordEmpty>No questions yet.</RecordEmpty>
      ) : (
        <ColumnList
          label="Questions"
          maxWidth={LIST_WIDTH}
          columns={[
            { id: "question", label: "Question" },
            { id: "kind", label: "Kind", hideBelow: "sm" },
          ]}
          rows={questions.map((question, index) => ({
            id: `${index}:${question.key}`,
            expanded: open === index,
            onToggle: () => setOpen(open === index ? null : index),
            cells: {
              question: (
                <ColumnName
                  name={question.label.trim() || "Untitled question"}
                  meta={[question.required ? "Required" : null, meta?.(question)].filter(Boolean).join(" · ") || null}
                />
              ),
              kind: <ColumnText>{typeLabels[question.type]}</ColumnText>,
            },
            detail: (
              <QuestionEditor
                question={question}
                onChange={(next) => set(index, next)}
                types={types}
                typeLabels={typeLabels}
                choiceTypes={choiceTypes}
                extra={extra}
                readOnly={readOnly}
                autoFocus={added === index}
                onMoveUp={index > 0 ? () => move(index, -1) : undefined}
                onMoveDown={index < questions.length - 1 ? () => move(index, 1) : undefined}
                onRemove={() => remove(index)}
              />
            ),
          }))}
        />
      )}

      {problems.length > 0 ? (
        <ul aria-label="Before this can be saved" className="mt-3 space-y-1">
          {problems.map((problem) => (
            <li key={problem} className="flex items-start gap-2 text-[13px] leading-[1.5] text-[#8A5A12]">
              <Warning className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {problem}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function QuestionEditor<T extends string, Q extends QuestionItem<T>>({
  question,
  onChange,
  types,
  typeLabels,
  choiceTypes,
  extra,
  readOnly,
  autoFocus,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  question: Q;
  onChange: (next: Q) => void;
  types: readonly T[];
  typeLabels: Record<T, string>;
  choiceTypes: readonly T[];
  extra?: (question: Q, set: (next: Q) => void) => ReactNode;
  readOnly: boolean;
  autoFocus: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove: () => void;
}) {
  const patch = (next: Partial<QuestionItem<T>>) => onChange({ ...question, ...next });
  const asksForChoices = choiceTypes.includes(question.type);

  const retype = (type: T) => {
    if (!choiceTypes.includes(type)) return patch({ type, options: null });
    // A list question with nothing to pick is one nobody can answer.
    const options = question.options?.length
      ? question.options
      : [
          { value: "option_1", label: "Option 1" },
          { value: "option_2", label: "Option 2" },
        ];
    patch({ type, options });
  };

  return (
    <div className="py-3">
      <DetailGrid>
        <DetailRow label="Question">
          {(id) => (
            <Input
              id={id}
              autoFocus={autoFocus}
              disabled={readOnly}
              value={question.label}
              placeholder="What do you want to ask?"
              className={DETAIL_CONTROL_CLASS}
              onChange={(event) => patch({ label: event.target.value })}
            />
          )}
        </DetailRow>
        <DetailRow label="Kind">
          {(id) => (
            <DetailSelect id={id} value={question.type} disabled={readOnly} onValueChange={(next) => retype(next as T)}>
              {types.map((type) => (
                <SelectItem key={type} value={type}>
                  {typeLabels[type]}
                </SelectItem>
              ))}
            </DetailSelect>
          )}
        </DetailRow>
        <DetailRow label="Required">
          {(id) => (
            <Switch
              id={id}
              checked={question.required}
              disabled={readOnly}
              onChange={(event) => patch({ required: event.target.checked })}
            />
          )}
        </DetailRow>
        <DetailRow label="Description">
          {(id) => (
            <Input
              id={id}
              disabled={readOnly}
              value={question.help ?? ""}
              placeholder="Shown under the question"
              className={DETAIL_CONTROL_CLASS}
              onChange={(event) => patch({ help: event.target.value || null })}
            />
          )}
        </DetailRow>
        {asksForChoices ? (
          <DetailRow label="Choices">
            <ChoiceList
              items={question.options ?? []}
              noun="choice"
              addInline
              readOnly={readOnly}
              onChange={(options) => patch({ options })}
            />
          </DetailRow>
        ) : null}
        {extra?.(question, onChange)}
      </DetailGrid>

      {readOnly ? null : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <SectionAction icon={ChevronUp} disabled={!onMoveUp} onClick={onMoveUp}>
            Move up
          </SectionAction>
          <SectionAction icon={ChevronDown} disabled={!onMoveDown} onClick={onMoveDown}>
            Move down
          </SectionAction>
          <SectionAction icon={Trash2} className="ml-auto" onClick={onRemove}>
            Remove
          </SectionAction>
        </div>
      )}
    </div>
  );
}

/**
 * A short list of words, each one typed as it will be picked: a question's
 * choices, an intake form's services. An item keeps the value it was stored
 * under when it is reworded, so what was already picked still matches it.
 */
export function ChoiceList({
  items,
  noun,
  addInline = false,
  readOnly = false,
  onChange,
}: {
  items: FieldChoice[];
  /** "choice", "service" — what each item is called. */
  noun: string;
  /** Draws "Add a …" under the list. Off when the section heading carries it. */
  addInline?: boolean;
  readOnly?: boolean;
  onChange: (items: FieldChoice[]) => void;
}) {
  const taken = new Set(items.map((item) => item.value));
  const Noun = noun.charAt(0).toUpperCase() + noun.slice(1);
  return (
    <div className="grid gap-2">
      {items.map((item, index) => (
        <div key={item.value} className="flex items-center gap-2">
          <Input
            disabled={readOnly}
            value={item.label}
            placeholder={`${Noun} ${index + 1}`}
            aria-label={`${Noun} ${index + 1}`}
            className={DETAIL_CONTROL_CLASS}
            onChange={(event) =>
              onChange(items.map((existing, at) => (at === index ? { ...existing, label: event.target.value } : existing)))
            }
          />
          {readOnly ? null : (
            <button
              type="button"
              aria-label={`Remove ${item.label || `${noun} ${index + 1}`}`}
              className="grid size-8 shrink-0 place-items-center rounded-md text-[#5E6573] hover:bg-[#F1F3F6]"
              onClick={() => onChange(items.filter((_, at) => at !== index))}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      {readOnly || !addInline ? null : (
        <SectionAction
          icon={Plus}
          className="justify-self-start"
          onClick={() => {
            const label = `${Noun} ${items.length + 1}`;
            onChange([...items, { value: choiceValueFromLabel(label, taken), label }]);
          }}
        >
          {`Add a ${noun}`}
        </SectionAction>
      )}
    </div>
  );
}
