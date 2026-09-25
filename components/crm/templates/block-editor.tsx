"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";

import { Switch } from "@corelithzw/react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ChevronDown,
  EditSquare,
  FileText,
  Grid3x3,
  ListBullets,
  Minus,
  NotePencil,
  Plus,
  Policy,
  ReceiptLong,
  Square,
  TableRows,
  Trash2,
  X,
} from "@/lib/icons";
import {
  BLOCKS_FOR_KIND,
  BLOCK_LABELS,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  emptyBlock,
  type Block,
  type BlockType,
  type FieldType,
  type TemplateKind,
} from "@/lib/crm/blocks";
import { starterBlocks, startersForKind } from "@/lib/crm/starter-templates";

import styles from "./builder.module.css";
import { VariablePicker } from "./variable-picker";

/**
 * The form builder — `TemplateBuilder.dc.html`.
 *
 * The block list, the page, the inspector. What changed from the editor this
 * replaces is where a block's settings live: they used to be inline, so the
 * canvas was a stack of forms and you could not see the document you were
 * building. Now the canvas draws the block as the reader will meet it and the
 * inspector edits whichever one is selected — which is also why a block on the
 * canvas is a `<button>`: selecting it is the only thing clicking it does.
 *
 * The block and field vocabulary is `lib/crm/blocks.ts` and nothing here
 * invents a kind: `BLOCKS_FOR_KIND` decides what the palette offers, so a
 * quote never gets a signature question and an export never gets a logo.
 */

/**
 * A glyph per block type, from the repo's own icon layer.
 *
 * `lib/icons.tsx` is a hand-maintained alias list and is not this agent's file
 * to extend, so each of these is the nearest existing export rather than the
 * exact glyph the board drew. Meaning survives; three of the twelve are a
 * different picture of the same idea.
 */
const BLOCK_ICONS: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  heading: FileText,
  text: ListBullets,
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

/** The six-dot grip the board draws to the left of every block. */
function Grip({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden="true">
      <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
        <circle cx="2.5" cy="3" r="1.3" />
        <circle cx="7.5" cy="3" r="1.3" />
        <circle cx="2.5" cy="8" r="1.3" />
        <circle cx="7.5" cy="8" r="1.3" />
        <circle cx="2.5" cy="13" r="1.3" />
        <circle cx="7.5" cy="13" r="1.3" />
      </svg>
    </span>
  );
}

function ids(prefix: string): string {
  // Not a uuid: block ids double as field keys, and a key somebody might have
  // to read in an export should be short. Uniqueness within one template is
  // all that is required.
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * `Raised by {{employee.fullName}}` drawn as the board draws it: the prose as
 * prose and each variable as a mono chip, so a token that will be filled in
 * does not read as text somebody typed.
 */
function withTokens(text: string): ReactNode {
  const parts = text.split(/(\{\{[^}]*\}\})/g);
  return parts.map((part, index) => {
    const match = /^\{\{\s*([^}]*?)\s*\}\}$/.exec(part);
    return match ? (
      <span key={index} className={styles.token}>
        {match[1]}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    );
  });
}

/** The drawing of a control, per answer type. Never a live control. */
function ControlPreview({ block }: { block: Extract<Block, { type: "field" }> }) {
  const mono = block.fieldType === "date" || block.fieldType === "number";

  if (block.fieldType === "longText") {
    return (
      <span className={styles.control}>
        <span className={styles.controlArea}>
          {block.placeholder || " "}
        </span>
      </span>
    );
  }

  if (block.fieldType === "select" || block.fieldType === "multiSelect") {
    return (
      <span className={styles.control}>
        <span className={styles.controlBox}>
          {(block.options ?? [])[0] ?? ""}
          <ChevronDown className={styles.controlChevron} aria-hidden="true" />
        </span>
      </span>
    );
  }

  if (block.fieldType === "checkbox") {
    return (
      <span className={styles.control}>
        <span className={`${styles.controlBox} ${styles.controlCheck}`} />
      </span>
    );
  }

  return (
    <span className={styles.control}>
      <span className={`${styles.controlBox}${mono ? ` ${styles.controlMono}` : ""}`}>
        {block.placeholder ? (
          <span className={styles.blockPlaceholder}>{block.placeholder}</span>
        ) : (
          " "
        )}
      </span>
    </span>
  );
}

/** One block, as the reader will meet it. */
function BlockPreview({ block }: { block: Block }) {
  switch (block.type) {
    case "heading":
      return (
        <span className={styles.blockHeading}>
          {block.text || <span className={styles.blockPlaceholder}>Heading</span>}
        </span>
      );

    case "text":
      return (
        <span className={styles.blockText}>
          {block.text ? (
            withTokens(block.text)
          ) : (
            <span className={styles.blockPlaceholder}>Text</span>
          )}
        </span>
      );

    case "terms":
      return (
        <>
          <span className={styles.blockText}>
            {block.text ? (
              withTokens(block.text)
            ) : (
              <span className={styles.blockPlaceholder}>Terms and conditions</span>
            )}
          </span>
          <span className={styles.hint}>Terms</span>
        </>
      );

    case "field":
      return (
        <>
          <span className={styles.blockLabel}>
            {block.label || <span className={styles.blockPlaceholder}>Question</span>}
            {block.required ? <span className={styles.required}> *</span> : null}
          </span>
          <ControlPreview block={block} />
          <span className={styles.hint}>{FIELD_TYPE_LABELS[block.fieldType]}</span>
        </>
      );

    case "divider":
      return <span className={styles.controlRule} />;

    case "spacer":
      return (
        <span
          className={styles.hint}
          style={{ height: block.size === "lg" ? 32 : block.size === "sm" ? 8 : 20 }}
        >
          {`Space · ${block.size}`}
        </span>
      );

    case "image":
      return (
        <>
          <span className={styles.controlSign} />
          <span className={styles.hint}>
            {block.source === "branding.logo" ? "Your logo" : block.url || "Image"}
          </span>
        </>
      );

    case "signature":
      return (
        <>
          <span className={styles.blockLabel}>{block.label || "Signed"}</span>
          <span className={styles.controlSign} />
        </>
      );

    case "table":
      return (
        <>
          <span className={styles.blockLabel}>
            {block.columns.map((column) => column.label).join("  ·  ") || "Table"}
          </span>
          <span className={`${styles.controlRule} ${styles.ruleGap}`} />
          <span className={styles.hint}>{block.source || "Table"}</span>
        </>
      );

    case "lineItems":
      return (
        <>
          <span className={styles.blockLabel}>Line items</span>
          <span className={`${styles.controlRule} ${styles.ruleGap}`} />
          <span className={styles.hint}>{block.showTax ? "With tax" : "No tax"}</span>
        </>
      );

    case "totals":
      return (
        <>
          <span className={styles.blockLabel}>Totals</span>
          <span className={`${styles.controlRule} ${styles.ruleGap}`} />
          <span className={styles.hint}>{block.showTax ? "With tax" : "No tax"}</span>
        </>
      );

    case "columns":
      return (
        <>
          <span className={styles.blockLabel}>Side by side</span>
          <span className={styles.hint}>
            {`${block.left.length} left · ${block.right.length} right`}
          </span>
        </>
      );
  }
}

/** The dashed + between two blocks. */
function BlockInsert({
  kind,
  onInsert,
  label,
}: {
  kind: TemplateKind;
  onInsert: (type: BlockType) => void;
  label: string;
}) {
  return (
    <div className={styles.insert}>
      <span aria-hidden="true" className={styles.insertLine} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={label} className={styles.insertButton}>
            <Plus aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
          {BLOCKS_FOR_KIND[kind].map((type) => (
            <DropdownMenuItem key={type} onSelect={() => onInsert(type)}>
              {BLOCK_LABELS[type]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Everything the selected block has to set, and nothing it has not. */
function Inspector({
  block,
  onChange,
  onRemove,
}: {
  block: Block;
  onChange: (next: Block) => void;
  onRemove: () => void;
}) {
  const Icon = BLOCK_ICONS[block.type];

  function patch(next: Record<string, unknown>) {
    onChange({ ...block, ...next } as Block);
  }

  const choices =
    block.type === "field" &&
    (block.fieldType === "select" || block.fieldType === "multiSelect")
      ? (block.options ?? [])
      : null;

  return (
    <>
      <div className={styles.inspectorHead}>
        <span className={styles.inspectorTile}>
          <Icon aria-hidden="true" />
        </span>
        <h2 className={styles.inspectorTitle}>{BLOCK_LABELS[block.type]}</h2>
        <button
          type="button"
          aria-label="Delete this block"
          className={styles.inspectorDelete}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      {block.type === "field" ? (
        <>
          <div className={styles.field}>
            <label htmlFor="inspector-label">Label</label>
            <Input
              id="inspector-label"
              value={block.label}
              onChange={(event) => patch({ label: event.target.value })}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="inspector-answer">Answer</label>
            <Select
              value={block.fieldType}
              onValueChange={(value) => patch({ fieldType: value as FieldType })}
            >
              <SelectTrigger id="inspector-answer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {FIELD_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={styles.switchRow}>
            <span className={styles.switchLabel}>Required</span>
            <Switch
              checked={block.required}
              onChange={(event) => patch({ required: event.target.checked })}
              aria-label="Required"
            />
          </div>

          {choices ? (
            <>
              <h3 className={styles.group}>Choices</h3>
              <ul className={styles.choices}>
                {choices.map((choice, index) => (
                  <li key={index} className={styles.choiceRow}>
                    <Grip className={styles.choiceGrip} />
                    <Input
                      value={choice}
                      aria-label={`Choice ${index + 1}`}
                      onChange={(event) =>
                        patch({
                          options: choices.map((existing, position) =>
                            position === index ? event.target.value : existing,
                          ),
                        })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Remove choice ${index + 1}`}
                      className={styles.choiceRemove}
                      onClick={() =>
                        patch({
                          options: choices.filter((_existing, position) => position !== index),
                        })
                      }
                    >
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={styles.btn}
                onClick={() => patch({ options: [...choices, ""] })}
              >
                <Plus aria-hidden="true" />
                Add a choice
              </button>
            </>
          ) : null}

          <h3 className={styles.group}>Key</h3>
          <div className={`${styles.field} ${styles.mono}`}>
            {/* Read-only: renaming a key orphans every answer already collected
                under the old one. */}
            <label htmlFor="inspector-key" className="sr-only">
              Key
            </label>
            <Input id="inspector-key" value={block.key} readOnly />
          </div>
        </>
      ) : null}

      {block.type === "heading" ? (
        <>
          <div className={styles.field}>
            <label htmlFor="inspector-heading">Text</label>
            <Input
              id="inspector-heading"
              value={block.text}
              onChange={(event) => patch({ text: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="inspector-level">Size</label>
            <Select
              value={String(block.level)}
              onValueChange={(value) => patch({ level: Number(value) })}
            >
              <SelectTrigger id="inspector-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Large</SelectItem>
                <SelectItem value="2">Medium</SelectItem>
                <SelectItem value="3">Small</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}

      {block.type === "text" || block.type === "terms" ? (
        <div className={styles.field}>
          <label htmlFor="inspector-text">{BLOCK_LABELS[block.type]}</label>
          <Textarea
            id="inspector-text"
            rows={block.type === "terms" ? 8 : 5}
            value={block.text}
            onChange={(event) => patch({ text: event.target.value })}
          />
          <VariablePicker onPick={(token) => patch({ text: `${block.text}${token}` })} />
        </div>
      ) : null}

      {block.type === "spacer" ? (
        <div className={styles.field}>
          <label htmlFor="inspector-size">Size</label>
          <Select value={block.size} onValueChange={(value) => patch({ size: value })}>
            <SelectTrigger id="inspector-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {block.type === "image" ? (
        <>
          <div className={styles.field}>
            <label htmlFor="inspector-source">Source</label>
            <Select value={block.source} onValueChange={(value) => patch({ source: value })}>
              <SelectTrigger id="inspector-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="branding.logo">Your company logo</SelectItem>
                <SelectItem value="url">A specific image</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {block.source === "url" ? (
            <div className={styles.field}>
              <label htmlFor="inspector-url">Address</label>
              <Input
                id="inspector-url"
                value={block.url ?? ""}
                onChange={(event) => patch({ url: event.target.value })}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {block.type === "table" ? (
        <>
          <div className={styles.field}>
            <label htmlFor="inspector-rows">Rows</label>
            <Input
              id="inspector-rows"
              value={block.source}
              onChange={(event) => patch({ source: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="inspector-columns">Columns</label>
            <Textarea
              id="inspector-columns"
              rows={5}
              value={block.columns.map((column) => `${column.key}: ${column.label}`).join("\n")}
              onChange={(event) =>
                patch({
                  columns: event.target.value
                    .split("\n")
                    .map((line) => {
                      const [key, ...rest] = line.split(":");
                      return { key: key.trim(), label: rest.join(":").trim() || key.trim() };
                    })
                    .filter((column) => column.key),
                })
              }
            />
          </div>
        </>
      ) : null}

      {block.type === "lineItems" || block.type === "totals" ? (
        <>
          <div className={styles.switchRow}>
            <span className={styles.switchLabel}>Tax</span>
            <Switch
              checked={block.showTax}
              onChange={(event) => patch({ showTax: event.target.checked })}
              aria-label="Tax"
            />
          </div>
          {block.type === "lineItems" ? (
            <div className={styles.switchRow}>
              <span className={styles.switchLabel}>Discount</span>
              <Switch
                checked={block.showDiscount}
                onChange={(event) => patch({ showDiscount: event.target.checked })}
                aria-label="Discount"
              />
            </div>
          ) : (
            <div className={styles.switchRow}>
              <span className={styles.switchLabel}>Paid</span>
              <Switch
                checked={block.showPaid}
                onChange={(event) => patch({ showPaid: event.target.checked })}
                aria-label="Paid"
              />
            </div>
          )}
        </>
      ) : null}

      {block.type === "signature" ? (
        <>
          <div className={styles.field}>
            <label htmlFor="inspector-sign-label">Label</label>
            <Input
              id="inspector-sign-label"
              value={block.label}
              onChange={(event) => patch({ label: event.target.value })}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="inspector-party">Who signs</label>
            <Select value={block.party} onValueChange={(value) => patch({ party: value })}>
              <SelectTrigger id="inspector-party">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="customer">The customer</SelectItem>
                <SelectItem value="us">Us</SelectItem>
                <SelectItem value="both">Both</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      ) : null}

      {block.type === "divider" || block.type === "columns" ? (
        <p className={styles.empty}>Nothing to set</p>
      ) : null}
    </>
  );
}

export function BlockEditor({
  kind,
  blocks,
  onChange,
  banner,
  properties,
}: {
  kind: TemplateKind;
  blocks: Block[];
  onChange: (next: Block[]) => void;
  /** Drawn above the page — what is stopping this template being published. */
  banner?: ReactNode;
  /**
   * What the inspector shows when no block is selected.
   *
   * The template's own properties go here rather than into a band above the
   * page: they are the same kind of thing as a block's settings — the
   * properties of whatever is selected — and the board has exactly one panel
   * for that.
   */
  properties?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedIndex = blocks.findIndex((block) => block.id === selectedId);
  const selected = selectedIndex >= 0 ? blocks[selectedIndex] : null;

  const starters = useMemo(() => startersForKind(kind), [kind]);

  function insertAt(index: number, type: BlockType) {
    const block = emptyBlock(type, ids(type));
    const next = [...blocks];
    next.splice(index, 0, block);
    onChange(next);
    setSelectedId(block.id);
  }

  function replaceAt(index: number, block: Block) {
    onChange(blocks.map((existing, position) => (position === index ? block : existing)));
  }

  function removeAt(index: number) {
    onChange(blocks.filter((_block, position) => position !== index));
    setSelectedId(null);
  }

  return (
    <div className={styles.body}>
      <div className={styles.palette}>
        <h2 className={styles.paletteTitle}>Blocks</h2>
        {BLOCKS_FOR_KIND[kind].map((type) => {
          const Icon = BLOCK_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              className={styles.paletteItem}
              onClick={() =>
                insertAt(selectedIndex >= 0 ? selectedIndex + 1 : blocks.length, type)
              }
            >
              <Icon aria-hidden="true" />
              <span className={styles.paletteLabel}>{BLOCK_LABELS[type]}</span>
            </button>
          );
        })}
        {/* Which list the palette came from, stated in the vocabulary the code
            uses, so a missing block is traceable to the kind rather than to a
            bug. The braces are typography, not an icon: the whole line is
            already mono, and `lib/icons.tsx` has no `{}` glyph to add one
            from — extending that file is another agent's. */}
        <p className={styles.paletteFoot}>
          <span className={styles.paletteFootMark} aria-hidden="true">
            {"{}"}
          </span>
          {`BLOCKS_FOR_KIND.${kind}`}
        </p>
      </div>

      <div className={styles.canvas}>
        {banner ? <div className={styles.bannerWrap}>{banner}</div> : null}
        <div className={styles.sheet}>
          <BlockInsert
            kind={kind}
            onInsert={(type) => insertAt(0, type)}
            label="Add a block at the top"
          />

          {blocks.map((block, index) => (
            <Fragment key={block.id}>
              <button
                type="button"
                className={styles.block}
                aria-current={block.id === selectedId ? "true" : undefined}
                aria-label={`${BLOCK_LABELS[block.type]} block`}
                onClick={() => setSelectedId(block.id)}
              >
                {block.id === selectedId ? (
                  <span className={styles.blockTag}>{BLOCK_LABELS[block.type]}</span>
                ) : null}
                <Grip className={styles.grip} />
                <BlockPreview block={block} />
              </button>
              <BlockInsert
                kind={kind}
                onInsert={(type) => insertAt(index + 1, type)}
                label={`Add a block after ${BLOCK_LABELS[block.type].toLowerCase()}`}
              />
            </Fragment>
          ))}

          {blocks.length === 0 ? (
            <div className={styles.blank}>
              <p className={styles.empty}>Nothing on the page yet</p>
              {starters.length > 0 ? (
                <div className={styles.starters}>
                  {starters.map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      className={styles.btn}
                      onClick={() => onChange(starterBlocks(starter, ""))}
                    >
                      {starter.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className={styles.inspector}>
        {selected ? (
          <Inspector
            block={selected}
            onChange={(next) => replaceAt(selectedIndex, next)}
            onRemove={() => removeAt(selectedIndex)}
          />
        ) : (
          (properties ?? <p className={styles.empty}>Pick a block</p>)
        )}
      </div>
    </div>
  );
}
