"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResponsivePopover } from "@/components/ui/responsive-popover";
import { Check, ChevronDown, ChevronRight, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * A record's properties, above its tabs, the way Notion does them.
 *
 * The facts that identify a record — who owns it, what it is worth, when it
 * closes — were living in the right rail, which is where a reader looks last
 * and a phone does not look at all. Notion's answer is right: properties
 * belong at the top of the page, in a list you read on the way in, because
 * that is the only place they get maintained.
 *
 * Editable rows write through immediately rather than into a form with a save
 * button. A property somebody changed and forgot to save is worse than one
 * they never changed, and the record page has no save button for anything
 * else either.
 */

/**
 * The line box every half of a property row sits in.
 *
 * The label carried `py-1`, the value control carried `py-1` *and* `min-h-9`,
 * and the icon carried a `mt-0.5` picked to look right against neither. So the
 * three parts of a row each started at a different height and the row read as
 * crooked — most visible where a label wrapped to two lines and its value
 * floated somewhere near the middle.
 *
 * One constant, used by the label, by all three value renderers and by
 * `RelationAttribute` next door, so they cannot drift apart again. The padding
 * is what makes the touch target on a phone (20px line + 16px = 36px); it is
 * not a `min-height`, because a min-height centres text in a box the label does
 * not share and puts the two sides back out of line.
 */
export const ATTRIBUTE_ROW = "py-2 text-sm leading-5 sm:py-1";

export type RecordAttributeOption = {
  value: string;
  label: string;
  /** A dot or avatar shown beside the label in the list. */
  leading?: ReactNode;
};

export type RecordAttribute = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /**
   * For a value the page renders itself — a link, a chip, an avatar. A row
   * that *only* has this is read-only; pair it with `options` or `onCommit`
   * and it becomes the closed state of an editor instead.
   */
  display?: ReactNode;
  /** For a plain value somebody can retype in place. */
  value?: string | null;
  /**
   * What the closed row reads as, when the stored value is not what a reader
   * wants to see: "USD 9,800" over a bare `9800`. Editing still opens on
   * `value`, so what you type is what gets stored.
   */
  formatted?: string | null;
  onCommit?: (value: string) => void;
  /**
   * The row is a choice rather than free text: an owner, a status, a stage,
   * anything whose value has to be one of a known set. `onCommit` receives the
   * chosen option's `value`, or an empty string when it is cleared.
   */
  options?: RecordAttributeOption[];
  /** What clearing means, when the row is allowed to be empty. */
  clearLabel?: string;
  placeholder?: string;
  mono?: boolean;
  /**
   * What sort of value this is, where a plain text box is the wrong tool.
   * `date` opens a date field and commits `YYYY-MM-DD`; the closed row still
   * shows whatever `formatted` says, so a reader sees "8/11/2026" and an
   * editor gets a picker rather than a string to retype in the right order.
   */
  kind?: "text" | "date";
};

/**
 * A property whose value is one of a known set — an owner, a status, a stage.
 *
 * The whole value is the trigger, which is the Notion behaviour: you press
 * what you are looking at, not a "Change" button parked beside it. A row that
 * needs a separate verb to edit it is a row people stop editing.
 */
function ChoiceValue({ attribute }: { attribute: RecordAttribute }) {
  const [open, setOpen] = useState(false);
  const options = attribute.options ?? [];
  const current = options.find((option) => option.value === (attribute.value ?? ""));

  return (
    // A popover beside the value on a desktop; on a phone the same options
    // come up from the bottom edge under the property's own name. The trigger
    // sits in the right-hand column of a two-column list, so a panel anchored
    // to it at 390px had nowhere to go but over the properties above it.
    <ResponsivePopover
      open={open}
      onOpenChange={setOpen}
      title={attribute.label}
      align="start"
      className="w-[min(15rem,calc(100vw-2rem))] p-1"
      trigger={
        <button
          type="button"
          className={cn(
            "-mx-1.5 flex w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-left hover:bg-[var(--surface-subtle)]",
            ATTRIBUTE_ROW,
            !current && "text-[var(--text-muted)]",
          )}
        >
          {attribute.display ?? (
            <span className="min-w-0 truncate">
              {current?.label ?? attribute.placeholder ?? "Empty"}
            </span>
          )}
        </button>
      }
    >
        <div className="overflow-y-auto sm:max-h-72">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                attribute.onCommit?.(option.value);
                setOpen(false);
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-left text-sm hover:bg-[var(--surface-hover)] sm:min-h-9",
                option.value === attribute.value && "font-medium",
              )}
            >
              {option.leading}
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {option.value === attribute.value ? (
                <Check className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
              ) : null}
            </button>
          ))}
          {attribute.clearLabel && attribute.value ? (
            <button
              type="button"
              onClick={() => {
                attribute.onCommit?.("");
                setOpen(false);
              }}
              className="flex min-h-11 w-full items-center rounded-[var(--radius-sm)] px-2 text-left text-sm text-[var(--text-muted)] hover:bg-[var(--surface-hover)] sm:min-h-9"
            >
              {attribute.clearLabel}
            </button>
          ) : null}
        </div>
    </ResponsivePopover>
  );
}

function EditableValue({ attribute }: { attribute: RecordAttribute }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = attribute.formatted ?? attribute.value;

  if (!attribute.onCommit) {
    return (
      <span
        className={cn(
          "block break-words",
          ATTRIBUTE_ROW,
          attribute.mono && "font-mono",
          !attribute.value && "text-[var(--text-muted)]",
        )}
      >
        {shown || attribute.placeholder || "—"}
      </span>
    );
  }

  if (draft === null) {
    return (
      <button
        type="button"
        onClick={() => setDraft(attribute.value ?? "")}
        className={cn(
          // `block` and `break-words`, not `flex items-center`. A flex child
          // will not wrap, so an email address longer than the value column —
          // which at 390px is about 200px — ran off the right edge of the
          // screen with no ellipsis and no way to read the rest of it. A
          // property that cannot be read is worse than one that takes two
          // lines.
          "-mx-1.5 block w-full rounded-[var(--radius-sm)] px-1.5 text-left break-words hover:bg-[var(--surface-subtle)]",
          ATTRIBUTE_ROW,
          attribute.mono && "font-mono",
          !attribute.value && "text-[var(--text-muted)]",
        )}
      >
        {shown || attribute.placeholder || "Empty"}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      type={attribute.kind === "date" ? "date" : "text"}
      value={draft}
      aria-label={attribute.label}
      // Full width of the value column and no wider: the input inherited a
      // default width that overflowed the row on a phone, so the field you
      // were typing into was cut off by the edge of the screen.
      className="h-8 w-full"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== (attribute.value ?? "")) attribute.onCommit?.(draft);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          if (draft !== (attribute.value ?? "")) attribute.onCommit?.(draft);
          setDraft(null);
        }
        if (event.key === "Escape") setDraft(null);
      }}
    />
  );
}

export function RecordAttributes({
  attributes,
  /** How many to show before the list collapses. */
  visibleCount = 5,
  columns = "auto",
  className,
}: {
  attributes: RecordAttribute[];
  visibleCount?: number;
  /**
   * `auto` pairs the rows up once there is room for two columns, which is what
   * a record's standing column and its landing view both want.
   *
   * `1` keeps them stacked however wide the container gets. A detail panel
   * beside a list is the case: it is wide enough to trip the two-column rule
   * and narrow enough that doing so leaves each value about eight characters,
   * so "Aug 8, 2026" comes out on two lines beside a label on one.
   */
  columns?: 1 | "auto";
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (attributes.length === 0) return null;

  const shown = expanded ? attributes : attributes.slice(0, visibleCount);
  const hidden = attributes.length - shown.length;

  return (
    // Sized to the column it is in, not to the window. This list renders full
    // width under the identity strip on a phone and inside a 320px standing
    // column on a desktop; keyed to the viewport, the desktop case put two
    // columns inside 320px and "USD 9,100.00" came out one character per line.
    <div className={cn("@container space-y-0.5", className)}>
      <dl
        className={cn(
          "grid gap-x-6 gap-y-0.5",
          columns === "auto" && "@md:grid-cols-2",
        )}
      >
        {shown.map((attribute) => {
          const Icon = attribute.icon;
          return (
            // `items-start`, not `items-center`: a value that wraps to two
            // lines should hang off its label, not push the label into the
            // middle of it.
            <div key={attribute.id} className="flex items-start gap-3">
              {/* Narrower on a phone. A 144px label column out of the ~358px a
                  390px screen has left barely 200px for the value, which is
                  what pushed emails, company names and the pickers beside them
                  off the right edge. */}
              <dt
                className={cn(
                  "flex w-28 shrink-0 items-start gap-2 text-[var(--text-muted)] @md:w-36",
                  ATTRIBUTE_ROW,
                )}
              >
                {/* `mt-px` against a 20px line box, which is where the optical
                    centre of a 16px glyph actually falls — the old `mt-0.5`
                    was tuned against a line box the value no longer uses. */}
                {Icon ? <Icon className="mt-px size-4 shrink-0" aria-hidden="true" /> : null}
                {/* Wraps rather than truncates. In a 112px column "Primary
                    contact" became "Primary cont…", which is a label somebody
                    has to guess at — and a label is the half of the row that
                    has to be readable for the other half to mean anything. */}
                <span className="min-w-0">{attribute.label}</span>
              </dt>
              <dd className="min-w-0 flex-1">
                {/* Which editor a row gets is decided here, from the shape of
                    the attribute: a known set of values is a choice, a commit
                    handler is free text, and anything else is a value the page
                    drew itself and nobody can edit in place. */}
                {attribute.options && attribute.onCommit ? (
                  <ChoiceValue attribute={attribute} />
                ) : (
                  (attribute.display ?? <EditableValue attribute={attribute} />)
                )}
              </dd>
            </div>
          );
        })}
      </dl>

      {hidden > 0 || expanded ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-[var(--text-muted)]"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <>
              <ChevronDown className="mr-1.5 size-4" aria-hidden="true" />
              Show less
            </>
          ) : (
            <>
              <ChevronRight className="mr-1.5 size-4" aria-hidden="true" />
              {hidden} more propert{hidden === 1 ? "y" : "ies"}
            </>
          )}
        </Button>
      ) : null}
    </div>
  );
}
