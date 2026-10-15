"use client";

import * as React from "react";

import { Button, ButtonLink, Drawer, DrawerSection, Empty, Status } from "@/components/core";
import { fullTime, initialsOf, INBOX_MODULES, type Change } from "@/lib/inbox/describe";
import type { InboxDetail } from "@/lib/inbox/query";

import { ArrowTo, plainSentence, Sentence, WithArrows } from "./inbox-row";
import styles from "./inbox.module.css";

/**
 * One level deeper than the row: the record as a fact list, what changed,
 * the thread, and the one action, which opens the record in its module. The
 * drawer never acts on the record itself.
 */
export function InboxDrawerView({
  open,
  onOpenChange,
  detail,
  loading,
  error,
  onRetry,
  onArchive,
  archiving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: InboxDetail | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onArchive: () => void;
  archiving: boolean;
}) {
  // The record is the title; the sentence opens the body, so neither is said twice.
  const title = detail ? (detail.concern?.ref ?? plainSentence(detail.sentence)) : loading ? "Loading" : "Notification";
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={480}
      title={title}
      sub={detail ? `${INBOX_MODULES[detail.module].label} · ${detail.at}` : undefined}
      footer={
        detail ? (
          <div className={styles.drawerFoot}>
            <Button variant="quiet" onClick={onArchive} busy={archiving}>
              Archive
            </Button>
            {detail.action ? (
              <ButtonLink variant="primary" href={detail.action.href} shortcut="↵">
                {detail.action.label}
              </ButtonLink>
            ) : null}
          </div>
        ) : null
      }
    >
      {detail ? (
        <DetailBody detail={detail} />
      ) : error ? (
        <Empty
          icon="warn"
          title="This notification did not load"
          action={
            <Button icon="history" onClick={onRetry}>
              Try again
            </Button>
          }
        >
          {error}
        </Empty>
      ) : (
        <div aria-busy="true" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0" }}>
          <div className="skeleton" style={{ height: 14, width: "70%" }} />
          <div className="skeleton" style={{ height: 14, width: "50%" }} />
          <div className="skeleton" style={{ height: 14, width: "60%" }} />
        </div>
      )}
    </Drawer>
  );
}

function DetailBody({ detail }: { detail: InboxDetail }) {
  const lede = detail.second && detail.thread.length === 0 && detail.changes.length === 0 ? detail.second : null;
  return (
    <>
      <p className={styles.drawerLede}>
        <Sentence segments={detail.sentence} />.
        {lede ? (
          <>
            {" "}
            <WithArrows text={lede} />.
          </>
        ) : null}
      </p>

      {detail.concern ? (
        <DrawerSection title="About">
          <dl className={styles.facts}>
            <dt>Record</dt>
            <dd>
              <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 10, alignItems: "baseline" }}>
                <span style={{ fontWeight: 500 }}>{detail.concern.ref}</span>
                {detail.concern.status ? (
                  <Status tone={detail.concern.status.tone ?? undefined}>{detail.concern.status.label}</Status>
                ) : null}
              </span>
            </dd>
            {detail.facts
              .filter((fact) => fact.value !== detail.concern?.ref && fact.value !== detail.concern?.status?.label)
              .map((fact) => (
                <React.Fragment key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </React.Fragment>
              ))}
          </dl>
        </DrawerSection>
      ) : null}

      {detail.changes.length > 0 ? (
        <DrawerSection title="What changed">
          <ChangeList changes={detail.changes} />
        </DrawerSection>
      ) : null}

      {detail.thread.length > 0 ? (
        <DrawerSection title={detail.thread.length > 1 ? "Thread" : "Comment"}>
          <ol className={styles.thread}>
            {detail.thread.map((post, index) => (
              <li className={styles.post} key={index}>
                <span className={styles.who}>{initialsOf(post.author)}</span>
                <span className={styles.postHead}>
                  <b>{post.author}</b>
                  <time dateTime={post.at}>{fullTime(post.at)}</time>
                </span>
                <p className={styles.postBody}>{post.body}</p>
              </li>
            ))}
          </ol>
        </DrawerSection>
      ) : null}
    </>
  );
}

export function ChangeList({ changes }: { changes: Change[] }) {
  return (
    <dl className={styles.facts}>
      {changes.map((change, index) => (
        <React.Fragment key={`${change.label}-${index}`}>
          <dt>{change.label}</dt>
          <dd className={styles.change}>
            {change.from ? (
              <>
                <span className={styles.from}>{change.from}</span>
                <ArrowTo />
              </>
            ) : null}
            <span>{change.to ?? "Cleared"}</span>
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}
