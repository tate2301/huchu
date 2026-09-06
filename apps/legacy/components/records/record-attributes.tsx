"use client";

import { useState, type ReactNode } from "react";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { ResponsivePopover } from "@corelithzw/ui/components/responsive-popover";
import { Check, ChevronDown, ChevronRight, Tag, type LucideIcon } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

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
/*
 * The desktop step down to 12px on an 18px line is the artboard's 24px row.
 * A phone keeps `text-sm` and the taller padding: there the properties are the
 * landing view rather than a 340px rail, and 12px is below what a thumb-held
 * screen should be asking anybody to read.
 */
export const ATTRIBUTE_ROW =
  "py-2 text-sm leading-5 sm:py-[3px] sm:text-[12px] sm:leading-[18px]";

export type RecordAttributeOption = {
  value: string;
  label: string;
  /** A dot or avatar shown beside the label in the list. */
  leading?: ReactNode;
};

/**
 * What a value *means*, which is what decides how it is drawn.
 *
 * The rail was one grey for every value, so a figure you are deciding against,
 * a name you can click through to and an owner nobody has assigned all read
 * the same. They are not the same, and the artboard tints them apart:
 *
 * - `money`   a total — mono, heavy, the strongest ink. The number you act on.
 * - `code`    a phone number, a reference, a registration — mono, body ink.
 *             Monospaced so digits line up between rows and can be compared.
 * - `link`    a way into another record.
 * - `muted`   nothing is stored here, and that is unremarkable.
 * - `alert`   nothing is stored here and it *is* remarkable — an unassigned
 *             owner, a lead with no source. Red and heavy, because this is the
 *             row somebody opened the record to fix.
 * - `strong`  an ordinary value that carries the record — a name, a title.
 * - `default` everything else.
 */
export type RecordAttributeTone =
  | "default"
  | "strong"
  | "link"
  | "code"
  | "money"
  | "muted"
  | "alert";

const TONE_CLASS: Record<RecordAttributeTone, string> = {
  default: "text-[var(--text-body)]",
  strong: "font-medium text-[var(--text-strong)]",
  link: "font-medium text-[var(--brand-strong)]",
  code: "font-mono text-[var(--text-body)]",
  money: "font-mono font-bold tabular-nums text-[var(--text-strong)]",
  muted: "text-[var(--text-faint)]",
  alert: "font-bold text-[var(--badge-bad-fg)]",
};

/**
 * The tone a row is actually drawn in.
 *
 * Resolved here rather than at the call sites, because most of it is already
 * knowable from the shape of the attribute: an empty value is muted whatever
 * else it claims to be, and a `mono` row is a code unless it says it is money.
 * A call site only has to spell out the half nobody can infer — that a total
 * is a total, and that *this* particular blank is a problem.
 */
function resolveTone(attribute: RecordAttribute, empty: boolean): RecordAttributeTone {
  const declared = attribute.tone ?? (attribute.mono ? "code" : "default");
  // "Unassigned" stays red when it is the thing being flagged; every other
  // tone gives way, because a tint applied to a placeholder is a colour
  // describing a value that is not there.
  if (empty) return declared === "alert" ? "alert" : "muted";
  return declared;
}

export type RecordAttribute = {
  id: string;
  label: string;
  icon?: LucideIcon;
  /**
   * How the value should read. Left off, it is worked out from the row — see
   * `resolveTone`. Set it for the two things the row cannot know: that a
   * number is money, and that an empty row is a problem.
   */
  tone?: RecordAttributeTone;
  /**
   * For a value the page renders itself — a link, a chip, an avatar. A row
   * that *only* has this is read-only; pair it with `options` and `onCommit`
   * and it becomes the closed state of a choice editor instead. (`onCommit`
   * alone does not: a free-text editor has nowhere to put a rendered node, so
   * a `display` without `options` wins and the row stays read-only.)
   *
   * A declared `tone` still applies — the node is wrapped in it, so a company
   * drawn as a link is the same blue here as it is in the table beside it.
   * Emptiness is not inferred for these rows: the page drew the node, so it
   * knows whether there is anything in it, and says so by leaving `tone` off.
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
  /** Shorthand for `tone: "code"`, kept because the call sites all say it. */
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
  const tone = resolveTone(attribute, !current);

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
            // Only when the page has not drawn the value itself: a chip or an
            // avatar carries its own colour, and a tone class over the top of
            // one repaints the label inside it.
            !attribute.display && TONE_CLASS[tone],
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
  const tone = TONE_CLASS[resolveTone(attribute, !attribute.value)];

  if (!attribute.onCommit) {
    return (
      <span className={cn("block break-words", ATTRIBUTE_ROW, tone)}>
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
          tone,
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
   * `auto` pairs the rows up once there is genuinely room for two columns.
   *
   * The threshold is 512px of container, which is 2 × (112px label + about
   * 120px of readable value) plus the 24px gutter. Worth stating plainly: the
   * two places this list renders today are both under it — the standing column
   * is 340px minus its padding, and a 390px phone is about 358px — so `auto`
   * is a floor for a wider container, not something either of them crosses. It
   * was keyed to 448px before, which is a width nothing here has either, and
   * the comments around it described a two-column rail that never existed.
   *
   * `1` keeps them stacked however wide the container gets. A detail panel
   * beside a list is the case: wide enough to trip the rule and narrow enough
   * that doing so leaves each value about eight characters, so "Aug 8, 2026"
   * comes out on two lines beside a label on one.
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
          columns === "auto" && "@lg:grid-cols-2",
        )}
      >
        {shown.map((attribute) => {
          // Every row gets a mark, not only the ones a page thought to name
          // one for. A column where six rows out of fourteen have a glyph and
          // the rest start at a ragged indent reads as a list that has gone
          // wrong; `Tag` is the honest fallback — this is a field on the
          // record and nothing more particular is known about it.
          const Icon = attribute.icon ?? Tag;
          return (
            // `items-start`, not `items-center`: a value that wraps to two
            // lines should hang off its label, not push the label into the
            // middle of it.
            <div key={attribute.id} className="flex items-start gap-2">
              {/* 112px, near enough the artboard's 116px label column, and the
                  same on a phone as in the standing column.

                  It was 144 everywhere. Out of the ~358px a 390px screen has,
                  and out of a 340px standing column, that left under 200px for
                  the value — so emails, company names and the pickers beside
                  them truncated or ran off the right edge, and the label, which
                  is the half you already know, was taking more width than the
                  half you came to read. (A second, 116px width keyed to a
                  container query lived here too; nothing this list renders in
                  was ever wide enough to trip it.)

                  The muted ink rather than the subtle one it briefly wore: the
                  subtle grey is now what an *empty* value is drawn in, and a
                  label the same colour as a missing value says the wrong thing
                  about every row that has one. The separation the eye needs is
                  label against value, and at 11.5px muted is already a clear
                  step off the body ink beside it. */}
              {/* Never bold, and never the value's ink: the three parts of a
                  row are meant to be told apart at a glance — mark, then the
                  name of the fact, then the fact. */}
              <dt
                className={cn(
                  "flex w-28 shrink-0 items-start gap-2 text-[var(--text-muted)]",
                  ATTRIBUTE_ROW,
                  "sm:text-[11.5px]",
                )}
              >
                {/* `mt-px` against a 20px line box, which is where the optical
                    centre of a 16px glyph actually falls — the old `mt-0.5`
                    was tuned against a line box the value no longer uses. */}
                {/* A step lighter than the label it sits beside, which is
                    already a step lighter than the value. The mark is the
                    quietest thing in the row — it is how you find "Owner"
                    without reading, not a third thing to read — and at the
                    label's own ink a column of sixteen of them was the first
                    thing the eye landed on in the pane.
                    The artboard's 14px, which is a step under the 16 the rest
                    of the page uses: a mark in a 24px row is a bullet, not an
                    icon. */}
                <Icon
                  className="mt-px size-4 shrink-0 text-[var(--text-faint)] sm:size-3.5"
                  aria-hidden="true"
                />
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
                ) : attribute.display ? (
                  // Through the tone, not around it. A rendered node used to be
                  // returned before any tone class was computed, so a company
                  // drawn as an `EntityLink` — which carries an underline and
                  // no colour of its own — was body ink on the record page and
                  // brand blue in the table next to it, and a `tone` declared
                  // on such a row did nothing at all.
                  <span
                    className={cn(
                      "block min-w-0",
                      attribute.tone && TONE_CLASS[attribute.tone],
                    )}
                  >
                    {attribute.display}
                  </span>
                ) : (
                  <EditableValue attribute={attribute} />
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
