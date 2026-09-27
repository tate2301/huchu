"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Switch } from "@corelithzw/react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, DotsSixVertical, SlidersHorizontal, Upload, X } from "@/lib/icons";
import {
  CHOICE_FIELD_TYPES,
  DEFAULT_RATING_MAX,
  FIELD_TYPE_LABELS,
  choiceValueFromLabel,
  retypeField,
  type FieldChoice,
  type FieldDefinition,
  type FieldType,
} from "@/lib/forms/fields";

import { FIELD_TYPE_ICONS } from "./field-icons";
import type { EditorItemContext } from "@/components/editor/page-editor";

import { QuestionSettings, type PrefillVariable } from "./question-settings";
import editor from "@/components/editor/page-editor.module.css";

import styles from "./form-builder.module.css";

/**
 * One question, edited where it sits.
 *
 * The question is typed straight onto the form, choices are typed into the
 * list they will be picked from, and the placeholder is typed into the box it
 * will sit in — what the author sees is what the person answering will see.
 * The row around it (handles, selection, the toolbar frame) is the page
 * editor's; this is only the question.
 */
export function QuestionEditor({
  field,
  onChange,
  context,
}: {
  field: FieldDefinition;
  onChange: (field: FieldDefinition) => void;
  context: EditorItemContext;
}) {
  const patch = (next: Partial<FieldDefinition>) => onChange({ ...field, ...next });

  function onEnterKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      context.onEnter(event.currentTarget);
    }
  }

  // The input is as wide as its words, so the required mark sits after the
  // question rather than at the far edge of the row.
  const label = (
    <span className={styles.labelSizer} data-value={field.label || "Question"}>
      <input
        className={styles.labelInput}
        size={1}
        value={field.label}
        placeholder="Question"
        aria-label="Question"
        onChange={(event) => patch({ label: event.target.value })}
        onKeyDown={onEnterKey}
      />
    </span>
  );

  return (
    <>
      <div className={styles.labelRow}>
        {field.type === "checkbox" ? <span className={styles.fakeCheck} aria-hidden="true" /> : null}
        {label}
        {field.required ? <span className={styles.required}>*</span> : null}
      </div>

      {context.selected || field.help ? (
        <input
          className={styles.helpInput}
          value={field.help ?? ""}
          placeholder="Description"
          aria-label="Description"
          onChange={(event) => patch({ help: event.target.value || undefined })}
          onKeyDown={onEnterKey}
        />
      ) : null}

      <Answer field={field} onChange={onChange} />
    </>
  );
}

/** Where the answer goes, drawn as the respondent gets it, with the author's words editable in place. */
function Answer({
  field,
  onChange,
}: {
  field: FieldDefinition;
  onChange: (field: FieldDefinition) => void;
}) {
  if (CHOICE_FIELD_TYPES.includes(field.type)) {
    return (
      <ChoiceEditor
        multiple={field.type === "multiSelect"}
        choices={field.options ?? []}
        onChange={(options) => onChange({ ...field, options })}
      />
    );
  }

  switch (field.type) {
    case "checkbox":
      return null;

    case "rating": {
      const max = field.max ?? DEFAULT_RATING_MAX;
      const min = field.min ?? 1;
      return (
        <div className={styles.fakeRating} aria-hidden="true">
          {Array.from({ length: max - min + 1 }, (_, index) => (
            <span key={index} className={styles.fakeRatingStep}>
              {min + index}
            </span>
          ))}
        </div>
      );
    }

    case "file":
      return (
        <div className={styles.fakeDrop} aria-hidden="true">
          <Upload />
          <span>Upload a file</span>
        </div>
      );

    case "date":
      return (
        <div className={`${styles.fakeBox} ${styles.mono}`} aria-hidden="true">
          <span className={styles.fakeHint}>dd / mm / yyyy</span>
          <Calendar className={styles.fakeIcon} />
        </div>
      );

    default:
      return (
        <div className={`${styles.fakeBox}${field.type === "longText" ? ` ${styles.fakeArea}` : ""}`}>
          <input
            className={styles.placeholderInput}
            value={field.placeholder ?? ""}
            placeholder={FIELD_TYPE_LABELS[field.type]}
            aria-label="Placeholder"
            onChange={(event) => onChange({ ...field, placeholder: event.target.value || undefined })}
          />
        </div>
      );
  }
}

/**
 * The choices, typed into the list they will be picked from.
 *
 * Enter starts the next choice; Backspace in an empty one removes it and goes
 * back to the one before — the way a list is typed anywhere else. The stored
 * value is set once, from the first words, and then left alone, so rewording a
 * choice does not strand the answers already given to it.
 */
function ChoiceEditor({
  multiple,
  choices,
  onChange,
}: {
  multiple: boolean;
  choices: FieldChoice[];
  onChange: (choices: FieldChoice[]) => void;
}) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [draft, setDraft] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = choices.map((choice) => `choice-${choice.value}`);
  // dnd-kit numbers its aria ids from a counter unless given one, and the
  // server and the browser count differently.
  const dndId = useId();

  const focus = (value: string | undefined) =>
    requestAnimationFrame(() => (value ? inputs.current.get(value) : inputs.current.get("__draft__"))?.focus());

  function add(at: number, label: string) {
    const value = choiceValueFromLabel(label || `option ${choices.length + 1}`, new Set(choices.map((c) => c.value)));
    onChange([...choices.slice(0, at), { value, label }, ...choices.slice(at)]);
    focus(value);
  }

  function onDragEnd(event: DragEndEvent) {
    const from = ids.indexOf(String(event.active.id));
    const to = event.over ? ids.indexOf(String(event.over.id)) : -1;
    if (from >= 0 && to >= 0 && from !== to) onChange(arrayMove(choices, from, to));
  }

  return (
    <div className={styles.choiceList}>
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {choices.map((choice, index) => (
            <ChoiceLine
              key={ids[index]}
              id={ids[index]}
              multiple={multiple}
              choice={choice}
              index={index}
              inputRef={(element) => {
                if (element) inputs.current.set(choice.value, element);
                else inputs.current.delete(choice.value);
              }}
              onLabel={(label) =>
                onChange(choices.map((existing, at) => (at === index ? { ...existing, label } : existing)))
              }
              onEnter={() => add(index + 1, "")}
              onBackspaceEmpty={
                // The last choice stays: a pick with nothing to pick is broken.
                choices.length > 1
                  ? () => {
                      onChange(choices.filter((_, at) => at !== index));
                      focus(choices[index - 1]?.value ?? choices[index + 1]?.value);
                    }
                  : undefined
              }
              onRemove={choices.length > 1 ? () => onChange(choices.filter((_, at) => at !== index)) : undefined}
            />
          ))}
        </SortableContext>
      </DndContext>

      <div className={styles.choiceLine} data-draft>
        <span className={multiple ? styles.fakeSquare : styles.fakeCircle} aria-hidden="true" />
        <input
          ref={(element) => {
            if (element) inputs.current.set("__draft__", element);
            else inputs.current.delete("__draft__");
          }}
          className={styles.choiceInput}
          value={draft}
          placeholder="Add a choice"
          aria-label="Add a choice"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) {
              event.preventDefault();
              add(choices.length, draft.trim());
              setDraft("");
              focus(undefined);
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              add(choices.length, draft.trim());
              setDraft("");
            }
          }}
        />
      </div>
    </div>
  );
}

function ChoiceLine({
  id,
  multiple,
  choice,
  index,
  inputRef,
  onLabel,
  onEnter,
  onBackspaceEmpty,
  onRemove,
}: {
  id: string;
  multiple: boolean;
  choice: FieldChoice;
  index: number;
  inputRef: (element: HTMLInputElement | null) => void;
  onLabel: (label: string) => void;
  onEnter: () => void;
  onBackspaceEmpty?: () => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      className={styles.choiceLine}
      data-dragging={isDragging || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        className={styles.choiceHandle}
        aria-label={`Move choice ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <DotsSixVertical aria-hidden="true" />
      </button>
      <span className={multiple ? styles.fakeSquare : styles.fakeCircle} aria-hidden="true" />
      <input
        ref={inputRef}
        className={styles.choiceInput}
        value={choice.label}
        placeholder={`Choice ${index + 1}`}
        aria-label={`Choice ${index + 1}`}
        onChange={(event) => onLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onEnter();
          } else if (event.key === "Backspace" && choice.label === "" && onBackspaceEmpty) {
            event.preventDefault();
            onBackspaceEmpty();
          }
        }}
      />
      {onRemove ? (
        <button
          type="button"
          className={styles.choiceRemove}
          aria-label={`Remove ${choice.label || `choice ${index + 1}`}`}
          onClick={onRemove}
        >
          <X aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** The selected question's own controls: its kind, whether it must be answered, its settings. */
export function QuestionToolbar({
  field,
  types,
  keyEditable,
  prefillVariables,
  onChange,
}: {
  field: FieldDefinition;
  types: readonly FieldType[];
  keyEditable: boolean;
  prefillVariables?: readonly PrefillVariable[];
  onChange: (field: FieldDefinition) => void;
}) {
  const Icon = FIELD_TYPE_ICONS[field.type];
  const requiredId = `required-${field.key}`;

  return (
    <>
      <Select value={field.type} onValueChange={(type) => onChange(retypeField(field, type as FieldType))}>
        <SelectTrigger className={`${styles.typeTrigger} w-auto`} aria-label="Kind of question">
          <Icon aria-hidden="true" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {types.map((type) => {
            const TypeIcon = FIELD_TYPE_ICONS[type];
            return (
              <SelectItem key={type} value={type}>
                <span className={styles.typeOption}>
                  <TypeIcon aria-hidden="true" />
                  {FIELD_TYPE_LABELS[type]}
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      <span className={editor.toolbarRule} aria-hidden="true" />

      <label className={styles.requiredToggle} htmlFor={requiredId}>
        <span>Required</span>
        <Switch
          id={requiredId}
          checked={field.required}
          onChange={(event) => onChange({ ...field, required: event.target.checked })}
        />
      </label>

      <span className={editor.toolbarRule} aria-hidden="true" />

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={editor.toolbarButton} aria-label="Settings">
            <SlidersHorizontal aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-3">
          <QuestionSettings
            field={field}
            keyEditable={keyEditable}
            prefillVariables={prefillVariables}
            onChange={onChange}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
