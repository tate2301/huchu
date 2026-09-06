"use client";

import { useState } from "react";

import { Switch } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import { Input } from "@corelithzw/ui/components/input";
import { Textarea } from "@corelithzw/ui/components/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import {
  ArrowDownward,
  ArrowUpward,
  DotsThree,
  Plus,
  Trash2,
} from "@corelithzw/ui/lib/icons";
import {
  BLOCKS_FOR_KIND,
  BLOCK_LABELS,
  FIELD_TYPES,
  FIELD_TYPE_LABELS,
  emptyBlock,
  type Block,
  type BlockType,
  type TemplateKind,
} from "@/lib/crm/blocks";
import { starterBlocks, startersForKind } from "@/lib/crm/starter-templates";
import { cn } from "@corelithzw/ui/lib/utils";

import { VariablePicker } from "./variable-picker";

/**
 * A Notion-style block editor, cut down to what a document needs.
 *
 * The Notion things worth keeping: everything is a block, blocks are added
 * between blocks rather than at the end, each block reveals its controls on
 * hover instead of wearing them, and the page is the document rather than a
 * form that produces one.
 *
 * The Notion things left out: slash commands over a hundred block types,
 * arbitrary nesting, and inline databases. Somebody laying out an invoice
 * wants eleven blocks that all print correctly, not a general-purpose
 * document tool they have to be trained on.
 */

function ids(prefix: string): string {
  // Not a uuid: block ids double as field keys, and a key somebody might have
  // to read in an export should be short. Uniqueness within one template is
  // all that is required.
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function BlockInsert({
  kind,
  onInsert,
  label = "Add a block",
}: {
  kind: TemplateKind;
  onInsert: (type: BlockType) => void;
  label?: string;
}) {
  return (
    <div className="group/insert relative flex h-4 items-center justify-center">
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px bg-[var(--border-subtle)] opacity-0 transition-opacity group-hover/insert:opacity-100 pointer-coarse:opacity-100"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="relative z-10 flex size-5 items-center justify-center rounded-full border border-dashed border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] opacity-0 transition-opacity hover:border-[var(--brand)] hover:text-[var(--text)] focus-visible:opacity-100 group-hover/insert:opacity-100 pointer-coarse:opacity-100"
          >
            <Plus className="size-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="max-h-72 overflow-y-auto">
          {BLOCKS_FOR_KIND[kind].map((type) => (
            <DropdownMenuItem key={type} onClick={() => onInsert(type)}>
              {BLOCK_LABELS[type]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function FieldEditor({
  block,
  onChange,
}: {
  block: Extract<Block, { type: "field" }>;
  onChange: (next: Partial<Extract<Block, { type: "field" }>>) => void;
}) {
  const needsOptions = block.fieldType === "select" || block.fieldType === "multiSelect";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Input
          className="min-w-48 flex-1"
          value={block.label}
          placeholder="What are you asking?"
          aria-label="Question"
          onChange={(event) => onChange({ label: event.target.value })}
        />
        <Select
          value={block.fieldType}
          onValueChange={(value) =>
            onChange({ fieldType: value as (typeof FIELD_TYPES)[number] })
          }
        >
          <SelectTrigger className="w-full max-w-40" aria-label="Answer type">
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

      {needsOptions ? (
        <Textarea
          rows={3}
          value={(block.options ?? []).join("\n")}
          placeholder={"One option per line"}
          aria-label="Options"
          onChange={(event) =>
            onChange({
              options: event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Input
          className="min-w-40 flex-1"
          value={block.help ?? ""}
          placeholder="Help text (optional)"
          aria-label="Help text"
          onChange={(event) => onChange({ help: event.target.value })}
        />
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={block.required}
            onChange={(event) => onChange({ required: event.target.checked })}
            aria-label="Required"
          />
          Required
        </label>
      </div>

      <p className="text-sm text-[var(--text-subtle)]">
        {/* The key is shown rather than editable: renaming it orphans every
            answer already collected under the old one. */}
        Answers save as <span className="font-mono">{block.key}</span>
      </p>
    </div>
  );
}

function BlockEditorRow({
  block,
  onChange,
  onRemove,
  onMove,
  isFirst,
  isLast,
}: {
  block: Block;
  onChange: (next: Block) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  function patch(next: Record<string, unknown>) {
    onChange({ ...block, ...next } as Block);
  }

  return (
    <div className="group relative rounded-[var(--radius-md)] px-2 py-2 transition-colors hover:bg-[var(--surface-subtle)]">
      <div className="absolute right-1 top-1 flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Move up"
          disabled={isFirst}
          onClick={() => onMove(-1)}
        >
          <ArrowUpward className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label="Move down"
          disabled={isLast}
          onClick={() => onMove(1)}
        >
          <ArrowDownward className="size-4" aria-hidden="true" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label="Block options">
              <DotsThree aria-hidden="true" />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRemove}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete block
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="mb-1 text-sm text-[var(--text-subtle)]">{BLOCK_LABELS[block.type]}</p>

      {block.type === "heading" ? (
        <div className="flex gap-2">
          <Input
            className="flex-1"
            value={block.text}
            placeholder="Heading"
            aria-label="Heading text"
            onChange={(event) => patch({ text: event.target.value })}
          />
          <Select
            value={String(block.level)}
            onValueChange={(value) => patch({ level: Number(value) })}
          >
            <SelectTrigger className="w-24 shrink-0" aria-label="Heading level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Large</SelectItem>
              <SelectItem value="2">Medium</SelectItem>
              <SelectItem value="3">Small</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {block.type === "text" || block.type === "terms" ? (
        <div className="space-y-1.5">
          <Textarea
            rows={block.type === "terms" ? 5 : 3}
            value={block.text}
            placeholder={
              block.type === "terms"
                ? "Terms and conditions"
                : "Text. Use {{variables}} to fill in details."
            }
            aria-label={BLOCK_LABELS[block.type]}
            onChange={(event) => patch({ text: event.target.value })}
          />
          <VariablePicker onPick={(token) => patch({ text: `${block.text}${token}` })} />
        </div>
      ) : null}

      {block.type === "field" ? (
        <FieldEditor
          block={block}
          onChange={(next) => onChange({ ...block, ...next })}
        />
      ) : null}

      {block.type === "spacer" ? (
        <Select value={block.size} onValueChange={(value) => patch({ size: value })}>
          <SelectTrigger className="w-full max-w-32" aria-label="Space size">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sm">Small</SelectItem>
            <SelectItem value="md">Medium</SelectItem>
            <SelectItem value="lg">Large</SelectItem>
          </SelectContent>
        </Select>
      ) : null}

      {block.type === "image" ? (
        <div className="space-y-2">
          <Select value={block.source} onValueChange={(value) => patch({ source: value })}>
            <SelectTrigger className="w-full max-w-56" aria-label="Image source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="branding.logo">Your company logo</SelectItem>
              <SelectItem value="url">A specific image</SelectItem>
            </SelectContent>
          </Select>
          {block.source === "url" ? (
            <Input
              value={block.url ?? ""}
              placeholder="https://…"
              aria-label="Image URL"
              onChange={(event) => patch({ url: event.target.value })}
            />
          ) : null}
        </div>
      ) : null}

      {block.type === "table" ? (
        <div className="space-y-2">
          <Input
            value={block.source}
            placeholder="Which list fills the rows, e.g. lines"
            aria-label="Row source"
            onChange={(event) => patch({ source: event.target.value })}
          />
          <Textarea
            rows={3}
            value={block.columns.map((column) => `${column.key}: ${column.label}`).join("\n")}
            placeholder={"key: Column heading\nqty: Quantity"}
            aria-label="Columns"
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
      ) : null}

      {block.type === "lineItems" || block.type === "totals" ? (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={block.showTax}
              onChange={(event) => patch({ showTax: event.target.checked })}
              aria-label="Show tax"
            />
            Show tax
          </label>
          {block.type === "lineItems" ? (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={block.showDiscount}
                onChange={(event) => patch({ showDiscount: event.target.checked })}
                aria-label="Show discount"
              />
              Show discount
            </label>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={block.showPaid}
                onChange={(event) => patch({ showPaid: event.target.checked })}
                aria-label="Show what has been paid"
              />
              Show paid
            </label>
          )}
        </div>
      ) : null}

      {block.type === "signature" ? (
        <div className="flex flex-wrap gap-2">
          <Input
            className="min-w-40 flex-1"
            value={block.label}
            placeholder="Signature line label"
            aria-label="Signature label"
            onChange={(event) => patch({ label: event.target.value })}
          />
          <Select value={block.party} onValueChange={(value) => patch({ party: value })}>
            <SelectTrigger className="w-full max-w-40 sm:w-40" aria-label="Who signs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="customer">The customer</SelectItem>
              <SelectItem value="us">Us</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {block.type === "divider" ? (
        <hr className="border-[var(--border-subtle)]" />
      ) : null}

      {block.type === "columns" ? (
        <p className="text-sm text-[var(--text-muted)]">
          Two columns. Add blocks to each side below.
        </p>
      ) : null}
    </div>
  );
}

export function BlockEditor({
  kind,
  blocks,
  onChange,
}: {
  kind: TemplateKind;
  blocks: Block[];
  onChange: (next: Block[]) => void;
}) {
  const [, forceKey] = useState(0);

  function insertAt(index: number, type: BlockType) {
    const next = [...blocks];
    next.splice(index, 0, emptyBlock(type, ids(type)));
    onChange(next);
    forceKey((value) => value + 1);
  }

  function replaceAt(index: number, block: Block) {
    onChange(blocks.map((existing, position) => (position === index ? block : existing)));
  }

  function removeAt(index: number) {
    onChange(blocks.filter((_block, position) => position !== index));
  }

  function moveAt(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className={cn("space-y-0")}>
      <BlockInsert kind={kind} onInsert={(type) => insertAt(0, type)} label="Add a block at the top" />

      {blocks.map((block, index) => (
        <div key={block.id}>
          <BlockEditorRow
            block={block}
            isFirst={index === 0}
            isLast={index === blocks.length - 1}
            onChange={(next) => replaceAt(index, next)}
            onRemove={() => removeAt(index)}
            onMove={(direction) => moveAt(index, direction)}
          />
          <BlockInsert kind={kind} onInsert={(type) => insertAt(index + 1, type)} />
        </div>
      ))}

      {blocks.length === 0 ? (
        <div className="py-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            Empty. Use the + above to add the first block.
          </p>

          {/* Or don't start from nothing. Somebody who reached a blank
              template did not necessarily choose one — they may have picked
              Blank in the dialog and then discovered what that means. */}
          {startersForKind(kind).length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium text-[var(--text-strong)]">Or start from</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                {startersForKind(kind).map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => onChange(starterBlocks(starter, ""))}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-sm hover:border-[var(--interactive-primary)] hover:bg-[var(--surface-hover)]"
                  >
                    <span aria-hidden="true" className="mr-1.5">
                      {starter.emoji}
                    </span>
                    {starter.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
