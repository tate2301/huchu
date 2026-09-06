"use client";

import { useState } from "react";

import { Button } from "@corelithzw/ui/components/button";
import { ResponsivePopover } from "@corelithzw/ui/components/responsive-popover";
import { Pencil, X } from "@corelithzw/ui/lib/icons";

import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { ATTRIBUTE_ROW } from "@corelithzw/module-records/components/record-attributes";
import { cn } from "@corelithzw/ui/lib/utils";
import { RecordPicker, type PickableType, type PickedRecord } from "./record-picker";

/**
 * A property that points at another record, and can be repointed.
 *
 * The list-shaped relationships — people on a deal, people at a company —
 * have their own tabs. This is the other kind: the single link a record
 * carries as a property, like the company a site belongs to or the person to
 * ring before turning up. Those were drawn as links and nothing else, so the
 * only way to correct one was to have got it right at creation.
 *
 * Reads as the link it is, because the common case is following the reference,
 * not changing it — so the link keeps the whole row and the way to repoint it
 * is a pencil at the end. It used to be a "Change" button spelled out in
 * words, which cost about 55px of a value column that is only 200px wide on a
 * phone: on a lead, "Chitungwiza Medical Centre" and "Chang…" both ran off the
 * right edge of the screen, and neither could be read.
 *
 * With nothing linked there is no link to protect, so the placeholder is the
 * trigger — the same rule the other property editors follow.
 */
export function RelationAttribute({
  value,
  href,
  types,
  placeholder = "Not set",
  searchPlaceholder,
  onPick,
  onClear,
}: {
  /** The current record's label, or null when nothing is linked. */
  value: string | null;
  href: string | null;
  types: readonly PickableType[];
  placeholder?: string;
  searchPlaceholder?: string;
  onPick: (record: PickedRecord) => void;
  onClear?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PickedRecord | null>(null);

  const picker = (
    <>
      <RecordPicker
        value={draft}
        onChange={(next) => {
          setDraft(next);
          if (next) {
            onPick(next);
            setOpen(false);
            setDraft(null);
          }
        }}
        types={types}
        placeholder={searchPlaceholder ?? "Search records"}
      />
      {value && onClear ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-1.5 text-[var(--text-muted)]"
          onClick={() => {
            onClear();
            setOpen(false);
          }}
        >
          <X className="size-3.5" />
          Clear it
        </Button>
      ) : null}
    </>
  );

  // A sheet on a phone, a popover on a desktop. This was a bare 320px Popover,
  // which at 390px is a panel almost as wide as the screen with nothing to
  // anchor to — the case `ResponsivePopover` exists for.
  const editor = (
    <ResponsivePopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft(null);
      }}
      title={value ? "Change link" : "Set link"}
      align="start"
      className="w-80 p-2"
      contentClassName="space-y-2"
      trigger={
        value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Change link"
            className="size-7 shrink-0 p-0 text-[var(--text-muted)]"
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <button
            type="button"
            className={cn(
              "-mx-1.5 flex w-full min-w-0 items-center rounded-[var(--radius-sm)] px-1.5 text-left text-[var(--text-muted)] hover:bg-[var(--surface-subtle)]",
              ATTRIBUTE_ROW,
            )}
          >
            {placeholder}
          </button>
        )
      }
    >
      {picker}
    </ResponsivePopover>
  );

  if (!value) return editor;

  return (
    // The same line box the rest of the property list uses, so a linked value
    // sits on the label's baseline rather than a few pixels above it.
    <span className={cn("flex min-w-0 items-center gap-1", ATTRIBUTE_ROW)}>
      <EntityLink href={href} className="min-w-0 truncate">
        {value}
      </EntityLink>
      {editor}
    </span>
  );
}
