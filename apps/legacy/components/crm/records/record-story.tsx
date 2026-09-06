"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@corelithzw/ui/components/button";
import { ChevronDown, ChevronRight, FileText } from "@corelithzw/ui/lib/icons";
import {
  QUIET_KINDS,
  type EventKind,
  eventKindStyle,
} from "@/components/crm/records/event-kind";
import { RichTextRenderer } from "@/components/crm/collaboration/rich-text-renderer";
import { cn } from "@corelithzw/ui/lib/utils";

const PAGE_SIZE = 25;

/**
 * The time of day, and nothing else.
 *
 * Same hydration contract as `ClientDate`: the first paint is a slice of the
 * raw ISO string, so the server bytes and the first client render are
 * identical, and only afterwards does the reader's locale come into it.
 * `ClientDate` has no time-only mode, hence the dozen lines.
 */
const NO_RESUBSCRIBE = () => () => {};

function ClientTime({ value }: { value: string }) {
  // useSyncExternalStore rather than a mount effect: the server snapshot and
  // the client's first snapshot are both `false`, so hydration matches without
  // a render-triggering setState.
  const hydrated = useSyncExternalStore(
    NO_RESUBSCRIBE,
    () => true,
    () => false,
  );

  const date = new Date(value);
  if (!hydrated || Number.isNaN(date.getTime())) return <>{value.slice(11, 16)}</>;
  return <>{date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</>;
}

/**
 * One thing that happened, whatever kind of thing it was.
 *
 * The feed's whole job is to be the record's story, and a story told from one
 * table is not the story — it is whichever chapter that table happened to
 * keep. Site visits, tasks, comments and documents each live in their own
 * table for good reasons, and none of those reasons are the reader's problem.
 */
export type StoryEvent = {
  id: string;
  kind: EventKind;
  /** The sentence: "Nicolas Sharp created a task". */
  title: string;
  /** What was said, if anything was. */
  body?: string | null;
  occurredAt: string;
  actorName?: string | null;
  /** People on it, for an email or a meeting. */
  participants?: string[];
  /** Files, shown as chips. */
  attachments?: Array<{ name: string; href?: string }>;
  /** A quiet trailing note — "Created 8 days ago", a due date. */
  meta?: string | null;
  href?: string;
};

/**
 * Events that carry a body worth boxing rather than running as one line.
 *
 * Every kind somebody *writes prose into*, not a hand-picked few. With only
 * email boxed, a feed alternated between a framed paragraph and an unframed one
 * for two things that are the same thing — a message — and the frame stopped
 * meaning "somebody said this" and started meaning "this one happened to be an
 * email". The mark on the left of the row is what tells the kinds apart; the
 * box itself only says there are words in here.
 */
const BOXED: ReadonlySet<EventKind> = new Set([
  "email",
  "note",
  "comment",
  "visit",
  "call",
  "whatsapp",
  "meeting",
]);

/**
 * The kinds that fold away.
 *
 * Deliberately narrower than `QUIET_KINDS`. Quiet means "read this second";
 * this means "you do not have to read it at all unless you ask", and only two
 * kinds earn that: a stage move and a system line. A raised quotation is quiet
 * *and* it is the reason somebody opened the record — hiding it behind a
 * disclosure would answer "what happened here" with a button.
 *
 * A run of one is left alone. Replacing a single grey line with a single grey
 * control that reveals it is not a saving.
 */
const FOLDABLE: ReadonlySet<EventKind> = new Set(["stage", "system"]);
const FOLD_FROM = 2;

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10);
}

function dayLabel(iso: string, now: Date): string {
  const date = new Date(iso);
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (dayKey(iso) === dayKey(now.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

/**
 * The rail and the mark, which every row in the feed shares.
 *
 * `data-accent` is how the design system swaps a hue — it rebinds `--accent-*`
 * on this element, so the classes stay static and only the attribute changes.
 *
 * Solid, not a tint inside a ring. A 24px disc has room for one thing, and a
 * pale wash behind a pale glyph inside a pale outline spends all three on the
 * same weak signal — at arm's length the whole rail read as one grey column
 * again. `.solid-mark` owns the fill-and-glyph pairing for every mark in the
 * product; see `globals.css` for why three of the thirteen hues are darkened
 * rather than reversed.
 */
function StoryMark({
  accent,
  title,
  children,
}: {
  accent: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-accent={accent}
      title={title}
      className="solid-mark relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
    >
      {children}
    </span>
  );
}

function StoryRow({ event }: { event: StoryEvent }) {
  const { icon: Icon, accent, label } = eventKindStyle(event.kind);
  const quiet = QUIET_KINDS.has(event.kind);
  const boxed = BOXED.has(event.kind) && Boolean(event.body);

  /**
   * Who, what and when, on one line above whatever they wrote.
   *
   * This used to run inline with the body: avatar, then the sentence, then the
   * time, then the prose underneath, all in one paragraph-shaped block. Which
   * meant the two facts a reader scans a feed for — who is talking and when —
   * were mixed into the same visual run as the thing they said, and finding
   * "the last time the client emailed" meant reading every row.
   *
   * Split out, the header is a fixed shape that repeats down the feed and the
   * body is free to be any length without moving it.
   */
  const header = (
    <div className="flex items-center gap-2">
      {/* No author avatar.

          There used to be one here, coloured by name, sitting beside the kind
          mark on the left of the row — two discs on every line, an inch apart,
          neither of them the thing being said. The artboard keeps one mark per
          event and makes it the kind: what happened is what you scan a
          timeline for, and who did it is already the first word of the
          sentence. */}
      <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
        {event.actorName ? (
          <span className="text-sm font-semibold text-[var(--text-strong)]">
            {event.actorName}
          </span>
        ) : null}
        {/* With an author beside it the title is the *kind* — "Email", "Note" —
            so it reads as a label rather than repeating the name already at the
            head of the line. Without one it is the whole sentence. */}
        <span
          className={cn(
            "min-w-0 text-sm",
            event.actorName || quiet
              ? "text-[var(--text-muted)]"
              : "font-medium text-[var(--text-strong)]",
          )}
        >
          {event.title}
        </span>
      </span>

      {/* The day is already the section heading, so the row only needs the
          time of day — a full "8/4/2026, 9:06:53 PM" on every one of a hundred
          rows repeats the heading and adds a second nobody reads. */}
      <span className="shrink-0 font-mono text-sm tabular-nums text-[var(--text-disabled)]">
        <ClientTime value={event.occurredAt} />
      </span>
    </div>
  );

  const content = (
    <>
      {header}

      {event.participants && event.participants.length > 0 ? (
        <p className="mt-1 text-sm text-[var(--text-muted)]">{event.participants.join(", ")}</p>
      ) : null}

      {event.body ? (
        // Bodies are written in the CRM's one text format, so a note that
        // mentions a colleague or links a deal reads the same on a timeline as
        // it does in the comment thread it might have been written in.
        <RichTextRenderer
          body={event.body}
          className={cn("mt-1.5", quiet && "text-[var(--text-muted)]")}
        />
      ) : null}

      {event.attachments && event.attachments.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {event.attachments.slice(0, 3).map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-sm">
                <FileText className="size-3.5 text-[var(--text-subtle)]" />
                <span className="max-w-40 truncate">{file.name}</span>
              </span>
            </li>
          ))}
          {event.attachments.length > 3 ? (
            <li className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--border)] px-2 py-1 text-sm text-[var(--text-muted)]">
              +{event.attachments.length - 3}
            </li>
          ) : null}
        </ul>
      ) : null}

      {event.meta ? (
        <p className="mt-1 text-sm text-[var(--text-subtle)]">{event.meta}</p>
      ) : null}
    </>
  );

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      <StoryMark accent={accent} title={label}>
        <Icon className="size-3.5" />
      </StoryMark>

      <div className="min-w-0 flex-1">
        {boxed ? (
          // What somebody actually wrote gets a box, and the box takes the
          // event's colour on its leading edge — so a scrolled feed shows at a
          // glance which paragraphs are the client's and which are ours,
          // without reading a word of any of them.
          <div className="rounded-[var(--card-radius)] border border-[var(--border)] bg-[var(--surface-base)] p-3">
            {content}
          </div>
        ) : (
          <div className="py-0.5">{content}</div>
        )}
      </div>
    </li>
  );
}

/**
 * A run of mechanical changes, folded into one line.
 *
 * A record worked for a year carries hundreds of "Stage changed to Quoted"
 * rows, and they sit between the things somebody actually said. Each one is
 * worth having and none of them is worth a row of its own on the way past —
 * which is exactly what a disclosure is for. Closed it says how many; open it
 * is the same rows it always was, in the same order, on the same rail.
 */
function FoldedRun({ events }: { events: StoryEvent[] }) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <>
        {events.map((event) => (
          <StoryRow key={`${event.kind}-${event.id}`} event={event} />
        ))}
        <li className="relative flex gap-3 pb-3">
          <span className="w-6 shrink-0" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            <ChevronDown className="size-3.5" aria-hidden="true" />
            Hide {events.length} changes
          </button>
        </li>
      </>
    );
  }

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {/* The same 24px disc the rows use, so the fold sits on the rail rather
          than beside it — a gap in the line reads as a gap in the record. */}
      <StoryMark accent="gray">
        <ChevronRight className="size-3.5" />
      </StoryMark>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-w-0 flex-1 py-0.5 text-left text-sm text-[var(--text-muted)] hover:text-[var(--text)] hover:underline"
      >
        View {events.length} changes
      </button>
    </li>
  );
}

/**
 * A day's events, with runs of mechanical ones folded.
 *
 * Folding within the day rather than across it, because the day heading is what
 * gives every row its date — a run that spanned midnight would be one control
 * hiding two different days.
 */
function foldRuns(events: StoryEvent[]): Array<StoryEvent | StoryEvent[]> {
  const out: Array<StoryEvent | StoryEvent[]> = [];
  let run: StoryEvent[] = [];

  const flush = () => {
    if (run.length >= FOLD_FROM) out.push(run);
    else out.push(...run);
    run = [];
  };

  for (const event of events) {
    if (FOLDABLE.has(event.kind)) {
      run.push(event);
      continue;
    }
    flush();
    out.push(event);
  }
  flush();

  return out;
}

/**
 * A record's whole story, day by day.
 *
 * Callers merge their own sources into `events` rather than this component
 * fetching them, because which sources exist depends on what the record is —
 * a site has visits and no quotes, a person has comments and no stages.
 */
export function RecordStory({
  events,
  emptyMessage = "Nothing has happened here yet.",
  header,
}: {
  events: StoryEvent[];
  emptyMessage?: string;
  header?: ReactNode;
}) {
  const [visible, setVisible] = useState(PAGE_SIZE);

  const groups = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
    const shown = sorted.slice(0, visible);
    const map = new Map<string, StoryEvent[]>();
    for (const event of shown) {
      const key = dayKey(event.occurredAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(event);
      else map.set(key, [event]);
    }
    return [...map.entries()].map(([key, entries]) => ({
      key,
      entries,
      items: foldRuns(entries),
    }));
  }, [events, visible]);

  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  // One instant for every heading, so a feed rendered across midnight does not
  // label half its rows "Today" and half by date.
  const now = new Date();

  return (
    <div className="space-y-5">
      {header}

      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          {/* The date, with the rule running off to the right of it. A bare
              bold word between two runs of rows reads as another row; a rule
              says "everything below me is this day" without shouting it. */}
          <h4 className="flex items-center gap-2.5 text-sm font-bold uppercase tracking-[0.06em] text-[var(--text-subtle)]">
            {dayLabel(group.entries[0].occurredAt, now)}
            <span className="h-px flex-1 bg-[var(--border-subtle)]" aria-hidden="true" />
          </h4>

          <ul className="relative">
            {group.items.map((item, index) =>
              Array.isArray(item) ? (
                <FoldedRun key={`fold-${group.key}-${index}`} events={item} />
              ) : (
                <StoryRow key={`${item.kind}-${item.id}`} event={item} />
              ),
            )}
          </ul>
        </section>
      ))}

      {visible < events.length ? (
        <Button
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => setVisible((current) => current + PAGE_SIZE)}
        >
          Show older
        </Button>
      ) : null}
    </div>
  );
}
