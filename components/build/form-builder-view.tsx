"use client";

import * as React from "react";

import {
  BuilderBar,
  BuilderGrid,
  BuilderInspector,
  BuilderOutline,
  type BlockKind,
  type BuilderMode,
  type SavedState,
} from "@/components/builder/grid";
import { FieldInspector } from "@/components/builder/grid/field-inspector";
import { lineFor, QuoteInspector } from "@/components/builder/grid/quote-inspector";
import { describeRule } from "@/components/builder/grid/rule-editor";
import { Button, Icon, useShortcut, type IconName } from "@/components/core";
import { formatMoney } from "@/components/crm/money/money";
import { FieldInput } from "@/components/forms/field-input";
import { followLabel, newQuestion } from "@/lib/forms/questions";
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

/** Each kind of question's mark in the outline and its Add menu. */
export const FIELD_ICONS: Record<FieldType, IconName> = {
  text: "pen",
  longText: "docs",
  number: "figure",
  email: "at",
  phone: "whatsapp",
  date: "calendar",
  select: "list",
  multiSelect: "list",
  checkbox: "check",
  file: "file",
  rating: "thumbup",
  length: "measure",
  area: "measure",
  areas: "measure",
  count: "grid",
  reading: "moisture",
  run: "wall",
  photos: "photo",
  signature: "signature",
  section: "sections",
  note: "sentence",
};

/** The Add menu, in the order a person reaches for things on site. */
const ADD_GROUPS: Array<{ title: string; types: FieldType[] }> = [
  { title: "Measure", types: ["length", "area", "areas", "count", "reading", "run", "number"] },
  { title: "Ask", types: ["text", "longText", "checkbox", "select", "multiSelect", "date", "rating", "email", "phone"] },
  { title: "Capture", types: ["photos", "signature", "file"] },
  { title: "Lay out", types: ["section", "note"] },
];

const QUOTE_ID = "__quote__";

type Selection = { kind: "field"; index: number } | { kind: "quote"; line: string | null } | null;
type InspectorTab = "item" | "data" | "vane" | "settings";

export type FormBuilderViewProps = {
  /** The bar's two lines: the form's name, and what it is ("Form, used on site visits"). */
  name: string;
  /** Left out, the name is printed rather than typed: the page around the builder holds it. */
  onName?: (name: string) => void;
  role: string;
  /** Where Back goes, and what the button says. */
  back?: { label: string; onBack: () => void };
  fields: FieldDefinition[];
  onFields: (fields: FieldDefinition[]) => void;
  types: readonly FieldType[];
  lockedKeys: ReadonlySet<string>;
  /** Under Required, what it holds up. */
  requiredNote: string;
  /** The quote the form drafts; omitted, it drafts none. */
  quoteLines?: QuoteLine[];
  onQuoteLines?: (lines: QuoteLine[]) => void;
  currency?: string;
  /** The form's own settings: the inspector's Settings tab. */
  settings: React.ReactNode;
  /** On the paper before and after its questions: what every submission asks regardless. */
  before?: React.ReactNode;
  after?: React.ReactNode;
  /** The foot of the paper when the form drafts no quote: where its answers go. */
  foot?: React.ReactNode;
  saved?: SavedState;
  /** The bar's own buttons (Insights, Open the form). */
  actions?: React.ReactNode;
  /** What stands in the way of publishing, beyond the questions' own problems. */
  problems?: readonly string[];
  /** Left out, with no `primary`, the bar has no primary: the page around the builder publishes it. */
  onPublish?: () => void;
  publishing?: boolean;
  /** What stands for Publish where the form cannot be published here (Use this template). */
  primary?: { label: string; icon: IconName; onClick: () => void; busy: boolean; disabled?: boolean };
  /** Fills the frame it is put in rather than the window (the admin portal's library). */
  framed?: boolean;
  /** Who may change it is the API's to say: a person who cannot sees it and may preview it. */
  canEdit: boolean;
  /**
   * Vane's changes to the form, from its answers (PageVaneForm): the
   * inspector's Vane tab, opened first while any waits, and the questions
   * they touch, marked in the outline and on the paper until kept.
   */
  vane?: { waiting: number; pending: ReadonlySet<string>; panel: React.ReactNode };
};

/**
 * A form on the builder's grid (BuildForm, PageIntakeForm): the bar across the
 * top with Build and Preview (P) and Publish (Ctrl ↵); the outline, its
 * sections and questions, with Add (/); the form on paper, filled in as it is
 * built — the answers, the figures they come to and the quote they draft are
 * the test; and the inspector: the selected question (or the quote), the data
 * it collects, and the form's settings. Pure: the page loads and saves.
 */
export function FormBuilderView(props: FormBuilderViewProps) {
  const {
    name,
    onName,
    role,
    back,
    fields,
    onFields,
    types,
    lockedKeys,
    requiredNote,
    quoteLines,
    onQuoteLines,
    currency = "USD",
    settings,
    before,
    after,
    foot,
    saved,
    actions,
    onPublish,
    publishing = false,
    primary,
    framed = false,
    canEdit,
    vane,
  } = props;
  const [mode, setMode] = React.useState<BuilderMode>(canEdit ? "build" : "preview");
  const [tab, setTab] = React.useState<InspectorTab>("item");
  // Vane's changes open first while any waits, once: from then on the tab is the person's.
  const vaneWaiting = (vane?.waiting ?? 0) > 0;
  const [vaneOpened, setVaneOpened] = React.useState(false);
  React.useEffect(() => {
    if (!vaneWaiting || vaneOpened) return;
    setVaneOpened(true);
    setTab("vane");
  }, [vaneWaiting, vaneOpened]);
  const [selection, setSelection] = React.useState<Selection>(fields.length ? { kind: "field", index: firstAsked(fields) } : null);
  const [answers, setAnswers] = React.useState<Record<string, unknown>>({});
  const [phone, setPhone] = React.useState(false);

  const quoting = Boolean(quoteLines && onQuoteLines);
  const lines = React.useMemo(() => quoteLines ?? [], [quoteLines]);
  const drafted = React.useMemo(() => (quoting ? draftQuote(lines, fields, answers) : []), [answers, fields, lines, quoting]);
  const problems = React.useMemo(
    () => [...fieldProblems(fields), ...(quoting ? quoteLineProblems(lines, fields) : []), ...(props.problems ?? [])],
    [fields, lines, quoting, props.problems],
  );
  const selectedIndex = selection?.kind === "field" && selection.index < fields.length ? selection.index : null;
  const selected = selectedIndex === null ? null : fields[selectedIndex]!;
  const shown = fields.map((field) => isShown(field, fields, answers));
  const building = mode === "build" && canEdit;
  const asked = fields.filter((field) => !DISPLAY_FIELD_TYPES.includes(field.type));

  useShortcut("Esc", () => setSelection(null), { enabled: building && selection !== null });

  const select = (next: Selection) => {
    setSelection(next);
    setTab("item");
  };

  function add(kindId: string) {
    if (kindId === QUOTE_ID) {
      if (lines.length === 0) quoteFrom(fields.find((field) => MEASURE_FIELD_TYPES.includes(field.type))?.key ?? "");
      else select({ kind: "quote", line: null });
      return;
    }
    const field = newQuestion(kindId as FieldType, "", fields);
    const at = selectedIndex === null ? fields.length : selectedIndex + 1;
    onFields([...fields.slice(0, at), field, ...fields.slice(at)]);
    select({ kind: "field", index: at });
  }

  function update(index: number, next: FieldDefinition) {
    const previous = fields[index]!;
    const others = fields.filter((_, at) => at !== index);
    const field = followLabel(previous, next, others, lockedKeys);
    // Answers, rules and quote lines follow a key that follows its label.
    if (field.key !== previous.key) {
      setAnswers((current) => {
        const { [previous.key]: moved, ...rest } = current;
        return moved === undefined ? rest : { ...rest, [field.key]: moved };
      });
      if (quoting) {
        onQuoteLines!(
          lines.map((line) => ({
            ...line,
            ...(line.quantity.from === "field" && line.quantity.key === previous.key ? { quantity: { ...line.quantity, key: field.key } } : {}),
            ...(line.showWhen?.key === previous.key ? { showWhen: { ...line.showWhen, key: field.key } } : {}),
          })),
        );
      }
      onFields(fields.map((other, at) => (at === index ? field : other.showWhen?.key === previous.key ? { ...other, showWhen: { ...other.showWhen, key: field.key } } : other)));
      return;
    }
    onFields(fields.map((other, at) => (at === index ? field : other)));
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= fields.length || from === to) return;
    const next = [...fields];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    onFields(next);
    if (selectedIndex === from) setSelection({ kind: "field", index: to });
  }

  function duplicate(index: number) {
    const field = fields[index]!;
    const label = `${field.label} (copy)`;
    const copy = { ...field, label, key: keyFromLabel(label, new Set(fields.map((other) => other.key))) };
    onFields([...fields.slice(0, index + 1), copy, ...fields.slice(index + 1)]);
    select({ kind: "field", index: index + 1 });
  }

  function remove(index: number) {
    onFields(fields.filter((_, at) => at !== index));
    setSelection(fields.length > 1 ? { kind: "field", index: Math.max(0, index - 1) } : null);
  }

  function quoteFrom(key: string) {
    if (!quoting) return;
    const line = lineFor(fields.find((field) => field.key === key), lines);
    onQuoteLines!([...lines, line]);
    select({ kind: "quote", line: line.id });
  }

  /* ── The bar ─────────────────────────────────────────────────────────── */

  const bar = (
    <BuilderBar
      lead={
        <>
          {back ? <Button variant="quiet" iconOnly icon="back" label={back.label} onClick={back.onBack} /> : null}
          <span className="rb-mark" aria-hidden>
            <Icon name="visits" />
          </span>
          <div className="st-name">
            <b className="truncate">{name || "Untitled form"}</b>
            <span className="truncate">{role}</span>
          </div>
        </>
      }
      name={name || "Untitled form"}
      mode={mode}
      onMode={(next) => setMode(canEdit ? next : "preview")}
      saved={saved}
      actions={
        <>
          {mode === "preview" ? (
            <Button variant="quiet" icon={phone ? "general" : "ws"} onClick={() => setPhone(!phone)}>
              {phone ? "Desktop width" : "Phone width"}
            </Button>
          ) : null}
          {actions}
        </>
      }
      publish={
        primary
          ? { label: primary.label, icon: primary.icon, onPublish: primary.onClick, busy: primary.busy, disabled: primary.disabled }
          : onPublish
            ? { onPublish, disabled: !canEdit || problems.length > 0, busy: publishing }
            : undefined
      }
    />
  );

  /* ── The outline ─────────────────────────────────────────────────────── */

  const kinds: BlockKind[] = [
    ...ADD_GROUPS.flatMap((group) => {
      const allowed = group.types.filter((type) => types.includes(type));
      return allowed.map((type, at) => ({ id: type, label: FIELD_TYPE_LABELS[type], icon: FIELD_ICONS[type], ...(at === 0 ? { group: group.title } : {}) }));
    }),
    ...(quoting ? [{ id: QUOTE_ID, label: "Quote lines", icon: "invoice" as const, group: "Quote" }] : []),
  ];

  const outline = (
    <BuilderOutline
      addLabel="Add"
      entries={[
        ...fields.map((field) => ({
          id: field.key,
          icon: FIELD_ICONS[field.type],
          title: `${field.label || FIELD_TYPE_LABELS[field.type]}${vane?.pending.has(field.key) ? " · Vane" : ""}`,
          heading: field.type === "section",
          sub: Boolean(field.showWhen),
        })),
      ]}
      selected={selected?.key ?? null}
      onSelect={(key) => select({ kind: "field", index: fields.findIndex((field) => field.key === key) })}
      onMove={move}
      kinds={kinds}
      onAdd={add}
      after={
        quoting ? (
          <>
            <div className="oh">The quote</div>
            <button type="button" className={selection?.kind === "quote" ? "oi is-on" : "oi"} onClick={() => select({ kind: "quote", line: null })}>
              <Icon name="invoice" />
              <span className="oi-t">The quote it drafts</span>
              <span className="oi-q">{lines.length}</span>
            </button>
          </>
        ) : null
      }
    />
  );

  /* ── The paper ───────────────────────────────────────────────────────── */

  const sections = sectionsOf(fields);
  const row = (field: FieldDefinition, index: number) => {
    const isSelected = building && selectedIndex === index;
    const hiddenBy = shown[index] || !field.showWhen ? null : describeRule(field.showWhen, fields);
    if (!building && !shown[index]) return null;
    const feeds = quoting && lines.some((line) => line.quantity.from === "field" && line.quantity.key === field.key);
    const figure = MEASURE_FIELD_TYPES.includes(field.type) ? formatAnswer(field, answers[field.key]) : "";
    const warning = MEASURE_FIELD_TYPES.includes(field.type) ? measureWarning(field, answers[field.key]) : null;
    const pick = building ? () => select({ kind: "field", index }) : undefined;
    if (field.type === "note") {
      return (
        <div key={field.key} className={isSelected ? "qr sel" : "qr"} onPointerDownCapture={pick} onFocusCapture={pick}>
          {isSelected ? <SelTag icon={FIELD_ICONS.note} label="Note" /> : null}
          <p className="rb-note-q">{field.help || field.label}</p>
        </div>
      );
    }
    return (
      <div
        key={field.key}
        className={["qr", field.showWhen && "is-sub", isSelected && "sel", building && hiddenBy && "is-hidden"].filter(Boolean).join(" ")}
        onPointerDownCapture={pick}
        onFocusCapture={pick}
      >
        {isSelected ? (
          vane?.pending.has(field.key) ? (
            <SelTag icon="foryou" label="Vane’s change, not kept" />
          ) : (
            <SelTag icon={FIELD_ICONS[field.type]} label={FIELD_TYPE_LABELS[field.type]} />
          )
        ) : null}
        {field.type === "checkbox" ? null : (
          <div className="qr-l">
            <label className="qr-q" htmlFor={`canvas-${field.key}`}>
              {field.label || FIELD_TYPE_LABELS[field.type]}
            </label>
            <span className="qr-m">{field.showWhen ? `When ${describeRule(field.showWhen, fields).charAt(0).toLowerCase()}${describeRule(field.showWhen, fields).slice(1)}` : field.required ? "Required" : ""}</span>
            {building && feeds ? (
              <span className="qr-feeds">
                <Icon name="invoice" />
                Feeds the quote
              </span>
            ) : null}
          </div>
        )}
        <div className="qr-in">
          <FieldInput field={field} value={answers[field.key]} onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))} mode="fill" idPrefix="canvas" bare />
        </div>
        {figure ? <div className="qr-fig num">{figure}</div> : null}
        {field.help && field.type !== "checkbox" ? <p className="qr-note">{field.help}</p> : null}
        {warning ? <p className="qr-warn">{warning}</p> : null}
        {building && hiddenBy ? <p className="qr-note">Not asked with these answers. Asked when {hiddenBy.charAt(0).toLowerCase() + hiddenBy.slice(1)}.</p> : null}
      </div>
    );
  };

  const subtotal = draftSubtotal(drafted);
  const canvas = (
    <div className="rb-sheet">
      <div className={phone ? "fpaper is-phone" : "fpaper"}>
        {building && onName ? (
          <input className="rb-title text-title" aria-label="Form name" value={name} placeholder="Untitled form" onChange={(event) => onName(event.target.value)} />
        ) : (
          <h1 className="text-title">{name || "Untitled form"}</h1>
        )}
        {before}
        {fields.length === 0 ? <p className="muted">Nothing on the form yet. Add a question (/); a measurement here can draft the quote.</p> : null}
        {sections.map((section) =>
          section.head === null ? (
            <section key="lead" className="fs">
              {section.rows.map((index) => row(fields[index]!, index))}
            </section>
          ) : (
            <section key={fields[section.head]!.key} className="fs">
              <div
                className={building && selectedIndex === section.head ? "rb-sec sel" : "rb-sec"}
                onPointerDownCapture={building ? () => select({ kind: "field", index: section.head! }) : undefined}
              >
                {building && selectedIndex === section.head ? <SelTag icon="sections" label="Section" /> : null}
                <h2>{fields[section.head]!.label || "Section"}</h2>
                {fields[section.head]!.help ? <p>{fields[section.head]!.help}</p> : null}
              </div>
              {section.rows.map((index) => row(fields[index]!, index))}
            </section>
          ),
        )}
        {quoting ? (
          <div
            className={building && selection?.kind === "quote" ? "rb-quote sel" : "rb-quote"}
            id="the-quote"
            onPointerDownCapture={building ? () => select({ kind: "quote", line: selection?.kind === "quote" ? selection.line : null }) : undefined}
          >
            {building && selection?.kind === "quote" ? <SelTag icon="invoice" label="Quote" /> : null}
            <h2>The quote it drafts</h2>
            <QuoteTable drafted={drafted} lines={lines} currency={currency} />
          </div>
        ) : null}
        {after}
      </div>
      {quoting ? (
        <div className="cfoot">
          <span>
            {drafted.length ? (
              <>
                These answers draft a quote of <b className="num">{formatMoney(subtotal, currency)}</b>, {drafted.length} {drafted.length === 1 ? "line" : "lines"}
              </>
            ) : lines.length ? (
              "Fill in the measurements to see the quote they draft"
            ) : (
              "Select a measurement and use it in a quote line to draft the quote"
            )}
          </span>
          <Button
            icon="invoice"
            onClick={() => {
              if (building) select({ kind: "quote", line: null });
              document.getElementById("the-quote")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            See the quote
          </Button>
        </div>
      ) : foot ? (
        <div className="cfoot">{foot}</div>
      ) : null}
    </div>
  );

  /* ── The inspector ───────────────────────────────────────────────────── */

  const itemTab = selection?.kind === "quote" && quoting ? "Quote" : "Question";
  const inspector = (
    <BuilderInspector<InspectorTab>
      tabs={[
        { value: "item", label: itemTab },
        { value: "data", label: "Data", count: asked.length + (quoting ? 1 : 0) },
        ...(vane ? [{ value: "vane" as const, label: "Vane", count: vane.waiting }] : []),
        { value: "settings", label: "Settings" },
      ]}
      tab={tab}
      onTab={setTab}
    >
      {tab === "item" ? (
        selection?.kind === "quote" && quoting ? (
          <QuoteInspector
            lines={lines}
            fields={fields}
            currency={currency}
            open={selection.line}
            onOpen={(line) => setSelection({ kind: "quote", line })}
            onChange={onQuoteLines!}
          />
        ) : selected && selectedIndex !== null ? (
          <>
            <FieldInspector
              key={selectedIndex}
              field={selected}
              index={selectedIndex}
              fields={fields}
              types={types}
              keyLocked={lockedKeys.has(selected.key)}
              requiredNote={requiredNote}
              onChange={(next) => update(selectedIndex, next)}
              quoteLines={quoting ? lines : undefined}
              onUseInQuote={quoting ? quoteFrom : undefined}
              onOpenLine={(line) => select({ kind: "quote", line })}
            />
            <div className="rb-acts">
              <Button icon="file" onClick={() => duplicate(selectedIndex)}>
                Duplicate
              </Button>
              <Button variant="quiet" icon="x" onClick={() => remove(selectedIndex)}>
                Remove
              </Button>
            </div>
          </>
        ) : (
          <p className="rb-note">Select a question on the form to set it up, or press / to add one.</p>
        )
      ) : tab === "vane" && vane ? (
        vane.panel
      ) : tab === "data" ? (
        <DataPanel
          fields={fields}
          shown={shown}
          answers={answers}
          selectedKey={selected?.key ?? null}
          drafted={quoting ? drafted : null}
          lines={lines}
          problems={problems}
          currency={currency}
          onSample={() => setAnswers(sampleAnswers(fields))}
          onClear={() => setAnswers({})}
        />
      ) : (
        settings
      )}
    </BuilderInspector>
  );

  return (
    <BuilderGrid
      scope="form"
      mode={building ? "build" : "preview"}
      wideBar
      bar={bar}
      outline={outline}
      canvas={canvas}
      canvasLabel={name || "The form"}
      inspector={inspector}
      inspectorLabel="Selected"
      framed={framed}
    />
  );
}

function SelTag({ icon, label }: { icon: IconName; label: string }) {
  return (
    <span className="sel-tag">
      <Icon name={icon} />
      {label}
    </span>
  );
}

/** The first question that is answered: where the builder opens. */
function firstAsked(fields: readonly FieldDefinition[]): number {
  const at = fields.findIndex((field) => !DISPLAY_FIELD_TYPES.includes(field.type));
  return at >= 0 ? at : 0;
}

/** The questions under each section heading; those before the first section stand on their own. */
export function sectionsOf(fields: readonly FieldDefinition[]): Array<{ head: number | null; rows: number[] }> {
  const out: Array<{ head: number | null; rows: number[] }> = [];
  fields.forEach((field, index) => {
    if (field.type === "section") out.push({ head: index, rows: [] });
    else if (out.length === 0) out.push({ head: null, rows: [index] });
    else out[out.length - 1]!.rows.push(index);
  });
  return out;
}

function QuoteTable({ drafted, lines, currency }: { drafted: DraftedLine[]; lines: readonly QuoteLine[]; currency: string }) {
  if (lines.length === 0) return <p className="muted">No lines yet. Select a measurement and use it in a quote line.</p>;
  if (drafted.length === 0) return <p className="muted">Nothing drafted yet. Fill in the measurements above to see the quote.</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th className="r">Qty</th>
          <th className="r">Price</th>
          <th className="r">Amount</th>
        </tr>
      </thead>
      <tbody>
        {drafted.map((line) => (
          <tr key={line.lineId}>
            <td>
              {line.description}
              <small>{line.source}</small>
            </td>
            <td className="r">
              {line.quantity.toLocaleString("en-GB", { maximumFractionDigits: 2 })} {line.unit ?? ""}
            </td>
            <td className="r">{formatMoney(line.unitPrice, currency)}</td>
            <td className="r">{formatMoney(line.amount, currency)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3}>Before tax</td>
          <td className="r">{formatMoney(draftSubtotal(drafted), currency)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Data: what the form saves, each answer under its key, filled in to test it; the quote it makes; what is wrong. */
function DataPanel({
  fields,
  shown,
  answers,
  selectedKey,
  drafted,
  lines,
  problems,
  currency,
  onSample,
  onClear,
}: {
  fields: readonly FieldDefinition[];
  shown: boolean[];
  answers: Record<string, unknown>;
  selectedKey: string | null;
  drafted: DraftedLine[] | null;
  lines: readonly QuoteLine[];
  problems: readonly string[];
  currency: string;
  onSample: () => void;
  onClear: () => void;
}) {
  const asked = fields.filter((field, index) => !DISPLAY_FIELD_TYPES.includes(field.type) && shown[index]);
  return (
    <>
      <h2>What it saves</h2>
      <p className="rb-note">Each answer is kept under its name. Fill the form in to test it, or fill it with sample answers.</p>
      <div className="rb-acts" style={{ marginTop: 0 }}>
        <Button icon="run" onClick={onSample}>
          Fill with sample answers
        </Button>
        <Button variant="quiet" onClick={onClear} disabled={Object.keys(answers).length === 0}>
          Clear
        </Button>
      </div>
      {asked.length === 0 ? (
        <p className="rb-note">Questions you add are listed here with what they are answered.</p>
      ) : (
        <table className="rb-answers">
          <tbody>
            {asked.map((field) => {
              const warning = MEASURE_FIELD_TYPES.includes(field.type) ? measureWarning(field, answers[field.key]) : null;
              return (
                <tr key={field.key} aria-current={selectedKey === field.key ? "true" : undefined}>
                  <td>{field.key}</td>
                  <td>
                    {formatAnswer(field, answers[field.key]) || <span className="muted">not answered</span>}
                    {warning ? <span className="muted"> · {warning}</span> : null}
                  </td>
                </tr>
              );
            })}
            {drafted ? (
              <tr>
                <td>quote.total</td>
                <td>
                  {formatMoney(draftSubtotal(drafted), currency)} · {drafted.length} of {lines.length} lines
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      )}
      <div className="pl">
        <div className="pl-h">Problems</div>
        {problems.length === 0 ? (
          <p className="rb-note">Nothing wrong. Every question can be answered{lines.length ? " and every quote line has something to count" : ""}.</p>
        ) : (
          <ul className="rb-problems">
            {problems.map((problem) => (
              <li key={problem}>
                <Icon name="warn" />
                {problem}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** Answers that look like a real visit, to see the form and its quote working. */
export function sampleAnswers(fields: readonly FieldDefinition[]): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const field of fields) {
    switch (field.type) {
      case "areas":
        answers[field.key] = [
          { name: "Lounge", length: 5.2, width: 4.1 },
          { name: "Passage", length: 6, width: 1.1 },
        ];
        break;
      case "area":
        answers[field.key] = field.shape === "total" ? { area: 24 } : { length: 6, width: 4 };
        break;
      case "run":
        answers[field.key] = [8.2, 7.6, 8.2, 7.6];
        break;
      case "length":
        answers[field.key] = 4.2;
        break;
      case "count":
        answers[field.key] = 3;
        break;
      case "reading":
        answers[field.key] = field.warnAbove !== undefined ? field.warnAbove - 0.2 : 3.4;
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
