"use client";

import { useMemo, type ReactNode } from "react";

import { EmptyState, Stack } from "@corelithzw/react";
import { ClientDate } from "@/components/ui/client-date";
import { Download, Eye, Send } from "@/lib/icons";

type TemplateEvent = {
  id: string;
  type: string;
  source: string | null;
  createdAt: string;
};

const EVENT_LABELS: Record<string, string> = {
  VIEW: "Opened",
  SUBMIT: "Filled in",
  SEND: "Sent",
  DOWNLOAD: "Downloaded",
};

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-[var(--card-radius)] border border-[var(--border)] p-3">
      <h3 className="text-base font-semibold text-[var(--text-strong)] text-[var(--text-subtle)]">
        {label}
        <span className="mt-1 block font-mono text-xl font-semibold tracking-normal text-[var(--text-strong)]">
          {value}
        </span>
      </h3>
      {hint ? <p className="mt-0.5 text-sm text-[var(--text-muted)]">{hint}</p> : null}
    </div>
  );
}

/**
 * What this document has actually done.
 *
 * A template's counters are the only honest answer to "is this form working".
 * Opens without submissions is a form that asks too much; submissions without
 * opens means somebody is posting to it directly, which is worth knowing too.
 * The completion rate is the number people act on, so it is the one that gets
 * the space rather than being derivable from two others.
 */
export function TemplateAnalytics({
  viewCount,
  submitCount,
  lastViewedAt,
  lastSubmitAt,
  events,
}: {
  viewCount: number;
  submitCount: number;
  lastViewedAt: string | null;
  lastSubmitAt: string | null;
  events: TemplateEvent[];
}) {
  const completion = useMemo(() => {
    if (viewCount === 0) return null;
    return Math.round((submitCount / viewCount) * 100);
  }, [submitCount, viewCount]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Opened"
          value={String(viewCount)}
          hint={
            lastViewedAt ? (
              <>
                Last <ClientDate value={lastViewedAt} mode="datetime" />
              </>
            ) : (
              "Nobody has opened it yet"
            )
          }
        />
        <Stat
          label="Filled in"
          value={String(submitCount)}
          hint={
            lastSubmitAt ? (
              <>
                Last <ClientDate value={lastSubmitAt} mode="datetime" />
              </>
            ) : (
              "No submissions yet"
            )
          }
        />
        <Stat
          label="Completion"
          value={completion === null ? "—" : `${completion}%`}
          hint={
            completion === null
              ? "Needs an open to measure"
              : completion < 40
                ? "Low — the form may be asking too much"
                : "Of the people who opened it"
          }
        />
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          body="Every open and every submission shows up here as it happens."
        />
      ) : (
        <Stack as="ul" gap="xs">
          {events.map((event) => {
            const Icon =
              event.type === "SUBMIT" ? Send : event.type === "DOWNLOAD" ? Download : Eye;
            return (
              <li key={event.id} className="flex items-center gap-3 px-1 py-1.5">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)]">
                  <Icon className="size-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                </span>
                <span className="text-sm">{EVENT_LABELS[event.type] ?? event.type}</span>
                {event.source ? (
                  <span className="text-sm text-[var(--text-muted)]">{event.source}</span>
                ) : null}
                <span className="ml-auto text-sm text-[var(--text-subtle)]">
                  <ClientDate value={event.createdAt} mode="datetime" />
                </span>
              </li>
            );
          })}
        </Stack>
      )}
    </div>
  );
}
