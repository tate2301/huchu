"use client";

import * as React from "react";
import Link from "next/link";

import { Avatar, Icon, Status, VaneMark, type IconName } from "@/components/core";
import { fullTime, INBOX_MODULES, relativeTime, type InboxModule, type Segment, type SubjectKind } from "@/lib/inbox/describe";
import type { InboxItem } from "@/lib/inbox/query";

import styles from "./inbox.module.css";

/**
 * One notification, one row: who, what happened in one sentence, what it
 * concerns as a small chip, an optional second line, and the time. Mark read
 * and Open appear on hover or focus. The bell, /activity and the workspace
 * trail all draw this row.
 */

export type RowWho =
  | { kind: "person"; name: string; initials: string; image?: string | null }
  | { kind: "module"; icon: IconName; label: string }
  | { kind: "vane" };

export type RowConcern = {
  icon: IconName;
  ref: string;
  fact: string | null;
  status: { label: string; tone: "success" | "warning" | "danger" | "info" | "live" | null } | null;
};

export type RowModel = {
  id: string;
  createdAt: string;
  unread: boolean;
  who: RowWho;
  sentence: Segment[];
  concern: RowConcern | null;
  second: string | null;
  /** Narrow, line two holds one thing: the second line when it is what changed or what was said, else the concern. */
  preferSecond: boolean;
  href: string | null;
};

const KIND_ICON: Record<SubjectKind, IconName> = {
  invoice: "invoice",
  receipt: "payments",
  deal: "pipeline",
  lead: "target",
  comment: "pipeline",
  leave: "calendar",
  report: "reports",
  vane: "foryou",
  "payroll-run": "money",
  disbursement: "money",
  incident: "incidents",
  "hr-incident": "incidents",
  permit: "permits",
  "work-order": "inspections",
  task: "check",
  requisition: "file",
};

export function moduleIcon(module: InboxModule | string): IconName {
  return ((INBOX_MODULES as Record<string, { icon: string }>)[module]?.icon ?? "bell") as IconName;
}

/** A notification as a row. */
export function rowFromItem(item: InboxItem): RowModel {
  const meta = INBOX_MODULES[item.module];
  return {
    id: item.id,
    createdAt: item.createdAt,
    unread: !item.isRead,
    who: item.actor
      ? { kind: "person", name: item.actor.name, initials: item.actor.initials, image: item.actor.image ?? null }
      : item.module === "vane"
        ? { kind: "vane" }
        : { kind: "module", icon: meta.icon as IconName, label: meta.label },
    sentence: item.sentence,
    concern: item.concern
      ? { icon: KIND_ICON[item.concern.kind] ?? moduleIcon(item.module), ref: item.concern.ref, fact: item.concern.fact, status: item.concern.status }
      : null,
    second: item.second,
    preferSecond: !item.concern || item.concern.kind === "comment" || (item.second ?? "").includes(" → "),
    href: item.href,
  };
}

function Who({ who }: { who: RowWho }) {
  if (who.kind === "vane") {
    return (
      <span className={styles.who} style={{ background: "transparent" }} title="Vane">
        <VaneMark size={20} />
      </span>
    );
  }
  if (who.kind === "module") {
    return (
      <span className={styles.who} data-system="true" title={who.label}>
        <Icon name={who.icon} />
      </span>
    );
  }
  // A person: their avatar, the kit's (photo, else initials on their tint).
  return <Avatar name={who.name} src={who.image} size={24} title={who.name} />;
}

export function Sentence({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.strong ? <strong key={index}>{segment.text}</strong> : <React.Fragment key={index}>{segment.text}</React.Fragment>,
      )}
    </>
  );
}

export function ConcernChip({ concern, className, hideRef = false }: { concern: RowConcern; className?: string; hideRef?: boolean }) {
  const showRef = !hideRef || !concern.fact;
  return (
    <span className={[styles.chip, className].filter(Boolean).join(" ")}>
      <Icon name={concern.icon} />
      <span className={styles.chipText}>
        {showRef ? <span className={styles.chipRef}>{concern.ref}</span> : null}
        {concern.fact ? `${showRef ? " · " : ""}${concern.fact}` : null}
      </span>
      {concern.status ? <Status tone={concern.status.tone ?? undefined}>{concern.status.label}</Status> : null}
    </span>
  );
}

/** The kit's chevron where a change reads "from → to"; a screen reader hears "to". */
export function ArrowTo() {
  return (
    <span role="img" aria-label="to" className={styles.arrowWrap}>
      <Icon name="chev" className={styles.arrowIcon} />
    </span>
  );
}

/** "Due 3 Nov → 10 Nov" with the kit's chevron in place of the arrow glyph. */
export function WithArrows({ text }: { text: string }) {
  const parts = text.split(" → ");
  return (
    <>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 ? (
            <>
              {" "}
              <ArrowTo />{" "}
            </>
          ) : null}
          {part}
        </React.Fragment>
      ))}
    </>
  );
}

export function plainSentence(segments: Segment[]) {
  return segments.map((segment) => segment.text).join("");
}

export const InboxRow = React.forwardRef<
  HTMLElement,
  {
    row: RowModel;
    now: Date;
    selected?: boolean;
    /** Link: the row goes to the record. Button: the row calls `onActivate` (opens the drawer). */
    as?: "link" | "button";
    onActivate?: () => void;
    onMarkRead?: () => void;
    /** Where Open goes; the row's own record when not given. */
    openHref?: string | null;
    onOpen?: () => void;
    onFocus?: () => void;
  }
>(function InboxRow({ row, now, selected = false, as = "button", onActivate, onMarkRead, openHref, onOpen, onFocus }, ref) {
  const time = relativeTime(row.createdAt, now);
  const label = plainSentence(row.sentence);
  const href = openHref === undefined ? row.href : openHref;
  // Under the sentence, a reference the sentence already names in bold is not said twice.
  const named = !!row.concern && row.sentence.some((segment) => segment.strong && segment.text === row.concern?.ref);

  const inside = (
    <>
      <Who who={row.who} />
      <span className={styles.body}>
        <span className={styles.line1}>
          <span className={styles.sentence}>
            <Sentence segments={row.sentence} />
          </span>
          {row.concern ? <ConcernChip concern={row.concern} className={styles.chipWide} /> : null}
        </span>
        {row.concern || row.second ? (
          <span className={styles.line2} data-narrow-only={row.second ? undefined : "true"}>
            {/* Wide, line two is the second line. Narrow, it holds one thing: what changed or was said, else the concern. */}
            {row.second && (row.preferSecond || !row.concern) ? (
              <span className={styles.second}>
                <WithArrows text={row.second} />
              </span>
            ) : (
              <>
                {row.concern ? <ConcernChip concern={row.concern} className={styles.chipNarrow} hideRef={named} /> : null}
                {row.second ? (
                  <span className={`${styles.second} ${styles.wideOnly}`}>
                    <WithArrows text={row.second} />
                  </span>
                ) : null}
              </>
            )}
          </span>
        ) : null}
      </span>
      <span className={styles.meta}>
        <time dateTime={row.createdAt} title={fullTime(row.createdAt)}>
          {time}
        </time>
        {row.unread ? <span className={styles.dot} aria-label="Unread" role="img" /> : <span className={styles.dotOff} aria-hidden="true" />}
      </span>
    </>
  );

  return (
    <li className={styles.row} data-unread={row.unread} data-selected={selected} data-inbox-row={row.id}>
      {as === "link" && row.href ? (
        <Link
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={row.href}
          className={styles.main}
          onClick={onActivate}
          onFocus={onFocus}
          aria-label={`${label}${row.unread ? ", unread" : ""}, ${time}`}
        >
          {inside}
        </Link>
      ) : (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          className={styles.main}
          onClick={onActivate}
          onFocus={onFocus}
          aria-label={`${label}${row.unread ? ", unread" : ""}, ${time}`}
        >
          {inside}
        </button>
      )}
      {onMarkRead || href ? (
        <span className={styles.acts}>
          {row.unread && onMarkRead ? (
            <button type="button" className={styles.act} onClick={onMarkRead} aria-label={`Mark read: ${label}`} aria-keyshortcuts="E">
              <Icon name="check" />
              Mark read
            </button>
          ) : null}
          {href ? (
            <Link href={href} className={styles.act} onClick={onOpen} aria-label={`Open: ${label}`}>
              Open
              <kbd>↵</kbd>
            </Link>
          ) : null}
        </span>
      ) : null}
    </li>
  );
});

/** Rows waiting for data: the row's own shape, so nothing jumps. */
export function InboxSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading notifications">
      {Array.from({ length: rows }, (_, index) => (
        <div className={styles.skeletonRow} key={index}>
          <span />
          <span style={{ width: `${[72, 58, 80, 64, 50, 70][index % 6]}%` }} />
          <span />
        </div>
      ))}
    </div>
  );
}
