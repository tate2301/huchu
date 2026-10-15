"use client";

import * as React from "react";

/**
 * The blocks on a builder's page and which one is selected, with the edits
 * every builder makes the same way: add after the selection (or at the end),
 * change, duplicate, delete, move. Blocks are known by their own `id`.
 */
export function useBlockList<T extends { id: string }>({
  blocks,
  onChange,
  create,
  duplicate,
  initial = null,
}: {
  blocks: readonly T[];
  onChange: (blocks: T[]) => void;
  create: (kindId: string, existing: readonly T[]) => T;
  duplicate: (block: T, existing: readonly T[]) => T;
  /** The block selected when the builder opens. */
  initial?: string | null;
}) {
  // Until a person picks, the block the builder opens on (which may arrive with the page's data).
  const [picked, setSelectedId] = React.useState<string | null | undefined>(undefined);
  const selectedId = picked === undefined ? initial : picked;
  const index = selectedId ? blocks.findIndex((block) => block.id === selectedId) : -1;
  const selected = index >= 0 ? blocks[index]! : null;

  const insertAt = (block: T, at: number) => {
    onChange([...blocks.slice(0, at), block, ...blocks.slice(at)]);
    setSelectedId(block.id);
  };

  return {
    selected,
    selectedId: selected ? selected.id : null,
    select: setSelectedId,
    add: (kindId: string) => insertAt(create(kindId, blocks), index >= 0 ? index + 1 : blocks.length),
    /** Put a block that was made elsewhere (Vane's, once kept) on the page. */
    insert: (block: T) => insertAt(block, index >= 0 ? index + 1 : blocks.length),
    update: (next: T) => onChange(blocks.map((block) => (block.id === next.id ? next : block))),
    duplicate: (block: T) => {
      const at = blocks.findIndex((candidate) => candidate.id === block.id);
      insertAt(duplicate(block, blocks), at + 1);
    },
    remove: (block: T) => {
      const at = blocks.findIndex((candidate) => candidate.id === block.id);
      const rest = blocks.filter((candidate) => candidate.id !== block.id);
      onChange(rest);
      setSelectedId(rest[at]?.id ?? rest[at - 1]?.id ?? null);
    },
    move: (from: number, to: number) => {
      const next = [...blocks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      onChange(next);
    },
  };
}
