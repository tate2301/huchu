import * as React from "react";
import Link from "next/link";

import { History, ShieldCheck } from "@/lib/icons";
import { cn } from "@/lib/utils";

import { SectionHeading } from "./section-heading";
import styles from "./settings.module.css";

/**
 * One row of the trail, typed against the real `PlatformAuditEvent`
 * (`prisma/schema.prisma`) rather than against the board.
 *
 * Two things the model does and the drawing does not admit:
 *
 *   - `actor` is a **string id or an email**, not a name. There is no relation
 *     to `User`, so a display name has to be resolved by whoever loads the
 *     rows; `actorName` is where it goes, and the row falls back to the raw
 *     `actor` when it is absent rather than inventing one.
 *   - `payloadJson` is a JSON *string*, not an object.
 *
 * `summary` is presentation: the sentence the row leads with ("Role changed").
 * The model has no such column — the existing `/api/users/[id]/audit` route
 * already composes one as `message`, so this is the field to map it to.
 */
export type ActivityEvent = {
  /** `PlatformAuditEvent.id`. */
  id: string;
  /** `PlatformAuditEvent.eventType` — e.g. `USER.PATCH`. Drawn in the mono chip. */
  eventType: string;
  /** `PlatformAuditEvent.createdAt`. */
  createdAt: string | Date;
  /** The sentence this row leads with. Not a model column. */
  summary: string;
  /** `PlatformAuditEvent.actor` — an id or an email. */
  actor?: string | null;
  /** Resolved separately; the model carries no name. */
  actorName?: string | null;
  /** Initials for the avatar. Derived from `actorName` when omitted. */
  actorInitials?: string | null;
  /** `PlatformAuditEvent.entityType` / `.entityId`. */
  entityType?: string | null;
  entityId?: string | null;
  /** `PlatformAuditEvent.reason`. */
  reason?: string | null;
  /** `PlatformAuditEvent.payloadJson` — a JSON string. */
  payloadJson?: string | null;
  /** `PlatformAuditEvent.eventHash` / `.prevEventHash`. */
  eventHash?: string | null;
  prevEventHash?: string | null;
  /** Overrides the chip tone derived from `eventType`. */
  tone?: ActivityTone;
};

export type ActivityTone = "neutral" | "brand" | "success" | "warn" | "danger";

/**
 * What an event type means, drawn on its chip.
 *
 * Suffix rather than a lookup table, because event types are composed
 * (`SECTION.CREATED`, `USER.PASSWORD_RESET`) and a table would go stale the
 * first time a module added one. Anything unrecognised is neutral, which is
 * the right answer for `USER.LOGIN` and for whatever ships next week.
 */
export function activityToneFor(eventType: string): ActivityTone {
  const verb = eventType.split(".").pop() ?? eventType;
  if (/^(CREATED|CREATE|PUBLISHED|APPROVED|VERIFIED)$/.test(verb)) return "success";
  if (/^(PATCH|UPDATED|UPDATE|CHANGED|RENAMED|MOVED)$/.test(verb)) return "brand";
  if (/^(FAILED|DELETE|DELETED|REVOKED|SUSPENDED|REJECTED)$/.test(verb)) return "danger";
  if (/(RESET|EXPIRED|PENDING|WARNING|LOCKED)$/.test(verb)) return "warn";
  return "neutral";
}

export type ActivityTrailProps = {
  events: ActivityEvent[];
  /** Default "Activity". */
  heading?: string;
  /**
   * The line drawn in place of the rows when there are none.
   *
   * There is always one. A trail handed no events used to draw its heading
   * and its foot with a zero-height list between them, which reads as broken
   * rather than empty — so ten call sites hand-rolled the same heading and
   * the same muted line around it. The section knows what it looks like with
   * nothing in it; the call sites do not have to.
   */
  emptyLabel?: string;
  /**
   * Renders the green "Chain verified" footer.
   *
   * Pass it **only** when a server actually walked `prevEventHash` back to the
   * first event. `lib/audit/platform.ts` documents that concurrent writes share
   * a predecessor and fork the chain, so row order proves nothing — a shield
   * drawn from the order rows arrived in is a false assertion about tamper
   * evidence, which is the one claim this footer exists to make. Leave it
   * undefined and no claim is made.
   */
  chainVerified?: boolean;
  /** Link to the full log. Omitted, no link is drawn. */
  fullLogHref?: string;
  fullLogLabel?: string;
  /** Formats the right-aligned timestamp. Default: `6 Jan 2026`. */
  formatTime?: (value: string | Date) => string;
  /**
   * Draws the expandable `payloadJson` diff and the `prevEventHash`/`eventHash`
   * pair under each row that has them. Off by default: the per-record trail is
   * rows only, and the record route does not select those columns today.
   */
  showPayload?: boolean;
  maxWidth?: number;
  className?: string;
};

/**
 * The Activity section every record ends with — including when it has nothing
 * in it.
 *
 * The empty case is the component's own: heading, one muted line, and the way
 * out to the full log. It used to be the caller's, and ten call sites wrote
 * the same three elements with the same sentence in them.
 *
 * Deliberately not the design system's `Activity` / `Activity.Item`: that API
 * is `{ icon, text, time, tone }` with no slot between the actor and the time,
 * and the mono event-type chip goes exactly there. Stuffing the chip into
 * `text` would put it before the actor and leave the tone prop doing nothing.
 */
export function ActivityTrail({
  events,
  heading = "Activity",
  emptyLabel = "No activity recorded yet.",
  chainVerified,
  fullLogHref,
  fullLogLabel = "The full log",
  formatTime = defaultFormatTime,
  showPayload = false,
  maxWidth = 470,
  className,
}: ActivityTrailProps) {
  const empty = events.length === 0;
  /* No rows, no chain: `prevEventHash` walks nothing, so the shield would be
     asserting tamper evidence about an empty set. The way out to the full log
     still belongs here — it is the one place that does have rows. */
  const showChain = chainVerified === true && !empty;
  const showFoot = showChain || Boolean(fullLogHref);

  return (
    <div className={className}>
      <SectionHeading icon={History} maxWidth={maxWidth}>
        {heading}
      </SectionHeading>

      {empty ? (
        <p className={styles.activityEmpty} style={{ maxWidth }}>
          {emptyLabel}
        </p>
      ) : (
        <ol className={styles.activity} style={{ maxWidth }}>
          {events.map((event) => {
            const tone = event.tone ?? activityToneFor(event.eventType);
            const name = event.actorName ?? event.actor ?? null;

            return (
              <li key={event.id} className={styles.activityRow}>
                <span className={styles.activityGutter}>
                  <span
                    className={styles.activityAvatar}
                    data-tone={tone}
                    aria-hidden="true"
                  >
                    {event.actorInitials ?? initialsOf(name)}
                  </span>
                  <span className={styles.activityLine} />
                </span>

                <span className={styles.activityBody}>
                  <span className={styles.activityTop}>
                    <span className={styles.activitySummary}>{event.summary}</span>
                    <span className={styles.spacer} />
                    <time
                      className={styles.activityTime}
                      dateTime={toIso(event.createdAt)}
                    >
                      {formatTime(event.createdAt)}
                    </time>
                  </span>
                  <span className={styles.activityMeta}>
                    {name ? <span className={styles.activityActor}>{name}</span> : null}
                    <span className={styles.activityChip} data-tone={tone}>
                      {event.eventType}
                    </span>
                  </span>
                  {showPayload ? <ActivityPayload event={event} /> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {showFoot ? (
        <div className={styles.activityFoot} style={{ maxWidth }}>
          {showChain ? (
            <span className={styles.activityChain}>
              <ShieldCheck />
              Chain verified
            </span>
          ) : null}
          <span className={styles.spacer} />
          {fullLogHref ? (
            <Link href={fullLogHref} className={styles.activityLink}>
              <History />
              {fullLogLabel}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export type ActivityPayloadProps = {
  event: Pick<ActivityEvent, "payloadJson" | "reason" | "eventHash" | "prevEventHash">;
  className?: string;
};

/**
 * The expanded payload from `Audit.dc.html`: the parsed `payloadJson`, then
 * the `prevEventHash` → `eventHash` pair.
 *
 * `payloadJson` is a string and may be anything, so a parse failure renders
 * nothing rather than throwing inside a list. A value shaped
 * `{ from, to }` is drawn as a struck-through old value and a green new one;
 * anything else is drawn plain.
 */
export function ActivityPayload({ event, className }: ActivityPayloadProps) {
  const entries = parsePayload(event.payloadJson);
  const hasHashes = Boolean(event.eventHash ?? event.prevEventHash);

  if (entries.length === 0 && !event.reason && !hasHashes) return null;

  return (
    <span className={cn(styles.payload, className)}>
      <span className={styles.payloadHead}>payloadJson</span>
      <span className={styles.payloadBody}>
        {entries.map((entry) => (
          <span key={entry.key} className={styles.payloadEntry}>
            <span className={styles.payloadKey}>{entry.key}</span>
            {entry.from !== undefined ? (
              <>
                <span
                  className={cn(styles.statusBadge, styles.payloadWas)}
                  data-tone="danger"
                >
                  {entry.from}
                </span>
                <span className={styles.payloadArrow} aria-hidden="true">
                  &rarr;
                </span>
                <span className={styles.statusBadge} data-tone="success">
                  {entry.to}
                </span>
              </>
            ) : (
              <span className={styles.payloadValue}>{entry.to}</span>
            )}
          </span>
        ))}
        {event.reason ? (
          <span className={styles.payloadEntry}>
            <span className={styles.payloadKey}>reason</span>
            <span className={styles.payloadValue}>{event.reason}</span>
          </span>
        ) : null}
      </span>
      {hasHashes ? (
        <span className={styles.payloadFoot}>
          <span className={styles.payloadPrev}>
            prev {shortHash(event.prevEventHash) ?? "—"}
          </span>
          <span className={styles.payloadArrow} aria-hidden="true">
            &rarr;
          </span>
          <span className={styles.payloadHash}>hash {shortHash(event.eventHash)}</span>
        </span>
      ) : null}
    </span>
  );
}

type PayloadEntry = { key: string; from?: string; to: string };

function parsePayload(payloadJson: string | null | undefined): PayloadEntry[] {
  if (!payloadJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadJson);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];

  return Object.entries(parsed as Record<string, unknown>).map(([key, value]) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const shape = value as { from?: unknown; to?: unknown };
      if (shape.to !== undefined) {
        return {
          key,
          from: shape.from === undefined ? undefined : stringify(shape.from),
          to: stringify(shape.to),
        };
      }
    }
    return { key, to: stringify(value) };
  });
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function shortHash(hash: string | null | undefined): string | null {
  if (!hash) return null;
  return hash.slice(0, 8);
}

function initialsOf(name: string | null): string {
  if (!name) return "·";
  const parts = name.replace(/@.*$/, "").split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "·";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

const DEFAULT_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function defaultFormatTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return DEFAULT_TIME_FORMAT.format(date);
}
