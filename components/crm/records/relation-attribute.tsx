"use client";

import { useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowRight, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { RecordPicker, type PickableType, type PickedRecord } from "./record-picker";

/**
 * A property that points at another record, and can be repointed.
 *
 * The list-shaped relationships — people on a deal, people at a company —
 * have their own tabs. This is the other kind: the single link a record
 * carries as a property, like the company a site belongs to or the person to
 * ring before turning up.
 *
 * Pressing the value opens the picker. There is no "Change" button beside it:
 * a property you edit through a second control is a property that reads as
 * somebody else's to edit, and the whole argument for putting properties at
 * the top of a record is that the person reading them is the person who keeps
 * them true. Every other property on the page works this way now, and a
 * relation behaving differently is the one that teaches people to hunt.
 *
 * Following the reference lives inside the popover — "Open …" as its first
 * entry — rather than as a competing target in the row. It is the rarer of
 * the two intentions on a property list, and it is still one press away.
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

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setDraft(null);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "-mx-1.5 flex w-full min-w-0 items-center rounded-[var(--radius-sm)] px-1.5 py-0.5 text-left text-sm hover:bg-[var(--surface-subtle)]",
            !value && "text-[var(--text-muted)]",
          )}
        >
          <span className="min-w-0 truncate">{value ?? placeholder}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        collisionPadding={12}
        className="w-[min(20rem,calc(100vw-2rem))] space-y-2 p-2"
      >
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

        {value && href ? (
          <Button
            type="button"
            variant="ghost"
            asChild
            className="w-full justify-start"
            onClick={() => setOpen(false)}
          >
            <Link href={href}>
              Open {value}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        ) : null}

        {value && onClear ? (
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start text-[var(--text-muted)]"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
          >
            <X className="size-3.5" aria-hidden="true" />
            Clear it
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
