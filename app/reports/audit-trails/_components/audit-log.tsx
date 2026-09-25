"use client";

import { Fragment, useMemo, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";

import { ActivityPayload, type ActivityTone } from "@/components/management/ui";
import { ChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { hasPayload, type AuditLogEvent } from "./audit-events";

/**
 * The log itself — `Audit.dc.html`.
 *
 * Events grouped by day with a day heading and its count; each row an avatar,
 * what changed, the actor, the event type in a mono chip and the time
 * right-aligned; a row with a payload opens to the diff, the reason and — when
 * the source carries them — the hash pair.
 *
 * The expanded panel is the shared `ActivityPayload`, not a copy of it. That
 * component is the board's panel: it parses `payloadJson`, draws a `{from,to}`
 * value as a struck-through old chip and a green new one, draws everything
 * else plain, and draws the `prevEventHash` → `eventHash` footer only when the
 * hashes are there. Re-drawing it here would fork the one piece of this board
 * that already exists.
 */
export type AuditLogProps = {
  events: AuditLogEvent[];
  /** Total matching the filters, of which `events` is the revealed slice. */
  total: number;
  onShowMore?: () => void;
  /**
   * Draws each row's site after the event chip. On by default; the page turns
   * it off when the log is already scoped to one site, because a fact the
   * subject chip already states does not belong repeated on every row.
   */
  showSite?: boolean;
};

export function AuditLog({ events, total, onShowMore, showSite = true }: AuditLogProps) {
  const days = useMemo(() => groupByDay(events), [events]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set<string>());

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <ol className="m-0 mt-[22px] list-none p-0">
        {days.map((day) => (
          <Fragment key={day.key}>
            <li className="flex items-center gap-3 pt-1.5 pb-[14px]">
              <span
                aria-hidden="true"
                className="w-7 shrink-0 text-center font-mono text-[11px] leading-[1.5] font-medium text-[#8A91A0] tabular-nums"
              >
                &middot;
              </span>
              <h2 className="m-0 text-[13px] leading-[1.4] font-semibold text-[#16181D]">
                {day.label}
              </h2>
              <span className="font-mono text-[11px] leading-[1.5] font-medium text-[#5E6573] tabular-nums">
                {day.events.length} {day.events.length === 1 ? "event" : "events"}
              </span>
            </li>

            {day.events.map((event) => (
              <AuditRow
                key={event.id}
                event={event}
                showSite={showSite}
                open={open.has(event.id)}
                onToggle={() => toggle(event.id)}
              />
            ))}
          </Fragment>
        ))}
      </ol>

      {/*
        The board's footer carries a green shield beside the pager count. It is
        not drawn: nothing on this route walks `prevEventHash` back to the first
        event, and `lib/audit/platform.ts` is explicit that arrival order proves
        nothing about the chain. The count is what this page can honestly say.
      */}
      <div className="mt-1.5 flex items-center gap-2.5 border-t border-[#EEF0F4] pt-[14px]">
        {onShowMore ? (
          <button
            type="button"
            onClick={onShowMore}
            className="inline-flex h-7 items-center rounded-lg border border-[#E5E8EE] bg-white px-2.5 text-[12px] leading-[1.4] font-medium text-[#16181D] hover:bg-[#F7F8FA] focus-visible:border-[#0B5DF0] focus-visible:shadow-[0_0_0_3px_rgba(11,93,240,.22)] focus-visible:outline-none"
          >
            Show more
          </button>
        ) : null}
        <span className="flex-1" />
        <span className="font-mono text-[11px] leading-[1.5] font-medium text-[#5E6573] tabular-nums">
          {events.length} of {total}
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * One row
 * ------------------------------------------------------------------ */

function AuditRow({
  event,
  showSite,
  open,
  onToggle,
}: {
  event: AuditLogEvent;
  showSite: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = hasPayload(event);
  const panelId = `audit-payload-${event.id.replace(/[^a-zA-Z0-9-]/g, "-")}`;

  const top = (
    <>
      <span className="text-[13px] leading-[1.4] font-medium text-[#16181D]">
        {event.summary}
      </span>
      <span className="flex-1" />
      {/*
        Not on the board, which draws a row already open and so never had to
        draw the way in. Every row here has a payload, and a line that does
        something with no mark saying so is a line nobody clicks. The mark is
        the disclosure caret, in the ramp's faint ink so it stays behind the
        timestamp it sits beside.
      */}
      {expandable ? (
        <ChevronRight
          aria-hidden="true"
          className={cn(
            "size-3 shrink-0 self-center text-[#8A91A0] transition-transform",
            open && "rotate-90",
          )}
        />
      ) : null}
      <time
        dateTime={event.createdAt}
        className="font-mono text-[11px] leading-[1.5] font-medium whitespace-nowrap text-[#5E6573] tabular-nums"
      >
        {formatTime(event.createdAt)}
      </time>
    </>
  );

  return (
    <li className="flex gap-3">
      <span className="flex shrink-0 flex-col items-center">
        <span
          aria-hidden="true"
          className={cn(
            "grid size-7 shrink-0 place-items-center overflow-hidden rounded-full text-[11px] leading-none font-semibold",
            TONE_RAMPS[event.tone],
          )}
        >
          {initialsOf(event.actor)}
        </span>
        <span className="min-h-3 w-px flex-1 bg-[#EEF0F4]" />
      </span>

      <span className="min-w-0 flex-1 pb-4">
        {expandable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            className="flex w-full items-baseline gap-2 rounded-[5px] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B5DF0]"
          >
            {top}
          </button>
        ) : (
          <span className="flex items-baseline gap-2">{top}</span>
        )}

        <span className="mt-1 flex flex-wrap items-center gap-2">
          {event.actor ? (
            <span className="text-[12px] leading-[1.45] text-[#565C69]">{event.actor}</span>
          ) : null}
          <span
            className={cn(
              "inline-flex h-[19px] items-center rounded-[5px] px-[7px] font-mono text-[11px] leading-none font-medium",
              TONE_RAMPS[event.tone],
            )}
          >
            {event.eventType}
          </span>
          {showSite ? (
            <span className="text-[12px] leading-[1.45] text-[#5E6573]">{event.site}</span>
          ) : null}
        </span>

        {expandable && open ? (
          <span id={panelId} className="block">
            <ActivityPayload event={event} />
          </span>
        ) : null}
      </span>
    </li>
  );
}

/**
 * The five ramps from the contract, on the avatar and on the chip beside it so
 * a row reads as one thing — the same pairs the shared trail's CSS uses.
 */
const TONE_RAMPS: Record<ActivityTone, string> = {
  neutral: "bg-[#F1F3F6] text-[#565C69]",
  brand: "bg-[#E8EFFE] text-[#0944C2]",
  success: "bg-[#E7EFE0] text-[#2E5526]",
  warn: "bg-[#F4E6C5] text-[#6B4A12]",
  danger: "bg-[#F6E2DD] text-[#7A2419]",
};

/* ------------------------------------------------------------------ *
 * Day grouping
 * ------------------------------------------------------------------ */

type AuditDay = { key: string; label: string; events: AuditLogEvent[] };

/**
 * Events arrive newest first and stay that way; the groups are built in
 * arrival order rather than sorted again, so a day heading can never appear
 * before an event it does not head.
 */
function groupByDay(events: AuditLogEvent[]): AuditDay[] {
  const days: AuditDay[] = [];

  for (const event of events) {
    const date = new Date(event.createdAt);
    if (Number.isNaN(date.getTime())) continue;

    const key = format(date, "yyyy-MM-dd");
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
      continue;
    }
    days.push({ key, label: dayLabel(date), events: [event] });
  }

  return days;
}

function dayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (date.getFullYear() === new Date().getFullYear()) return format(date, "d MMMM");
  return format(date, "d MMMM yyyy");
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "HH:mm");
}

/**
 * The actor is a person's name on all three sources, but "System" and a bare
 * email both turn up, so the same defensive split the shared trail uses is
 * used here.
 */
function initialsOf(name: string | null): string {
  if (!name) return "·";
  const parts = name
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "·";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}
