"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@corelithzw/react";

import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Download } from "@/lib/icons";
import { RichTextRenderer } from "@/components/crm/collaboration/rich-text-renderer";
import { cn } from "@/lib/utils";

import { bucketByDate } from "./record-list-groups";

/**
 * The read-only evidence trail: who did what, when, and what changed.
 *
 * Built to the `lists-history-feed` recipe. History is read-only — nothing in
 * here edits in place, and the diff is the record of what happened rather than
 * a view of what is. That is the whole reason it exists: a timeline you can
 * edit proves nothing.
 */

export type HistoryChange = {
  field: string;
  from: string | null;
  to: string | null;
};

export type HistoryEvent = {
  id: string;
  /** Machine name of what happened — used for the action filter. */
  action: string;
  /** How it reads in a sentence: "moved the deal to Quoted". */
  verb: string;
  actorId: string | null;
  actorName: string;
  occurredAt: string;
  changes?: HistoryChange[];
  /** Free text the event carried, shown under the verb phrase. */
  note?: string | null;
};

function toCsv(events: HistoryEvent[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = [
    ["When", "Who", "What", "Field", "From", "To"].join(","),
    ...events.flatMap((event) =>
      event.changes && event.changes.length > 0
        ? event.changes.map((change) =>
            [
              event.occurredAt,
              event.actorName,
              event.verb,
              change.field,
              change.from ?? "",
              change.to ?? "",
            ]
              .map(escape)
              .join(","),
          )
        : [[event.occurredAt, event.actorName, event.verb, "", "", ""].map(escape).join(",")],
    ),
  ];
  return rows.join("\n");
}

function HistoryRow({ event }: { event: HistoryEvent }) {
  const [expanded, setExpanded] = useState(false);
  const changes = event.changes ?? [];
  const time = new Date(event.occurredAt);

  return (
    <li className="flex gap-3 py-2.5">
      <Avatar size="sm" name={event.actorName} />

      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium text-[var(--text-strong)]">{event.actorName}</span>{" "}
          <span className="text-[var(--text-body)]">{event.verb}</span>
        </p>
        {event.note ? (
          // Notes are written in the CRM's one text format, so a mention in
          // one has to be a chip here too — rendered as plain text, a note
          // that referenced a colleague showed their name followed by a uuid.
          <RichTextRenderer
            body={event.note}
            className="mt-0.5 text-[var(--text-muted)]"
          />
        ) : null}
        <time
          dateTime={event.occurredAt}
          className="mt-0.5 block font-mono text-sm text-[var(--text-subtle)]"
        >
          {Number.isNaN(time.getTime())
            ? event.occurredAt
            : time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </time>

        {expanded && changes.length > 0 ? (
          <dl className="mt-2 grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[var(--radius-md)] bg-[var(--surface-muted)] px-3 py-2 text-sm">
            {changes.map((change) => (
              <div key={change.field} className="contents">
                <dt className="truncate text-[var(--text-muted)]">{change.field}</dt>
                <dd className="min-w-0">
                  <span className="text-[var(--text-subtle)] line-through">
                    {change.from ?? "—"}
                  </span>{" "}
                  <span aria-hidden>→</span>{" "}
                  <span className="text-[var(--text-strong)]">{change.to ?? "—"}</span>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {changes.length > 0 ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex h-7 items-center gap-1 self-start rounded px-1.5 text-sm text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text)]"
        >
          {expanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          {changes.length} change{changes.length === 1 ? "" : "s"}
        </button>
      ) : null}
    </li>
  );
}

export function HistoryFeed({
  events,
  emptyMessage = "Nothing has happened on this record yet.",
  exportName = "history",
}: {
  events: HistoryEvent[];
  emptyMessage?: string;
  exportName?: string;
}) {
  const [actor, setActor] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);

  const actors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const event of events) seen.set(event.actorName, event.actorName);
    return [...seen.keys()];
  }, [events]);

  const actions = useMemo(() => [...new Set(events.map((event) => event.action))], [events]);

  const filtered = useMemo(
    () =>
      events.filter(
        (event) =>
          (!actor || event.actorName === actor) && (!action || event.action === action),
      ),
    [action, actor, events],
  );

  const buckets = useMemo(
    () => bucketByDate(filtered, (event) => event.occurredAt).filter((b) => b.items.length > 0),
    [filtered],
  );

  const download = () => {
    const blob = new Blob([toCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${exportName}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (events.length === 0) {
    return <p className="py-6 text-center text-sm text-[var(--text-muted)]">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {actors.length > 1 || actions.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {actors.length > 1
            ? actors.map((name) => (
                <FilterChip
                  key={`actor-${name}`}
                  label={name}
                  pressed={actor === name}
                  onToggle={() => setActor(actor === name ? null : name)}
                />
              ))
            : null}
          {actions.length > 1
            ? actions.map((name) => (
                <FilterChip
                  key={`action-${name}`}
                  label={name.toLowerCase().replace(/_/g, " ")}
                  pressed={action === name}
                  onToggle={() => setAction(action === name ? null : name)}
                />
              ))
            : null}

          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="ml-auto h-7 gap-1.5 px-2 text-sm"
            onClick={download}
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      ) : null}

      {buckets.length === 0 ? (
        <p role="status" className="py-6 text-center text-sm text-[var(--text-muted)]">
          Nothing matches those filters.
        </p>
      ) : (
        buckets.map((bucket) => (
          <section key={bucket.id} aria-labelledby={`history-${bucket.id}`}>
            <h4
              id={`history-${bucket.id}`}
              className="sticky top-14 z-10 bg-[var(--surface-base)] py-1.5 text-sm font-medium text-[var(--text-subtle)]"
            >
              {bucket.label}
            </h4>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {bucket.items.map((event) => (
                <HistoryRow key={event.id} event={event} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function FilterChip({
  label,
  pressed,
  onToggle,
}: {
  label: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        "rounded-full border px-2.5 py-1 text-sm capitalize transition-colors",
        pressed
          ? "border-[var(--action-primary-bg)] bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-muted)]",
      )}
    >
      {label}
    </button>
  );
}
