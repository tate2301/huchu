"use client";

import * as React from "react";

import { Button, ButtonLink, Icon, Select } from "@/components/core";
import type { NeedsPostingQuery, NeedsPostingRow, NeedsPostingTab, NeedsPostingView } from "@/lib/books/needs-posting";

import { BkTabs } from "./bk-list";
import { BooksFinding, Cents } from "./figures";

export type NeedsPostingData = NeedsPostingView & {
  can: { retry: boolean; map: boolean; redate: boolean };
  accounts: Array<{ id: string; code: string; name: string }>;
};

/** This month's name, for "Post in October". */
const thisMonth = () => new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Africa/Harare" }).format(new Date());

/** The one thing that lets a row post: map the account, add the rule, post it in this month, or Retry. */
function RowAction({
  row,
  can,
  accounts,
  busy,
  onRetry,
  onMap,
  onRedate,
}: {
  row: NeedsPostingRow;
  can: NeedsPostingData["can"];
  accounts: NeedsPostingData["accounts"];
  busy: boolean;
  onRetry: () => void;
  onMap: (accountId: string) => void;
  onRedate: () => void;
}) {
  const [account, setAccount] = React.useState("");
  React.useEffect(() => setAccount(""), [row.id]);
  const fix = row.fix;
  if (fix?.kind === "map" && can.map) {
    return (
      <span className="bkc-map">
        <Select aria-label={fix.label} value={account} onChange={(event) => setAccount(event.target.value)}>
          <option value="">Choose an account</option>
          {accounts.map((option) => (
            <option key={option.id} value={option.id}>
              {option.code} {option.name}
            </option>
          ))}
        </Select>
        <Button icon="check" disabled={busy || !account} onClick={() => onMap(account)}>
          Map and post
        </Button>
      </span>
    );
  }
  if (fix?.kind === "rule") {
    return (
      <ButtonLink icon="posting" href={fix.href}>
        {fix.label}
      </ButtonLink>
    );
  }
  if (fix?.kind === "month") {
    return can.redate ? (
      <Button icon="check" disabled={busy} onClick={onRedate}>
        Post in {thisMonth()}
      </Button>
    ) : null;
  }
  return can.retry && !row.held ? (
    <Button icon="arrow" disabled={busy} onClick={onRetry}>
      Retry
    </Button>
  ) : null;
}

/** The rows of one list, dense, one line each. The waiting list under Failed has no head of its own. */
function EventTable({
  data,
  head,
  waiting,
  busy,
  onRetry,
  onMap,
  onRedate,
}: {
  data: NeedsPostingData;
  head: boolean;
  waiting: boolean;
  busy: boolean;
  onRetry: (ids: string[]) => void;
  onMap: (id: string, accountId: string) => void;
  onRedate: (id: string) => void;
}) {
  const from = (sourceType: string) => data.sources.find((option) => option.value === sourceType)?.label ?? sourceType;
  return (
    <div className="bkd-wrap">
      <table className="table bkd" aria-label={waiting ? "Waiting over an hour" : "Failed to post"}>
        <colgroup>
          <col style={{ width: 190 }} />
          <col style={{ width: "30%" }} />
          <col style={{ width: 130 }} />
          <col />
          <col style={{ width: 110 }} />
          <col style={{ width: 320 }} />
        </colgroup>
        {head ? (
          <thead>
            <tr>
              <th>From</th>
              <th>Document</th>
              <th>Date</th>
              <th>Why it failed</th>
              <th className="num">Amount</th>
              <th />
            </tr>
          </thead>
        ) : null}
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.id}>
              <td>{from(row.sourceType)}</td>
              <td>
                <span className="cell-lead">
                  {row.ref ? <span className="ref">{row.ref}</span> : null} {row.href ? <a href={row.href}>{row.title}</a> : row.title}
                </span>
                {row.sub ? <span className="bkc-sub">{row.sub}</span> : null}
              </td>
              <td className="muted">{waiting ? `Queued ${row.since}` : row.since}</td>
              <td className={waiting ? "muted" : undefined} title={row.why}>
                {waiting ? (row.tries.next === "Next run" ? "Tries again on the next run" : `Next try ${row.tries.next}`) : row.why}
              </td>
              <td className="num">{row.amount === null ? <span className="muted">—</span> : <Cents value={row.amount} currency={row.currency} />}</td>
              <td style={{ textAlign: "right" }}>
                <RowAction row={row} can={data.can} accounts={data.accounts} busy={busy} onRetry={() => onRetry([row.id])} onMap={(accountId) => onMap(row.id, accountId)} onRedate={() => onRedate(row.id)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Close the month → Needs posting (design/books/html/bk-needs-posting.html):
 * the finding, Failed and Waiting, the failed events with their fix on the row,
 * and under Failed the events waiting over an hour. Nothing is dropped.
 */
export function NeedsPostingPageView({
  data,
  waiting,
  busy,
  onQuery,
  onRetry,
  onMap,
  onRedate,
}: {
  data: NeedsPostingData;
  /** The events waiting over an hour, shown under Failed. */
  waiting: NeedsPostingData | null;
  busy: boolean;
  onQuery: (next: Partial<NeedsPostingQuery>) => void;
  onRetry: (ids: string[]) => void;
  onMap: (id: string, accountId: string) => void;
  onRedate: (id: string) => void;
}) {
  const tab = data.query.tab;
  const under = tab === "failed" && waiting && waiting.rows.length > 0 ? waiting : null;
  return (
    <div className="bk bkc">
      <BooksFinding finding={data.finding} />
      <BkTabs<NeedsPostingTab>
        label="Needs posting"
        value={tab}
        onChange={(next) => onQuery({ tab: next })}
        items={[
          { value: "failed", label: "Failed", count: data.counts.failed },
          { value: "waiting", label: "Waiting", count: data.counts.waiting },
        ]}
      />
      {data.rows.length === 0 ? (
        <div className="bkc-list">
          <div className="bkc-ck">
            <span className="bkc-i">
              <Icon name="done" />
            </span>
            <span className="bkc-t">
              <b>{tab === "failed" ? "Nothing failed to post" : "Nothing is waiting"}</b>
            </span>
          </div>
        </div>
      ) : (
        <EventTable data={data} head waiting={tab === "waiting"} busy={busy} onRetry={onRetry} onMap={onMap} onRedate={onRedate} />
      )}
      {under ? (
        <>
          <div className="bkc-band">
            <h2>Waiting, over an hour</h2>
            <span className="bkc-sum">{under.rows.length}</span>
          </div>
          <EventTable data={under} head={false} waiting busy={busy} onRetry={onRetry} onMap={onMap} onRedate={onRedate} />
        </>
      ) : null}
    </div>
  );
}
