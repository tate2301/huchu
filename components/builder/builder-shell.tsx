"use client";

import { useMemo, useState, type ReactNode } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { FieldInput } from "@/components/forms/field-input";
import { FIELD_TYPE_ICONS } from "@/components/forms/form-builder/field-icons";
import { followLabel, newQuestion } from "@/components/forms/form-builder/form-builder";
import { formatMoney } from "@/components/crm/money/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  ArrowDownward,
  ArrowUpward,
  ChevronDown,
  ChevronUpIcon,
  CopySimple,
  DotsSixVertical,
  ReceiptLong,
  Trash2,
  Warning,
} from "@/lib/icons";
import {
  DISPLAY_FIELD_TYPES,
  FIELD_TYPE_LABELS,
  MEASURE_FIELD_TYPES,
  fieldProblems,
  formatAnswer,
  isShown,
  keyFromLabel,
  measureWarning,
  type FieldDefinition,
  type FieldType,
} from "@/lib/forms/fields";
import { draftQuote, draftSubtotal, quoteLineProblems, type DraftedLine, type QuoteLine } from "@/lib/forms/quote";

import { FieldInspector } from "./field-inspector";
import { lineFor, QuoteInspector } from "./quote-inspector";
import { describeRule } from "./rule-editor";
import styles from "./builder.module.css";

/** The palette, in the order a person reaches for things on site. */
const GROUPS: Array<{ title: string; types: FieldType[] }> = [
  { title: "Measure", types: ["length", "area", "areas", "count", "reading", "run", "number"] },
  { title: "Ask", types: ["text", "longText", "checkbox", "select", "multiSelect", "date", "rating", "email", "phone"] },
  { title: "Capture", types: ["photos", "signature", "file"] },
  { title: "Lay out", types: ["section", "note"] },
];

type Selection = { kind: "field"; index: number } | { kind: "quote"; line: string | null } | null;

export type BuilderShellProps = {
  name: string;
  onNameChange: (name: string) => void;
  /** Under the name on the canvas: where the form is used. */
  meta?: string;
  fields: FieldDefinition[];
  onFieldsChange: (fields: FieldDefinition[]) => void;
  /** The kinds of question this form can ask. */
  types: readonly FieldType[];
  /** Keys answers are already saved under; they cannot be changed. */
  lockedKeys: ReadonlySet<string>;
  /** The quote the form drafts. Omitted, the form drafts none. */
  quoteLines?: QuoteLine[];
  onQuoteLinesChange?: (lines: QuoteLine[]) => void;
  /** The inspector when nothing is selected: the form's own settings. */
  formSettings: ReactNode;
  currency?: string;
};

/**
 * Build a form the way it will be used: questions added from the palette are
 * on the canvas as the rep will see them, and filling them in there is the
 * test — the answers, the figures they come to and the quote they draft are
 * underneath, as they would be after a real visit.
 */
export function BuilderShell({
  name,
  onNameChange,
  meta,
  fields,
  onFieldsChange,
  types,
  lockedKeys,
  quoteLines,
  onQuoteLinesChange,
  formSettings,
  currency = "USD",
}: BuilderShellProps) {
  const [selection, setSelection] = useState<Selection>(null);
  const [leftTab, setLeftTab] = useState<"add" | "outline">("add");
  const [find, setFind] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [bottomTab, setBottomTab] = useState<"answers" | "quote" | "problems">("answers");
  const [bottomOpen, setBottomOpen] = useState(true);
  const [pane, setPane] = useState<"add" | "form" | "settings">("form");

  const quoting = Boolean(quoteLines && onQuoteLinesChange);
  const lines = useMemo(() => quoteLines ?? [], [quoteLines]);
  const drafted = useMemo(() => (quoting ? draftQuote(lines, fields, answers) : []), [answers, fields, lines, quoting]);
  const problems = useMemo(() => [...fieldProblems(fields), ...(quoting ? quoteLineProblems(lines, fields) : [])], [fields, lines, quoting]);
  const selectedIndex = selection?.kind === "field" && selection.index < fields.length ? selection.index : null;
  const selectedKey = selectedIndex === null ? null : fields[selectedIndex].key;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function select(next: Selection) {
    setSelection(next);
  }

  function add(type: FieldType) {
    const field = newQuestion(type, "", fields);
    const at = selectedIndex === null ? fields.length : selectedIndex + 1;
    onFieldsChange([...fields.slice(0, at), field, ...fields.slice(at)]);
    select({ kind: "field", index: at });
    setPane("form");
  }

  function update(index: number, next: FieldDefinition) {
    const previous = fields[index];
    const others = fields.filter((_, at) => at !== index);
    const field = followLabel(previous, next, others, lockedKeys);
    // Answers and quote lines follow a key that follows its label.
    if (field.key !== previous.key) {
      setAnswers((current) => {
        const { [previous.key]: moved, ...rest } = current;
        return moved === undefined ? rest : { ...rest, [field.key]: moved };
      });
      if (quoting) {
        onQuoteLinesChange!(
          lines.map((line) => ({
            ...line,
            ...(line.quantity.from === "field" && line.quantity.key === previous.key ? { quantity: { ...line.quantity, key: field.key } } : {}),
            ...(line.showWhen?.key === previous.key ? { showWhen: { ...line.showWhen, key: field.key } } : {}),
          })),
        );
      }
      onFieldsChange(fields.map((other, at) => (at === index ? field : other.showWhen?.key === previous.key ? { ...other, showWhen: { ...other.showWhen, key: field.key } } : other)));
      return;
    }
    onFieldsChange(fields.map((other, at) => (at === index ? field : other)));
  }

  function move(index: number, by: -1 | 1) {
    const to = index + by;
    if (to < 0 || to >= fields.length) return;
    onFieldsChange(arrayMove(fields, index, to));
    select({ kind: "field", index: to });
  }

  function duplicate(index: number) {
    const field = fields[index];
    const label = `${field.label} (copy)`;
    const copy = { ...field, label, key: keyFromLabel(label, new Set(fields.map((other) => other.key))) };
    onFieldsChange([...fields.slice(0, index + 1), copy, ...fields.slice(index + 1)]);
    select({ kind: "field", index: index + 1 });
  }

  function remove(index: number) {
    onFieldsChange(fields.filter((_, at) => at !== index));
    select(fields.length > 1 ? { kind: "field", index: Math.max(0, index - 1) } : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const from = fields.findIndex((field) => field.key === event.active.id);
    const to = fields.findIndex((field) => field.key === event.over?.id);
    if (from < 0 || to < 0 || from === to) return;
    onFieldsChange(arrayMove(fields, from, to));
    select({ kind: "field", index: to });
  }

  function quoteFrom(key: string) {
    if (!quoting) return;
    const line = lineFor(fields.find((field) => field.key === key), lines);
    onQuoteLinesChange!([...lines, line]);
    select({ kind: "quote", line: line.id });
  }

  const shown = fields.map((field) => isShown(field, fields, answers));
  const editing = mode === "edit";

  return (
    <div className={styles.workbench} data-pane={pane}>
      <div className={styles.panes} role="tablist" aria-label="Builder">
        {(["add", "form", "settings"] as const).map((name) => (
          <button key={name} type="button" role="tab" aria-selected={pane === name} className={styles.paneTab} onClick={() => setPane(name)}>
            {name === "add" ? "Add" : name === "form" ? "Form" : "Settings"}
          </button>
        ))}
      </div>

      {/* What can be added, and the form as a list */}
      <aside className={`${styles.pane} ${styles.left}`} aria-label="Add to the form">
        <div className={styles.paneTabs} role="tablist" aria-label="Palette">
          <button type="button" role="tab" aria-selected={leftTab === "add"} className={styles.paneTab} onClick={() => setLeftTab("add")}>
            Add
          </button>
          <button type="button" role="tab" aria-selected={leftTab === "outline"} className={styles.paneTab} onClick={() => setLeftTab("outline")}>
            Outline
          </button>
        </div>
        <div className={styles.paneBody}>
          {leftTab === "add" ? (
            <>
              <div className={styles.search}>
                <Input type="search" aria-label="Find a component" placeholder="Find a component" value={find} onChange={(event) => setFind(event.target.value)} />
              </div>
              {GROUPS.map((group) => {
                const kinds = group.types.filter((type) => types.includes(type) && FIELD_TYPE_LABELS[type].toLowerCase().includes(find.trim().toLowerCase()));
                if (!kinds.length) return null;
                return (
                  <div key={group.title}>
                    <p className={styles.groupTitle}>{group.title}</p>
                    <div className={styles.kinds}>
                      {kinds.map((type) => {
                        const Icon = FIELD_TYPE_ICONS[type];
                        return (
                          <button key={type} type="button" className={styles.kind} onClick={() => add(type)}>
                            <Icon aria-hidden />
                            <span>{FIELD_TYPE_LABELS[type]}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {quoting && "quote lines".includes(find.trim().toLowerCase()) ? (
                <div>
                  <p className={styles.groupTitle}>Quote</p>
                  <div className={styles.kinds}>
                    <button
                      type="button"
                      className={styles.kind}
                      onClick={() => {
                        if (lines.length === 0) quoteFrom(fields.find((field) => MEASURE_FIELD_TYPES.includes(field.type))?.key ?? "");
                        else select({ kind: "quote", line: null });
                        setPane("settings");
                      }}
                    >
                      <ReceiptLong aria-hidden />
                      <span>Quote lines</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <Outline fields={fields} selectedIndex={selectedIndex} onSelect={(index) => select({ kind: "field", index })} />
          )}
        </div>
      </aside>

      {/* The form, filled in as it is built */}
      <section className={styles.middle} aria-label="The form">
        <div className={styles.canvasBar}>
          <SegmentedControl
            ariaLabel="Mode"
            size="sm"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "edit", label: "Edit" },
              { value: "preview", label: "Preview" },
            ]}
          />
          <span className={styles.canvasNote}>{editing ? "Fill it in to test it" : "As the rep sees it"}</span>
          <SegmentedControl
            ariaLabel="Width"
            size="sm"
            value={device}
            onValueChange={setDevice}
            options={[
              { value: "desktop", label: "Desktop" },
              { value: "phone", label: "Phone" },
            ]}
          />
        </div>

        <div className={styles.canvasScroll} onClick={(event) => event.target === event.currentTarget && select(null)}>
          <div className={styles.sheet} data-device={device}>
            {editing ? (
              <input className={styles.sheetTitle} aria-label="Form name" value={name} onChange={(event) => onNameChange(event.target.value)} />
            ) : (
              <h2 className={styles.sheetTitle}>{name}</h2>
            )}
            {meta ? <p className={styles.sheetMeta}>{meta}</p> : null}

            {fields.length === 0 ? (
              <p className={styles.emptyCanvas}>Add a question from the left. A measurement here can draft the quote.</p>
            ) : null}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={fields.map((field) => field.key)} strategy={verticalListSortingStrategy}>
                <div className={styles.blocks}>
                  {fields.map((field, index) =>
                    !editing && !shown[index] ? null : (
                      <Block
                        key={field.key}
                        field={field}
                        index={index}
                        last={index === fields.length - 1}
                        editing={editing}
                        selected={selectedIndex === index}
                        hiddenBy={shown[index] || !field.showWhen ? null : describeRule(field.showWhen, fields)}
                        feeds={quoting && lines.some((line) => line.quantity.from === "field" && line.quantity.key === field.key)}
                        value={answers[field.key]}
                        onValue={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))}
                        onSelect={() => select({ kind: "field", index })}
                        onMove={(by) => move(index, by)}
                        onDuplicate={() => duplicate(index)}
                        onRemove={() => remove(index)}
                      />
                    ),
                  )}
                </div>
              </SortableContext>
            </DndContext>

            {quoting ? (
              <div
                className={`${styles.block} ${styles.quoteBlock}`}
                data-selected={editing && selection?.kind === "quote"}
                role="button"
                tabIndex={0}
                onClick={() => select({ kind: "quote", line: null })}
                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && select({ kind: "quote", line: null })}
              >
                {editing && selection?.kind === "quote" ? (
                  <span className={styles.blockTag}>
                    <ReceiptLong aria-hidden /> quote
                  </span>
                ) : null}
                <div className={styles.quoteHead}>
                  <p className={styles.quoteTitle}>The quote it drafts</p>
                  <span className={styles.muted}>{lines.length} {lines.length === 1 ? "line" : "lines"}</span>
                </div>
                <QuoteTable drafted={drafted} lines={lines} currency={currency} />
              </div>
            ) : null}
          </div>
        </div>

        <BottomPanel
          open={bottomOpen}
          onOpen={setBottomOpen}
          tab={bottomTab}
          onTab={setBottomTab}
          fields={fields}
          shown={shown}
          answers={answers}
          onClear={() => setAnswers({})}
          onSample={() => setAnswers(sampleAnswers(fields))}
          selectedKey={selectedKey}
          drafted={quoting ? drafted : null}
          lines={lines}
          problems={problems}
          currency={currency}
        />
      </section>

      {/* What is selected, set up */}
      <aside className={`${styles.pane} ${styles.right}`} aria-label="Settings">
        {selectedIndex !== null ? (
          <FieldInspector
            key={selectedIndex}
            field={fields[selectedIndex]}
            index={selectedIndex}
            fields={fields}
            types={types}
            keyLocked={lockedKeys.has(fields[selectedIndex].key)}
            onChange={(next) => update(selectedIndex, next)}
            quoteLines={quoting ? lines : undefined}
            onUseInQuote={quoting ? quoteFrom : undefined}
          />
        ) : selection?.kind === "quote" && quoting ? (
          <QuoteInspector lines={lines} fields={fields} currency={currency} open={selection.line} onOpen={(line) => select({ kind: "quote", line })} onChange={onQuoteLinesChange!} />
        ) : (
          formSettings
        )}
      </aside>
    </div>
  );
}

function Outline({ fields, selectedIndex, onSelect }: { fields: readonly FieldDefinition[]; selectedIndex: number | null; onSelect: (index: number) => void }) {
  // Under a section once one has started.
  const nested = fields.map((field, index) => field.type !== "section" && fields.slice(0, index).some((before) => before.type === "section"));
  return (
    <div>
      {fields.map((field, index) => {
        const Icon = FIELD_TYPE_ICONS[field.type];
        return (
          <button
            key={field.key}
            type="button"
            className={styles.outlineItem}
            data-section={field.type === "section"}
            data-depth={nested[index] ? 1 : 0}
            aria-current={selectedIndex === index}
            onClick={() => onSelect(index)}
          >
            <Icon aria-hidden />
            <span>{field.label || FIELD_TYPE_LABELS[field.type]}</span>
          </button>
        );
      })}
      {fields.length === 0 ? <p className={styles.hint}>Nothing on the form yet.</p> : null}
    </div>
  );
}

function Block({
  field,
  index,
  last,
  editing,
  selected,
  hiddenBy,
  feeds,
  value,
  onValue,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
}: {
  field: FieldDefinition;
  index: number;
  last: boolean;
  editing: boolean;
  selected: boolean;
  hiddenBy: string | null;
  feeds: boolean;
  value: unknown;
  onValue: (value: unknown) => void;
  onSelect: () => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: field.key, disabled: !editing });
  const Icon = FIELD_TYPE_ICONS[field.type];

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={styles.block}
      data-selected={editing && selected}
      data-hidden={editing && Boolean(hiddenBy)}
      onPointerDownCapture={editing ? onSelect : undefined}
      onFocusCapture={editing ? onSelect : undefined}
    >
      {editing && selected ? (
        <>
          <span className={styles.blockTag}>
            <Icon aria-hidden /> {field.key}
          </span>
          <div className={styles.blockTools}>
            <button type="button" className={styles.tool} aria-label="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUpward aria-hidden />
            </button>
            <button type="button" className={styles.tool} aria-label="Move down" disabled={last} onClick={() => onMove(1)}>
              <ArrowDownward aria-hidden />
            </button>
            <button type="button" ref={setActivatorNodeRef} className={styles.tool} data-drag="true" aria-label={`Drag ${field.label}`} {...attributes} {...listeners}>
              <DotsSixVertical aria-hidden />
            </button>
            <button type="button" className={styles.tool} aria-label="Duplicate" onClick={onDuplicate}>
              <CopySimple aria-hidden />
            </button>
            <button type="button" className={styles.tool} aria-label="Remove" onClick={onRemove}>
              <Trash2 aria-hidden />
            </button>
          </div>
        </>
      ) : null}
      {editing && feeds && !selected ? (
        <span className={styles.feeds}>
          <ReceiptLong aria-hidden /> Feeds the quote
        </span>
      ) : null}
      <FieldInput field={field} value={value} onChange={onValue} mode="fill" idPrefix="canvas" />
      {editing && hiddenBy ? <p className={styles.hiddenNote}>Not asked with these answers. Asked when {hiddenBy.charAt(0).toLowerCase() + hiddenBy.slice(1)}.</p> : null}
    </div>
  );
}

function QuoteTable({ drafted, lines, currency }: { drafted: DraftedLine[]; lines: readonly QuoteLine[]; currency: string }) {
  if (lines.length === 0) return <p className={styles.hint}>No lines yet. Select a measurement and use it in a quote line.</p>;
  if (drafted.length === 0) return <p className={styles.hint}>Nothing drafted yet. Fill in the measurements above to see the quote.</p>;
  return (
    <table className={styles.quoteTable}>
      <thead>
        <tr>
          <th>Line</th>
          <th className={styles.num}>Quantity</th>
          <th className={styles.num}>Price</th>
          <th className={styles.num}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {drafted.map((line) => (
          <tr key={line.lineId}>
            <td>
              {line.description}
              <span className={styles.lineSource}>{line.source}</span>
            </td>
            <td className={styles.num}>
              {line.quantity.toLocaleString("en-GB", { maximumFractionDigits: 2 })} {line.unit ?? ""}
            </td>
            <td className={styles.num}>{formatMoney(line.unitPrice, currency)}</td>
            <td className={styles.num}>{formatMoney(line.amount, currency)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3}>Before tax</td>
          <td className={styles.num}>{formatMoney(draftSubtotal(drafted), currency)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function BottomPanel({
  open,
  onOpen,
  tab,
  onTab,
  fields,
  shown,
  answers,
  onClear,
  onSample,
  selectedKey,
  drafted,
  lines,
  problems,
  currency,
}: {
  open: boolean;
  onOpen: (open: boolean) => void;
  tab: "answers" | "quote" | "problems";
  onTab: (tab: "answers" | "quote" | "problems") => void;
  fields: readonly FieldDefinition[];
  shown: boolean[];
  answers: Record<string, unknown>;
  onClear: () => void;
  onSample: () => void;
  selectedKey: string | null;
  drafted: DraftedLine[] | null;
  lines: readonly QuoteLine[];
  problems: string[];
  currency: string;
}) {
  const asked = fields.filter((field, index) => !DISPLAY_FIELD_TYPES.includes(field.type) && shown[index]);
  const tabs: Array<{ id: "answers" | "quote" | "problems"; label: string; count?: number }> = [
    { id: "answers", label: "Test answers" },
    ...(drafted ? [{ id: "quote" as const, label: "Quote it makes" }] : []),
    { id: "problems", label: "Problems", count: problems.length },
  ];
  return (
    <div className={styles.bottom}>
      <div className={styles.bottomBar} role="tablist" aria-label="Test">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={open && tab === entry.id}
            className={styles.paneTab}
            onClick={() => {
              onTab(entry.id);
              onOpen(true);
            }}
          >
            {entry.label}
            {entry.count !== undefined ? <span className={styles.count}>{entry.count}</span> : null}
          </button>
        ))}
        <span className={styles.spacer} />
        {tab === "answers" && open ? (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onSample}>
              Fill with sample answers
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={Object.keys(answers).length === 0}>
              Clear
            </Button>
          </>
        ) : null}
        <button type="button" className={styles.tool} aria-label={open ? "Hide the test panel" : "Show the test panel"} onClick={() => onOpen(!open)}>
          {open ? <ChevronDown aria-hidden /> : <ChevronUpIcon aria-hidden />}
        </button>
      </div>
      {open ? (
        <div className={styles.bottomBody} role="tabpanel">
          {tab === "answers" ? (
            asked.length === 0 ? (
              <p className={styles.hint}>Questions you add are listed here with what they are answered.</p>
            ) : (
              <table className={styles.answers}>
                <tbody>
                  {asked.map((field) => {
                    const warning = MEASURE_FIELD_TYPES.includes(field.type) ? measureWarning(field, answers[field.key]) : null;
                    return (
                      <tr key={field.key} aria-current={selectedKey === field.key}>
                        <td>{field.key}</td>
                        <td className={styles.kindCell}>{FIELD_TYPE_LABELS[field.type].toLowerCase()}</td>
                        <td>
                          {formatAnswer(field, answers[field.key]) || <span className={styles.muted}>not answered</span>}
                          {warning ? <span className={styles.warn}> · {warning}</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                  {drafted ? (
                    <tr>
                      <td>quote.total</td>
                      <td className={styles.kindCell}>money</td>
                      <td>
                        {formatMoney(draftSubtotal(drafted), currency)} · {drafted.length} of {lines.length} lines
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )
          ) : tab === "quote" && drafted ? (
            <QuoteTable drafted={drafted} lines={lines} currency={currency} />
          ) : problems.length === 0 ? (
            <p className={styles.hint}>Nothing wrong. Every question can be answered and every quote line has something to count.</p>
          ) : (
            <ul className={styles.problems}>
              {problems.map((problem) => (
                <li key={problem}>
                  <Warning aria-hidden />
                  {problem}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Answers that look like a real visit, to see the form and its quote working. */
export function sampleAnswers(fields: readonly FieldDefinition[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    switch (field.type) {
      case "areas":
        answers[field.key] = [
          { name: "Shop floor", length: 18, width: 10.5 },
          { name: "Storeroom", length: 6.2, width: 5 },
          { name: "Loading bay", length: 5, width: 4 },
        ];
        break;
      case "area":
        answers[field.key] = field.shape === "total" ? { area: 24 } : { length: 6, width: 4 };
        break;
      case "run":
        answers[field.key] = [18, 10.5, 18, 5.5];
        break;
      case "length":
        answers[field.key] = 4.2;
        break;
      case "count":
        answers[field.key] = 3;
        break;
      case "reading":
        answers[field.key] = field.warnAbove !== undefined ? field.warnAbove - 0.2 : 3.8;
        break;
      case "number":
        answers[field.key] = 12;
        break;
      case "select":
        answers[field.key] = field.options?.[0]?.value;
        break;
      case "multiSelect":
        answers[field.key] = field.options?.slice(0, 1).map((option) => option.value);
        break;
      case "checkbox":
        answers[field.key] = true;
        break;
      case "text":
        answers[field.key] = field.placeholder ?? "Light grey";
        break;
      case "date":
        answers[field.key] = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
        break;
      default:
        break;
    }
  }
  return answers;
}

