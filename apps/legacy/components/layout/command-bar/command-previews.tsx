"use client";

import type { ReactNode } from "react";

import { Avatar, Badge } from "@corelithzw/react";
import { ClientDate } from "@/components/ui/client-date";
import {
  Calendar,
  Clock,
  ExternalLink,
  FileText,
  MapPin,
  type LucideIcon,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * What the right pane shows while a row is highlighted.
 *
 * The pane exists so the bar can answer "is this the one I meant?" without
 * navigating. A palette that only lists names makes you open three records to
 * find the right one, and every one of those is a page load you then have to
 * come back from.
 */

export function PreviewShell({
  mark,
  title,
  status,
  children,
}: {
  mark?: ReactNode;
  title: string;
  /** The one pill that says what state this thing is in. */
  status?: { label: string; tone: "success" | "warn" | "danger" | "neutral" } | null;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
        {mark}
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{title}</h2>
        {status ? (
          <Badge tone={status.tone === "neutral" ? "neutral" : status.tone}>
            {status.label}
          </Badge>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{children}</div>
    </div>
  );
}

export function PreviewSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className="space-y-1.5 py-1.5">
      <h3 className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-[var(--text-subtle)]">
        {label}
        {typeof count === "number" ? (
          <span className="rounded bg-[var(--surface-subtle)] px-1 font-mono normal-case tracking-normal">
            {count}
          </span>
        ) : null}
      </h3>
      {children}
    </section>
  );
}

export function PreviewFact({
  icon: Icon,
  children,
  href,
}: {
  icon: LucideIcon;
  children: ReactNode;
  href?: string | null;
}) {
  const body = (
    <span className="min-w-0 flex-1 truncate text-sm">{children}</span>
  );

  return (
    <div className="flex items-center gap-2 py-1">
      <Icon className="size-4 shrink-0 text-[var(--text-subtle)]" aria-hidden="true" />
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="min-w-0 flex-1 truncate text-sm underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text)]"
        >
          {children}
        </a>
      ) : (
        body
      )}
    </div>
  );
}

/** The little calendar tile — weekday over day number. */
export function DateChip({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const date = new Date(value);
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" }).toUpperCase();
  const day = date.getDate();

  return (
    <span
      className={cn(
        "flex size-7 shrink-0 flex-col items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] leading-none",
        className,
      )}
      aria-hidden="true"
    >
      <span className="w-full bg-[var(--surface-subtle)] py-px text-center text-[0.5rem] font-medium text-[var(--text-muted)]">
        {weekday}
      </span>
      <span className="flex-1 pt-px text-sm font-semibold">{day}</span>
    </span>
  );
}

export type MeetingPreviewData = {
  title: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  locality: string | null;
  description: string | null;
  link: string | null;
  status: string;
  participants: Array<{ id: string; name: string; email: string | null; attending: boolean }>;
};

export function MeetingPreview({ meeting }: { meeting: MeetingPreviewData }) {
  const attending = meeting.participants.filter((person) => person.attending).length;
  const maybe = meeting.participants.length - attending;

  return (
    <PreviewShell
      mark={<DateChip value={meeting.startsAt} />}
      title={meeting.title}
      status={{ label: meeting.status, tone: "success" }}
    >
      <PreviewSection label="Details">
        <PreviewFact icon={Clock}>
          <ClientDate value={meeting.startsAt} mode="datetime" />
          {meeting.endsAt ? (
            <>
              {" – "}
              <ClientDate value={meeting.endsAt} mode="datetime" />
            </>
          ) : null}
        </PreviewFact>

        {meeting.location ? (
          <PreviewFact icon={MapPin}>
            {meeting.location}
            {meeting.locality ? (
              <span className="text-[var(--text-muted)]"> {meeting.locality}</span>
            ) : null}
          </PreviewFact>
        ) : null}

        {meeting.description ? (
          <PreviewFact icon={FileText}>{meeting.description}</PreviewFact>
        ) : null}

        {meeting.link ? (
          <PreviewFact icon={ExternalLink} href={meeting.link}>
            {meeting.link}
          </PreviewFact>
        ) : null}
      </PreviewSection>

      {meeting.participants.length > 0 ? (
        <PreviewSection label="Participants" count={meeting.participants.length}>
          <p className="text-sm text-[var(--text-muted)]">
            {attending} attending
            {maybe > 0 ? ` · ${maybe} maybe` : ""}
          </p>

          <ul className="space-y-1 pt-1">
            {meeting.participants.map((person) => (
              <li key={person.id} className="flex items-center gap-2 py-0.5">
                <Avatar size="sm" name={person.name} />
                <span className="min-w-0 truncate text-sm font-medium">{person.name}</span>
                {person.email ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-[var(--text-muted)]">
                    {person.email}
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    person.attending
                      ? "bg-[var(--status-success-border)]"
                      : "bg-[var(--status-warning-border)]",
                  )}
                  aria-label={person.attending ? "Attending" : "Maybe"}
                />
              </li>
            ))}
          </ul>
        </PreviewSection>
      ) : null}
    </PreviewShell>
  );
}

export type RecordPreviewData = {
  title: string;
  typeLabel: string;
  reference: string | null;
  subtitle: string | null;
  facts: Array<{ label: string; value: string }>;
};

export function RecordPreview({ record }: { record: RecordPreviewData }) {
  return (
    <PreviewShell
      title={record.title}
      status={{ label: record.typeLabel, tone: "neutral" }}
    >
      {record.reference ? (
        <p className="pb-1 font-mono text-sm text-[var(--text-muted)]">{record.reference}</p>
      ) : null}
      {record.subtitle ? (
        <p className="pb-2 text-sm text-[var(--text-muted)]">{record.subtitle}</p>
      ) : null}

      {record.facts.length > 0 ? (
        <PreviewSection label="Details">
          <dl className="space-y-1">
            {record.facts.map((fact) => (
              <div key={fact.label} className="flex items-start justify-between gap-3 py-0.5">
                <dt className="shrink-0 text-sm text-[var(--text-muted)]">{fact.label}</dt>
                <dd className="min-w-0 flex-1 truncate text-right text-sm">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </PreviewSection>
      ) : null}
    </PreviewShell>
  );
}

/** The pane for a row that does something rather than opening something. */
export function ActionPreview({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
}) {
  return (
    <PreviewShell
      mark={
        <span className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--surface-subtle)]">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      }
      title={title}
    >
      <p className="text-sm text-[var(--text-muted)]">{body}</p>
    </PreviewShell>
  );
}

export { Calendar };
