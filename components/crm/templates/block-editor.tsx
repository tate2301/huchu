"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Switch } from "@corelithzw/react";

import { PageEditor, type EditorItemContext, type EditorKind } from "@/components/editor/page-editor";
import editor from "@/components/editor/page-editor.module.css";
import { followLabel, newQuestion } from "@/components/forms/form-builder/form-builder";
import { QuestionEditor, QuestionToolbar } from "@/components/forms/form-builder/question-editor";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calculate,
  Camera,
  EditSquare,
  Grid3x3,
  Minus,
  NotePencil,
  Plus,
  Policy,
  ReceiptLong,
  SlidersHorizontal,
  Square,
  TableRows,
  TextAlignLeft,
  TextT,
  X,
  type LucideIcon,
} from "@/lib/icons";
import {
  BLOCKS_FOR_KIND,
  BLOCK_LABELS,
  blockFields,
  emptyBlock,
  type Block,
  type BlockType,
  type LeafBlock,
  type TemplateKind,
} from "@/lib/crm/blocks";
import { starterBlocks, startersForKind } from "@/lib/crm/starter-templates";
import { VARIABLE_CATALOGUE } from "@/lib/crm/template-variables";
import { FIELD_TYPES, keyFromLabel } from "@/lib/forms/fields";

import styles from "./block-editor.module.css";
import { VariablePicker } from "./variable-picker";

/**
 * A template, written on the page — the same editor the form builder uses.
 *
 * Every block is edited where it sits: a heading is typed at its size, text is
 * typed as the paragraph it will be (with `{{variables}}` put in at the caret),
 * a question is typed onto the form, a table's columns are typed as its
 * headers. `/` on the line at the foot offers every block the template's kind
 * allows; `+` beside a block puts one under it; the handle drags it. Selecting
 * a block shows only the controls that block has.
 *
 * The block vocabulary is `lib/crm/blocks.ts` and nothing here invents a kind:
 * `BLOCKS_FOR_KIND` decides what is offered, so a quote never gets a question
 * and an export never gets a logo.
 */

const BLOCK_ICONS: Record<BlockType, LucideIcon> = {
  heading: TextT,
  text: TextAlignLeft,
  field: EditSquare,
  divider: Minus,
  spacer: Square,
  image: Camera,
  table: TableRows,
  lineItems: ReceiptLong,
  totals: Calculate,
  signature: NotePencil,
  terms: Policy,
  columns: Grid3x3,
};

const PREFILL = VARIABLE_CATALOGUE.map((variable) => ({ key: variable.key, label: variable.label }));

const newId = (type: string) => `${type}-${Math.random().toString(36).slice(2, 8)}`;

function kindsFor(types: readonly BlockType[]): EditorKind[] {
  return types.map((type) => ({ id: type, label: BLOCK_LABELS[type], icon: BLOCK_ICONS[type] }));
}

export function BlockEditor({
  kind,
  blocks,
  onChange,
  problems,
  lockedKeys = new Set<string>(),
  header,
}: {
  kind: TemplateKind;
  blocks: Block[];
  onChange: (next: Block[]) => void;
  /** What is stopping this template being published, shown under the last block. */
  problems?: readonly string[];
  /** Question keys saved answers are stored under. Their questions keep them. */
  lockedKeys?: ReadonlySet<string>;
  header?: ReactNode;
}) {
  const allowed = BLOCKS_FOR_KIND[kind];
  const starters = startersForKind(kind);
  const asks = allowed.includes("field");

  return (
    <PageEditor<Block>
      items={blocks}
      onChange={onChange}
      kinds={kindsFor(allowed)}
      // A form is questions, typed one after another; anything else is prose.
      defaultKind={asks ? "field" : "text"}
      addPlaceholder={asks ? "Type a question, or / for any block" : "Type, or / for any block"}
      itemName={(block) => BLOCK_LABELS[block.type]}
      create={(type, text, existing) => createBlock(type as BlockType, text, existing)}
      duplicate={(block, existing) => duplicateBlock(block, existing)}
      normalize={(previous, next, others) =>
        previous.type === "field" && next.type === "field"
          ? { ...next, field: followLabel(previous.field, next.field, blockFields([...others]), lockedKeys) }
          : next
      }
      renderItem={(block, update, context) => (
        <BlockBody block={block} update={update} context={context} allowed={allowed} />
      )}
      renderToolbar={(block, update) => (
        <BlockToolbar block={block} update={update} keyEditable={block.type !== "field" || !lockedKeys.has(block.field.key)} />
      )}
      problems={problems}
      header={header}
      before={
        blocks.length === 0 && starters.length > 0 ? (
          <div className={styles.starters}>
            <p className={styles.startersLabel}>Start from</p>
            {starters.map((starter) => (
              <button
                key={starter.id}
                type="button"
                className={styles.button}
                onClick={() => onChange(starterBlocks(starter, ""))}
              >
                {starter.name}
              </button>
            ))}
          </div>
        ) : null
      }
    />
  );
}

function createBlock(type: BlockType, text: string, existing: readonly Block[]): Block {
  const id = newId(type);
  if (type === "field") {
    return { id, type: "field", field: newQuestion("text", text, blockFields([...existing])) };
  }
  const block = emptyBlock(type, id);
  if (text && (block.type === "heading" || block.type === "text" || block.type === "terms")) {
    return { ...block, text };
  }
  return block;
}

function duplicateBlock(block: Block, existing: readonly Block[]): Block {
  if (block.type === "field") {
    const label = `${block.field.label} (copy)`;
    const taken = new Set(blockFields([...existing]).map((field) => field.key));
    return { ...block, id: newId("field"), field: { ...block.field, label, key: keyFromLabel(label, taken) } };
  }
  if (block.type === "columns") {
    const renew = (child: LeafBlock): LeafBlock => ({ ...child, id: newId(child.type) });
    return { ...block, id: newId("columns"), left: block.left.map(renew), right: block.right.map(renew) };
  }
  return { ...block, id: newId(block.type) };
}

/** A block, edited where it sits. */
function BlockBody({
  block,
  update,
  context,
  allowed,
}: {
  block: Block;
  update: (next: Block) => void;
  context: EditorItemContext;
  allowed: readonly BlockType[];
}) {
  if (block.type === "columns") {
    return (
      <div className={styles.columns}>
        {(["left", "right"] as const).map((side) => (
          <Column
            key={side}
            side={side}
            blocks={block[side]}
            allowed={allowed.filter((type): type is LeafBlock["type"] => type !== "columns")}
            selected={context.selected}
            onChange={(children) => update({ ...block, [side]: children })}
          />
        ))}
      </div>
    );
  }
  return <LeafBody block={block} update={update} context={context} />;
}

function LeafBody({
  block,
  update,
  context,
}: {
  block: LeafBlock;
  update: (next: LeafBlock) => void;
  context: EditorItemContext;
}) {
  const onEnterKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      context.onEnter(event.currentTarget);
    }
  };

  switch (block.type) {
    case "heading":
      return (
        <input
          className={`${styles.heading} ${styles[`h${block.level}`]}`}
          value={block.text}
          placeholder="Heading"
          aria-label="Heading"
          onChange={(event) => update({ ...block, text: event.target.value })}
          onKeyDown={onEnterKey}
        />
      );

    case "text":
    case "terms":
      return (
        <Prose
          text={block.text}
          placeholder={block.type === "terms" ? "Terms and conditions" : "Text"}
          minRows={block.type === "terms" ? 4 : 1}
          selected={context.selected}
          onChange={(text) => update({ ...block, text })}
        />
      );

    case "field":
      return (
        <QuestionEditor field={block.field} onChange={(field) => update({ ...block, field })} context={context} />
      );

    case "divider":
      return <hr className={styles.rule} />;

    case "spacer":
      return <div className={styles.spacer} data-size={block.size} aria-hidden="true" />;

    case "image":
      return block.source === "url" && block.url ? (
        // A tenant-chosen address, drawn as-is: this is the preview of their document.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.image} src={block.url} alt={block.alt ?? ""} style={{ width: block.width }} />
      ) : (
        <div className={styles.logo}>
          <Camera aria-hidden="true" />
          <span>{block.source === "url" ? "An image" : "Your logo"}</span>
        </div>
      );

    case "signature":
      return (
        <div className={styles.signature}>
          <input
            className={styles.signatureLabel}
            value={block.label}
            placeholder="Signature"
            aria-label="What the signature line says"
            onChange={(event) => update({ ...block, label: event.target.value })}
            onKeyDown={onEnterKey}
          />
          <span className={styles.signLine} aria-hidden="true" />
        </div>
      );

    case "table":
      return (
        <TableColumns
          columns={block.columns}
          onChange={(columns) => update({ ...block, columns })}
        />
      );

    case "lineItems":
      return (
        <div className={styles.drawnTable} aria-hidden="true">
          <span>Description</span>
          <span>Qty</span>
          <span>Unit price</span>
          {block.showDiscount ? <span>Discount</span> : null}
          {block.showTax ? <span>Tax</span> : null}
          <span>Amount</span>
        </div>
      );

    case "totals":
      return (
        <dl className={styles.ladder} aria-hidden="true">
          <dt>Subtotal</dt>
          <dd>0.00</dd>
          {block.showTax ? (
            <>
              <dt>Tax</dt>
              <dd>0.00</dd>
            </>
          ) : null}
          <dt className={styles.ladderTotal}>Total</dt>
          <dd className={styles.ladderTotal}>0.00</dd>
          {block.showPaid ? (
            <>
              <dt>Paid</dt>
              <dd>0.00</dd>
            </>
          ) : null}
        </dl>
      );
  }
}

/**
 * A paragraph, typed as the paragraph it will be. It grows with what is typed,
 * and a variable goes in at the caret — where the author was writing — rather
 * than at the end of the paragraph.
 */
function Prose({
  text,
  placeholder,
  minRows,
  selected,
  onChange,
}: {
  text: string;
  placeholder: string;
  minRows: number;
  selected: boolean;
  onChange: (text: string) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState<number | null>(null);

  return (
    <>
      {/* As tall as its words once wrapped, which `rows` cannot count. */}
      <div className={styles.proseSizer} data-value={text || placeholder}>
        <textarea
          ref={area}
          className={styles.prose}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={minRows}
          onChange={(event) => onChange(event.target.value)}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
        />
      </div>
      {selected ? (
        <div className={styles.proseTools}>
          <VariablePicker
            onPick={(token) => {
              const at = caret ?? text.length;
              onChange(`${text.slice(0, at)}${token}${text.slice(at)}`);
              const next = at + token.length;
              requestAnimationFrame(() => {
                area.current?.focus();
                area.current?.setSelectionRange(next, next);
              });
            }}
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * A table's columns, typed as its header row. Enter starts the next column;
 * Backspace in an empty one removes it. A column's key comes from its first
 * words and is kept, so renaming a header does not unhook the data under it.
 */
function TableColumns({
  columns,
  onChange,
}: {
  columns: Array<{ key: string; label: string }>;
  onChange: (columns: Array<{ key: string; label: string }>) => void;
}) {
  const [draft, setDraft] = useState("");
  const keyFor = (label: string) =>
    keyFromLabel(label || "column", new Set(columns.map((column) => column.key)));

  return (
    <div className={styles.headerRow}>
      {columns.map((column, index) => (
        <span key={column.key} className={styles.headerCell}>
          <input
            className={styles.headerInput}
            value={column.label}
            size={Math.max(4, column.label.length)}
            placeholder="Column"
            aria-label={`Column ${index + 1}`}
            onChange={(event) =>
              onChange(columns.map((existing, at) => (at === index ? { ...existing, label: event.target.value } : existing)))
            }
            onKeyDown={(event) => {
              if (event.key === "Backspace" && column.label === "") {
                event.preventDefault();
                onChange(columns.filter((_, at) => at !== index));
              }
            }}
          />
          <button
            type="button"
            className={styles.cellRemove}
            aria-label={`Remove ${column.label || `column ${index + 1}`}`}
            onClick={() => onChange(columns.filter((_, at) => at !== index))}
          >
            <X aria-hidden="true" />
          </button>
        </span>
      ))}
      {columns.length < 12 ? (
        <input
          className={`${styles.headerCell} ${styles.headerDraft}`}
          value={draft}
          size={Math.max(10, draft.length)}
          placeholder="Add a column"
          aria-label="Add a column"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && draft.trim()) {
              event.preventDefault();
              onChange([...columns, { key: keyFor(draft.trim()), label: draft.trim() }]);
              setDraft("");
            }
          }}
          onBlur={() => {
            if (draft.trim()) {
              onChange([...columns, { key: keyFor(draft.trim()), label: draft.trim() }]);
              setDraft("");
            }
          }}
        />
      ) : null}
    </div>
  );
}

/** One side of a side-by-side block: its blocks, edited in place, and a way to add one. */
function Column({
  side,
  blocks,
  allowed,
  selected,
  onChange,
}: {
  side: "left" | "right";
  blocks: LeafBlock[];
  allowed: readonly LeafBlock["type"][];
  /** Whether the columns block is selected: its cells open up with it. */
  selected: boolean;
  onChange: (blocks: LeafBlock[]) => void;
}) {
  const ownContext: EditorItemContext = {
    selected,
    onEnter: (from) => {
      const next = from.closest("[data-column-item]")?.nextElementSibling;
      next?.querySelector<HTMLElement>("input, textarea")?.focus();
    },
  };

  return (
    <div className={styles.column} aria-label={side === "left" ? "Left" : "Right"}>
      {blocks.map((child, index) => (
        <div key={child.id} className={styles.columnItem} data-column-item="">
          {/* One grid cell, whatever the body draws: a question is several parts. */}
          <div className={styles.cellBody}>
            <LeafBody
              block={child}
              update={(next) => onChange(blocks.map((existing, at) => (at === index ? next : existing)))}
              context={ownContext}
            />
          </div>
          <button
            type="button"
            className={styles.cellRemove}
            aria-label={`Remove ${BLOCK_LABELS[child.type].toLowerCase()}`}
            onClick={() => onChange(blocks.filter((_, at) => at !== index))}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ))}
      <Select
        value=""
        onValueChange={(type) =>
          onChange([...blocks, createBlock(type as BlockType, "", blocks) as LeafBlock])
        }
      >
        <SelectTrigger className={`${styles.columnAdd} w-auto`} aria-label={`Add to the ${side}`}>
          <Plus aria-hidden="true" />
          <SelectValue placeholder="Add" />
        </SelectTrigger>
        <SelectContent>
          {allowed.map((type) => (
            <SelectItem key={type} value={type}>
              {BLOCK_LABELS[type]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** The selected block's own controls, and nothing it does not have. */
function BlockToolbar({
  block,
  update,
  keyEditable,
}: {
  block: Block;
  update: (next: Block) => void;
  keyEditable: boolean;
}) {
  switch (block.type) {
    case "field":
      return (
        <QuestionToolbar
          field={block.field}
          types={FIELD_TYPES}
          keyEditable={keyEditable}
          prefillVariables={PREFILL}
          onChange={(field) => update({ ...block, field })}
        />
      );

    case "heading":
      return (
        <Choice
          label="Size"
          value={String(block.level)}
          options={[
            ["1", "Large"],
            ["2", "Medium"],
            ["3", "Small"],
          ]}
          onChange={(value) => update({ ...block, level: Number(value) as 1 | 2 | 3 })}
        />
      );

    case "spacer":
      return (
        <Choice
          label="Size"
          value={block.size}
          options={[
            ["sm", "Small"],
            ["md", "Medium"],
            ["lg", "Large"],
          ]}
          onChange={(value) => update({ ...block, size: value as "sm" | "md" | "lg" })}
        />
      );

    case "signature":
      return (
        <Choice
          label="Who signs"
          value={block.party}
          options={[
            ["customer", "The customer"],
            ["us", "Us"],
            ["both", "Both"],
          ]}
          onChange={(value) => update({ ...block, party: value as "customer" | "us" | "both" })}
        />
      );

    case "lineItems":
      return (
        <>
          <Toggle label="Tax" on={block.showTax} onChange={(showTax) => update({ ...block, showTax })} />
          <Toggle
            label="Discount"
            on={block.showDiscount}
            onChange={(showDiscount) => update({ ...block, showDiscount })}
          />
        </>
      );

    case "totals":
      return (
        <>
          <Toggle label="Tax" on={block.showTax} onChange={(showTax) => update({ ...block, showTax })} />
          <Toggle label="Paid" on={block.showPaid} onChange={(showPaid) => update({ ...block, showPaid })} />
        </>
      );

    case "image":
      return (
        <>
          <Choice
            label="Image"
            value={block.source}
            options={[
              ["branding.logo", "Your logo"],
              ["url", "An image"],
            ]}
            onChange={(value) => update({ ...block, source: value as "branding.logo" | "url" })}
          />
          {block.source === "url" ? (
            <Settings>
              <Field label="Address" value={block.url ?? ""} onChange={(url) => update({ ...block, url: url || undefined })} />
              <Field label="Described as" value={block.alt ?? ""} onChange={(alt) => update({ ...block, alt: alt || undefined })} />
            </Settings>
          ) : null}
        </>
      );

    case "table":
      return (
        <Settings>
          <Field
            label="Rows from"
            value={block.source}
            mono
            onChange={(source) => update({ ...block, source })}
          />
        </Settings>
      );

    default:
      return null;
  }
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={`${styles.toolbarSelect} w-auto`} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([option, text]) => (
          <SelectItem key={option} value={option}>
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={styles.toolbarToggle}>
      <span>{label}</span>
      <Switch checked={on} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function Settings({ children }: { children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={editor.toolbarButton} aria-label="Settings">
          <SlidersHorizontal aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className={styles.settings}>{children}</div>
      </PopoverContent>
    </Popover>
  );
}

function Field({
  label,
  value,
  mono,
  onChange,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onChange: (value: string) => void;
}) {
  const id = `block-setting-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <div className={styles.control}>
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        className={mono ? styles.mono : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
