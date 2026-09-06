"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { Badge, Stack } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { EntityLink } from "@corelithzw/module-records/components/entity-link";
import { eventKindStyle, type EventKind } from "@/components/crm/records/event-kind";
import { richTextToPlain } from "@corelithzw/module-records/rich-text";
import { fileMark, formatFileSize, meetingPlace, timeToStart } from "@/lib/crm/panels";
import {
  CalendarCheck,
  Download,
  Mail,
  MapPin,
  Video,
  type LucideIcon,
} from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The compact panels that sit beside a record.
 *
 * The rail was a stack of headings with a sentence under each: a date as a
 * date, an address as a string, a file as a filename. All correct, all inert.
 * Somebody looking at "14 March 2026, 09:00" still has to work out whether
 * that is today, and somebody looking at eleven filenames still has to read
 * eleven filenames to find the PDF.
 *
 * So each panel does the small piece of work the reader was doing: how long
 * until it, where exactly, which one is the photo. The primitives are the
 * house ones — this is composition, not a second design system.
 */

export type PanelMeeting = {
  id: string;
  title: string;
  scheduledStart: string;
  location?: string | null;
  attendeeName?: string | null;
};

/**
 * The next meeting, and what to press when it starts.
 *
 * The countdown is the point. A start time answers "when is it" and leaves
 * "should I be doing something about it right now" to the reader and their
 * own watch, which is the question they actually opened the page with.
 */
export function MeetingCard({
  meeting,
  action,
}: {
  meeting: PanelMeeting;
  action?: ReactNode;
}) {
  const countdown = timeToStart(meeting.scheduledStart);
  const place = meetingPlace(meeting.location);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-[var(--text-strong)]">
          {meeting.title}
        </p>
        <Badge tone={countdown.imminent ? "warn" : countdown.past ? "neutral" : "info"}>
          {countdown.label}
        </Badge>
      </div>

      {/* The marks are a step lighter than the lines they label. A solid
          Phosphor glyph at the text's own ink reads heavier than the text — it
          is a filled shape against letterforms — so matching the two makes the
          icon the loudest thing in a row whose point is the date. */}
      <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
        <CalendarCheck
          className="size-4 shrink-0 text-[var(--text-subtle)]"
          aria-hidden="true"
        />
        <ClientDate value={meeting.scheduledStart} mode="datetime" />
      </p>

      {place.kind === "map" ? (
        <p className="flex items-start gap-1.5 text-sm text-[var(--text-muted)]">
          <MapPin
            className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]"
            aria-hidden="true"
          />
          <span className="min-w-0">{place.text}</span>
        </p>
      ) : null}

      {meeting.attendeeName ? (
        <p className="text-sm text-[var(--text-muted)]">{meeting.attendeeName} is going</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {place.kind === "join" ? (
          <Button asChild size="sm" variant={countdown.imminent ? "primary" : "secondary"}>
            <a href={place.url} target="_blank" rel="noreferrer">
              <Video className="size-4" />
              Join
            </a>
          </Button>
        ) : null}
        {place.kind === "map" ? (
          <Button asChild size="sm" variant="secondary">
            <a href={place.url} target="_blank" rel="noreferrer">
              <MapPin className="size-4" />
              Directions
            </a>
          </Button>
        ) : null}
        {action}
      </div>
    </div>
  );
}

export type PanelAttachment = {
  id: string;
  name: string;
  url: string;
  size?: number | null;
  uploadedAt?: string | null;
};

/**
 * Files, scannable by type.
 *
 * The coloured mark is doing real work: a rail of eleven attachments is
 * searched for "the PDF" or "the photo", and colour answers that without
 * reading a single filename. Solid, like every other mark in a record — a
 * tint reads as a disabled or draft state next to a column of filled discs.
 */
export function AttachmentsPanel({
  attachments,
  emptyMessage = "Nothing attached yet.",
}: {
  attachments: PanelAttachment[];
  emptyMessage?: string;
}) {
  if (attachments.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  return (
    <Stack as="ul" gap="xs">
      {attachments.map((attachment) => {
        const mark = fileMark(attachment.name);
        const size = formatFileSize(attachment.size);
        return (
          <li key={attachment.id}>
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-center gap-2.5 rounded-[var(--radius-sm)] py-1 hover:bg-[var(--surface-hover)]"
            >
              <span
                data-accent={mark.accent}
                aria-hidden="true"
                className="solid-mark flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] font-mono text-sm font-semibold"
              >
                {mark.label}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-[var(--text-strong)]">
                  {attachment.name}
                </span>
                <span className="block text-sm text-[var(--text-muted)]">
                  {size}
                  {size && attachment.uploadedAt ? " · " : ""}
                  {attachment.uploadedAt ? <ClientDate value={attachment.uploadedAt} /> : null}
                </span>
              </span>

              <Download
                className="size-4 shrink-0 text-[var(--text-subtle)] opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100"
                aria-hidden="true"
              />
            </a>
          </li>
        );
      })}
    </Stack>
  );
}

export type NextInteraction = {
  kind: "task" | "visit" | "follow-up";
  title: string;
  at: string;
  href?: string;
  assigneeName?: string | null;
};

const INTERACTION_LABEL: Record<NextInteraction["kind"], string> = {
  task: "Task",
  visit: "Site visit",
  "follow-up": "Follow-up",
};

/**
 * The next thing due, whatever kind of thing it is.
 *
 * One card rather than three, because "what is next on this" does not care
 * whether the answer is a task, a visit or a follow-up — and three panels each
 * showing its own next item makes the reader do the comparison.
 *
 * There is deliberately no empty state. Nothing booked is not this panel's
 * news, it is the next step's: both call sites already render `NextStepCard`
 * in that case, which says what to do about it rather than only that there is
 * nothing. A card carried an amber "Nothing scheduled" branch for a while that
 * neither page could ever reach.
 */
export function NextInteractionCard({
  interaction,
  action,
}: {
  interaction: NextInteraction;
  action?: ReactNode;
}) {
  const countdown = timeToStart(interaction.at);

  // Two lines and one coloured word. The badge that used to sit up here made
  // "in 3 days" as loud as "overdue", so lateness — the only thing on this
  // panel worth a colour — had to compete with the ordinary case for it. Now
  // the timing is plain text until it is late, and then it is red.
  return (
    <div className="space-y-1">
      {interaction.href ? (
        <EntityLink href={interaction.href}>{interaction.title}</EntityLink>
      ) : (
        <p className="text-sm font-medium text-[var(--text-strong)]">{interaction.title}</p>
      )}

      <p className="text-sm text-[var(--text-muted)]">
        <span
          className={cn(
            countdown.past && "font-medium text-[var(--status-error-text)]",
            countdown.imminent && !countdown.past && "font-medium text-[var(--text-strong)]",
          )}
        >
          {countdown.past ? `Overdue ${countdown.label}` : countdown.label}
        </span>
        {" · "}
        {INTERACTION_LABEL[interaction.kind]}
        {interaction.assigneeName ? ` · ${interaction.assigneeName}` : ""}
      </p>

      {action}
    </div>
  );
}

export type PanelMessage = {
  id: string;
  subject: string | null;
  body: string | null;
  at: string;
  actorName?: string | null;
};

/**
 * The last email, enough of it to know whether to open it.
 *
 * Two lines of the body rather than none: a subject alone is how somebody
 * clicks through to discover it was the automatic one.
 */
export function EmailPreview({
  message,
  href,
  emptyMessage = "No email logged yet.",
}: {
  message: PanelMessage | null;
  href?: string;
  emptyMessage?: string;
}) {
  if (!message) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  const snippet = richTextToPlain(message.body ?? "", 160);

  const inner = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <Mail className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
          <span className="truncate text-sm font-medium text-[var(--text-strong)]">
            {message.subject?.trim() || "No subject"}
          </span>
        </span>
        <span className="shrink-0 text-sm text-[var(--text-muted)]">
          <ClientDate value={message.at} />
        </span>
      </div>
      {snippet ? (
        <p className="mt-1 line-clamp-2 text-sm text-[var(--text-muted)]">{snippet}</p>
      ) : null}
      {message.actorName ? (
        <p className="mt-1 text-sm text-[var(--text-subtle)]">{message.actorName}</p>
      ) : null}
    </>
  );

  return href ? (
    <Link href={href} className="block rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)]">
      {inner}
    </Link>
  ) : (
    <div>{inner}</div>
  );
}

export type RailTally = {
  label: string;
  /** Calls logged, emails sent, days waiting. */
  value: number;
  icon: LucideIcon;
};

/**
 * "Contact so far" — how much of each thing has happened, a row apiece.
 *
 * The whole row is tinted, not just the figure. A zero here is the finding:
 * nobody has rung, nobody has written, and the row saying so should be the one
 * that catches the eye on the way down the rail rather than a grey line with a
 * small red digit at the end of it. A tally with something in it is green for
 * the same reason — the pair only reads as an answer if both halves are
 * coloured by it.
 *
 * That rule is also the limit of what belongs here: only a fact where nothing
 * is bad news and something is good news. A wait in days is the opposite way
 * round and would come out green at eleven days, so it is left to the next
 * step's own sentence, which can say what a number of days means.
 *
 * Deliberately not `ContactList` below, which is the last few things that
 * actually happened and who they were with. This answers "how much", that one
 * answers "what".
 */
export function ContactTally({ tallies }: { tallies: RailTally[] }) {
  return (
    <ul>
      {tallies.map((tally) => {
        const Icon = tally.icon;
        const none = tally.value === 0;
        return (
          <li
            key={tally.label}
            className={cn(
              "flex min-h-[26px] items-center gap-2.5",
              none ? "text-[var(--badge-bad-fg)]" : "text-[var(--badge-ok-fg)]",
            )}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm">{tally.label}</span>
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
              {tally.value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export type PanelContact = {
  id: string;
  at: string;
  /** Call, email, meeting — what actually happened. */
  kind: EventKind;
  actorName?: string | null;
  summary?: string | null;
  /** Somebody rang and nobody answered — worth showing differently. */
  missed?: boolean;
};

/**
 * The last few times anybody dealt with these people, and how.
 *
 * Separated from the timeline because "when did we last actually speak to
 * them" is the question that decides whether to ring now, and answering it
 * from a mixed feed means scrolling past every stage change and raised
 * document.
 *
 * It used to be calls only, under a strip counting four kinds — so a record
 * whose last three contacts were emails read as "nobody has logged a call"
 * beside a figure saying four emails. Every kind of contact belongs here; the
 * glyph and its colour, shared with the timeline, are what keep them apart.
 *
 * Above it, `ContactTally` — but not the inline strip that used to be there.
 * "2 calls · 4 emails · 2 notes" was a coarser second answer to the question
 * this list already answers better, and it was drawn in the same grey whether
 * the counts were healthy or all zero. The tally earns its place by answering
 * something the list cannot: a record with no contact at all has an empty list,
 * which reads as "nothing to show" rather than as the finding it is.
 */
export function ContactList({
  contacts,
  emptyMessage = "Nobody has logged any contact.",
}: {
  contacts: PanelContact[];
  emptyMessage?: string;
}) {
  if (contacts.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  return (
    // Each row is two lines of its own, so the gap between rows has to beat the
    // gap inside one or the list reads as one paragraph with coloured dots in
    // it. `xs` was tuned for single-line rows and did not.
    <ul className="flex flex-col gap-3">
      {contacts.map((contact) => {
        const { icon: KindIcon, accent, label } = eventKindStyle(contact.kind);
        return (
          <li key={contact.id} className="flex items-start gap-2.5">
            {/* Solid, like the chip on the timeline: this is the same coding
                doing the same job, and at 20px a tint has nothing left to
                spend. `.solid-mark` carries the fill-and-glyph pairing. */}
            <span
              data-accent={contact.missed ? "red" : accent}
              title={label}
              className="solid-mark mt-px flex size-5 shrink-0 items-center justify-center rounded-full"
            >
              <KindIcon className="size-3" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-[var(--text-strong)]">
                  {contact.actorName ?? "Someone"}
                  {contact.missed ? " · no answer" : ""}
                </span>
                {/* The day, not the second. This is a three-line "when did we
                    last speak" summary in a narrow column, and a full
                    "8/4/2026, 9:06:53 PM" both wraps and answers a question
                    nobody asked. The exact time is on the timeline. */}
                <span className="shrink-0 text-sm tabular-nums text-[var(--text-muted)]">
                  <ClientDate value={contact.at} mode="date" />
                </span>
              </span>
              {contact.summary ? (
                <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
                  {richTextToPlain(contact.summary, 120)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
