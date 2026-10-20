"use client";

import * as React from "react";

import { Drawer, DrawerSection, type IconName } from "@/components/core";
import type { ActivityLogEntry } from "@/lib/activity/api";
import { humanizeField, humanizeModel } from "@/lib/activity/describe";
import { fullTime, initialsOf, type Segment } from "@/lib/inbox/describe";

import { ArrowTo, plainSentence, type RowModel } from "./inbox-row";
import styles from "./inbox.module.css";

/**
 * The workspace's audit trail as rows of the same kind: who changed what,
 * with the record as the concern and the fields it set as the second line.
 * Its entries are `GET /api/activity`'s, unchanged.
 */

const AREA_ICON: Record<string, IconName> = {
  accounting: "books",
  approvals: "check",
  compensation: "money",
  compliance: "inspections",
  crm: "pipeline",
  disbursements: "money",
  gold: "measure",
  maintenance: "inspections",
  payroll: "money",
  people: "users",
  retail: "store",
  schools: "training",
  settings: "gear",
  settlements: "money",
  stores: "store",
  users: "users",
};

function lowerFirst(text: string) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export function entrySentence(entry: ActivityLogEntry): Segment[] {
  const what = entry.actor ? `${entry.actor.name} ${lowerFirst(entry.summary)}` : entry.summary;
  return entry.recordLabel ? [{ text: `${what} ` }, { text: entry.recordLabel, strong: true }] : [{ text: what }];
}

/** A stored value as words: "MUTED" → "Muted", an ISO time → "14 Oct 2026, 13:06". */
export function fieldValue(value: string): string {
  if (/^[A-Z][A-Z0-9_]+$/.test(value)) return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return fullTime(value);
  return value;
}

function fieldsLine(entry: ActivityLogEntry): string | null {
  const fields = entry.changes[0]?.fields ?? [];
  if (fields.length === 0) return entry.reason ?? null;
  const shown = fields.slice(0, 3).map((field) => (field.value !== undefined ? `${humanizeField(field.name)} ${fieldValue(field.value)}` : humanizeField(field.name)));
  const rest = fields.length - shown.length;
  return `${shown.join(" · ")}${rest > 0 ? ` · ${rest} more` : ""}`;
}

export function rowFromEntry(entry: ActivityLogEntry): RowModel {
  const first = entry.changes[0];
  const ref = entry.recordLabel ?? (first ? humanizeModel(first.model) : null);
  return {
    id: entry.id,
    createdAt: entry.createdAt,
    unread: false,
    who: entry.actor
      ? { kind: "person", name: entry.actor.name, initials: initialsOf(entry.actor.name), image: entry.actor.image ?? null }
      : { kind: "module", icon: AREA_ICON[entry.module ?? ""] ?? "activity", label: entry.moduleLabel ?? "Workspace" },
    sentence: entrySentence(entry),
    concern: ref
      ? {
          icon: AREA_ICON[entry.module ?? ""] ?? "activity",
          ref,
          fact: [first ? humanizeModel(first.model) : null, entry.moduleLabel].filter((part) => part && part !== ref).join(" · ") || null,
          status: null,
        }
      : null,
    second: fieldsLine(entry),
    preferSecond: true,
    href: null,
  };
}

export function TrailDrawer({
  entry,
  open,
  onOpenChange,
}: {
  entry: ActivityLogEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={480}
      title={entry ? plainSentence(entrySentence(entry)) : "Change"}
      sub={entry ? `${entry.moduleLabel ?? "Workspace"} · ${fullTime(entry.createdAt)}` : undefined}
    >
      {entry ? (
        <>
          <DrawerSection title="About">
            <dl className={styles.facts}>
              <dt>Who</dt>
              <dd>{entry.actor ? `${entry.actor.name}${entry.actor.email ? `, ${entry.actor.email}` : ""}` : "The system"}</dd>
              {entry.recordLabel ? (
                <>
                  <dt>Record</dt>
                  <dd style={{ fontWeight: 500 }}>{entry.recordLabel}</dd>
                </>
              ) : null}
              {entry.moduleLabel ? (
                <>
                  <dt>Module</dt>
                  <dd>{entry.moduleLabel}</dd>
                </>
              ) : null}
              <dt>When</dt>
              <dd>{fullTime(entry.createdAt)}</dd>
              {entry.reason ? (
                <>
                  <dt>Reason</dt>
                  <dd>{entry.reason}</dd>
                </>
              ) : null}
            </dl>
          </DrawerSection>
          {entry.changes.length > 0 ? (
            <DrawerSection title="What changed">
              <dl className={styles.facts}>
                {entry.changes.map((change, index) => (
                  <React.Fragment key={index}>
                    <dt>
                      {humanizeModel(change.model)}
                      {change.label ? `, ${change.label}` : ""}
                    </dt>
                    <dd>
                      {change.fields && change.fields.length > 0 ? (
                        <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {change.fields.map((field) => (
                            <span key={field.name} className={styles.change}>
                              <span style={{ color: "var(--color-muted)" }}>{humanizeField(field.name)}</span>
                              <ArrowTo />
                              <span>{field.value !== undefined ? fieldValue(field.value) : "Changed"}</span>
                            </span>
                          ))}
                        </span>
                      ) : change.count ? (
                        `${change.action === "deleted" ? "Deleted" : change.action === "created" ? "Created" : "Updated"} ${change.count}`
                      ) : change.action === "deleted" ? (
                        "Deleted"
                      ) : change.action === "created" ? (
                        "Created"
                      ) : (
                        "Updated"
                      )}
                    </dd>
                  </React.Fragment>
                ))}
                {entry.more > 0 ? (
                  <>
                    <dt />
                    <dd style={{ color: "var(--color-muted)" }}>And {entry.more} more</dd>
                  </>
                ) : null}
              </dl>
              <p style={{ margin: "8px 0 0", fontSize: "var(--text-12)", color: "var(--color-muted)" }}>
                The trail keeps the values a change set, not the ones before it.
              </p>
            </DrawerSection>
          ) : null}
        </>
      ) : (
        <p className={styles.quiet}>This change is not in the loaded list. Close this and find it in the trail.</p>
      )}
    </Drawer>
  );
}
