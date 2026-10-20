"use client";

/**
 * Waiting to send (T8-3, T8-5): the sales this till took while the line was
 * down. They go up on their own when the line is back, and each is then ticked
 * with the number the server gave it. One the server refused waits for
 * someone, with Send again and Discard. A sale that went up at a price the
 * shop has since changed stays listed with what happened to its price, so
 * nobody finds out from the margins weeks later.
 */

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { fetchJson } from "@/lib/api-client";
import { ArrowsClockwise, ArrowsCounterClockwise, Check, Money, Prohibit, Trash } from "@/lib/icons";
import { classifyQueuedSale, classifyReplayedSale } from "@/lib/retail/offline-queue-verdict";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import {
  NEEDS_A_MANAGER,
  queuedReversalLabel,
  reversalNeedsManager,
  reversalRequest,
  type PosSaleQueuePayload,
} from "@/lib/retail/pos-offline-queue";
import { useApproval } from "./approval";
import { count, hhmm, usd } from "./format";
import { TillDialog } from "./parts";
import { TenderMark } from "./pay-tray";
import { useConnection } from "./connection";
import { useTill } from "./state";
import type { PosCatalogItem } from "./types";

type ReplayedSale = {
  id: string;
  saleNo: string;
  saleType: string;
  postedAt: string;
  customerName: string | null;
  totalAmount: number;
  depositAmount: number;
  notes: string | null;
  overrideReason: string | null;
};

/** The sale's tag until it is sent and numbered, as Paid showed it: the last six of its key. */
function tagOf(payload: PosSaleQueuePayload) {
  return (payload.clientRef ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
}

/*
  The queue forgets a sale once it is sent, and the server's sale does not
  carry the till's tag. Every queued sale this page has seen is kept by when
  it was rung, which is what the server stamps on the sale it replays, so a
  sent sale is ticked against the tag it went by. `sentAt` is when this page
  saw the queue empty. Kept for the browser tab, so a reload keeps them.
*/
const MEMORY_KEY = "till-waiting-sent";
type Memory = { seen: Record<string, string>; sentAt: string | null };

function readMemory(): Memory {
  try {
    const kept = JSON.parse(window.sessionStorage.getItem(MEMORY_KEY) ?? "null") as Memory | null;
    if (kept && typeof kept.seen === "object") return kept;
  } catch {
    // No storage, or something else in it: start empty.
  }
  return { seen: {}, sentAt: null };
}

function writeMemory(memory: Memory) {
  try {
    window.sessionStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
  } catch {
    // Not kept past this page: the rows still show, without their tags after a reload.
  }
}

/** Product names off the shelf this till holds offline: a queued sale carries only product ids. */
function useShelfNames() {
  const queryClient = useQueryClient();
  const names = new Map<string, string>();
  for (const [, page] of queryClient.getQueriesData<{ data: PosCatalogItem[] }>({ queryKey: ["retail-pos-catalog"] })) {
    for (const item of page?.data ?? []) names.set(item.id, item.name);
  }
  return names;
}

export function WaitingScreen() {
  const { queuedOfflineSales, queuedReversals, syncOfflineSales, syncOfflineSalesPending, retryOfflineSale, removeOfflineSale, zig, isPosHost, rules, canApprove, approvers } =
    useTill();
  const approval = useApproval({ approvers: approvers.sell });
  const [approving, setApproving] = React.useState<string | null>(null);
  const { operations } = useOfflineRuntime();
  const { online } = useConnection();
  const names = useShelfNames();
  const zigRate = zig ? Number(zig.rate) : 0;
  const [discarding, setDiscarding] = React.useState<{ id: string; tag: string } | null>(null);
  const [memory, setMemory] = React.useState<Memory>({ seen: {}, sentAt: null });
  const base = getPosPortalHref("history", isPosHost);

  // The outbox knows what a sale is stuck behind (its shift, a new customer); the queue holds the sale.
  const blockedBy = new Map(operations.filter((entry) => entry.blockedByOperationId).map((entry) => [entry.operationId, entry.blockedByOperationId ?? null]));
  const rows = queuedOfflineSales.map((operation) => {
    // What the sale came to, as the till charged it; a sale queued without it, what was handed over (ZiG at today's rate).
    const total =
      operation.payload.total ??
      operation.payload.payments.reduce((sum, payment) => sum + (payment.currency === "ZWG" && zigRate > 0 ? payment.amount / zigRate : payment.amount), 0);
    const verdict = classifyQueuedSale({
      status: operation.status,
      lastError: operation.lastError,
      retryCount: operation.retryCount,
      blockedByOperationId: blockedBy.get(operation.operationId) ?? null,
    });
    return { operation, total, verdict, tag: tagOf(operation.payload) };
  });
  const total = rows.reduce((sum, row) => sum + row.total, 0);

  // Each queued sale is remembered by when it was rung; the moment the queue empties is when they went.
  const queued = rows.length;
  const tags = rows.map((entry) => `${entry.operation.createdAt}|${entry.tag}`).join(",");
  const wasQueued = React.useRef(queued);
  React.useEffect(() => {
    const kept = readMemory();
    for (const entry of tags.split(",").filter(Boolean)) {
      const [at, tag] = entry.split("|");
      kept.seen[at] = tag;
    }
    if (wasQueued.current > 0 && queued === 0 && online) kept.sentAt = new Date().toISOString();
    wasQueued.current = queued;
    writeMemory(kept);
    setMemory(kept);
  }, [tags, queued, online]);

  // Replays that already landed, off my own sales.
  const replayed = useQuery({
    queryKey: ["retail-pos-sales", "offline-replays"],
    queryFn: () => fetchJson<{ data: ReplayedSale[] }>("/api/v2/retail/pos/sales?scope=mine&limit=60"),
    enabled: online,
    staleTime: 30_000,
  });
  const { refetch } = replayed;
  React.useEffect(() => {
    if (online) void refetch();
  }, [queued, online, refetch]);
  // Sent: those this page saw waiting, ticked with their number, and any whose price changed on the way.
  const sent = (replayed.data?.data ?? [])
    .filter((sale) => sale.saleType === "SALE")
    .map((sale) => ({ sale, verdict: classifyReplayedSale(sale) }))
    .filter(({ verdict }) => verdict.kind !== "NOT_A_REPLAY")
    .map((entry) => ({ ...entry, tag: entry.verdict.soldAt ? (memory.seen[entry.verdict.soldAt] ?? null) : null }))
    .filter(({ verdict, tag }) => tag || verdict.kind === "SUPERSEDED" || verdict.kind === "OVERRIDDEN")
    .slice(0, 30)
    .reverse();
  const sentTotal = sent.reduce((sum, { sale }) => sum + sale.totalAmount + sale.depositAmount, 0);

  const row = (entry: (typeof rows)[number]) => {
    const { items, customerId, payments } = entry.operation.payload;
    const refused = entry.operation.status === "FAILED_BLOCKING";
    // A refused sale reads by the product it is about; the rest by who.
    const first = refused && items[0] ? names.get(items[0].productId) : undefined;
    // The queue carries the customer by id only (CUS-02), so the row says whether there was one.
    const who = first ? (items.length > 1 ? `${first} + ${items.length - 1} more` : first) : customerId ? "A customer" : "Walk-in";
    const { verdict } = entry;
    const state =
      refused || verdict.kind === "BLOCKED_BY_ANOTHER"
        ? { label: verdict.label, tone: refused ? "is-bad" : "is-warn", title: entry.operation.lastError ?? verdict.detail }
        : entry.operation.status === "SYNCING"
          ? { label: "Sending", tone: "", title: undefined }
          : entry.operation.status === "FAILED_RETRYABLE" && online
            ? { label: verdict.label, tone: "is-warn", title: verdict.detail }
            : { label: "Saved on this till", tone: "", title: undefined };
    const tender = payments[0]?.tenderType ?? "CASH";
    return (
      <div key={entry.operation.operationId} className={`wait-row${refused ? " is-refused" : ""}`}>
        <span className="wait-g" aria-hidden="true">
          {tender === "CASH" ? <Money className="ic" /> : <TenderMark single tender={tender} />}
        </span>
        <span className="wait-n">{entry.tag}</span>
        <span className="wait-t">
          {who}
          <time dateTime={entry.operation.createdAt}>{hhmm(entry.operation.createdAt)}</time>
        </span>
        <span className="wait-v">{usd(entry.total)}</span>
        <span className={`wait-s ${state.tone}`} title={state.title}>
          {state.label}
        </span>
        {refused ? (
          <span className="wait-acts" role="group" aria-label={entry.tag}>
            <button
              type="button"
              className="btn btn-icon is-touch"
              aria-label={`Send ${entry.tag} again`}
              title={verdict.retryable ? "Send again" : (verdict.action ?? undefined)}
              disabled={!online || syncOfflineSalesPending || !verdict.retryable}
              onClick={() => retryOfflineSale(entry.operation.operationId)}
            >
              <ArrowsClockwise className="ic" />
            </button>
            <button
              type="button"
              className="btn btn-icon is-touch"
              aria-label={`Discard ${entry.tag}`}
              title="Discard"
              onClick={() => setDiscarding({ id: entry.operation.operationId, tag: entry.tag })}
            >
              <Trash className="ic" />
            </button>
          </span>
        ) : null}
      </div>
    );
  };

  /*
    FLR-09, SET-06's replay rule: a refund or void done offline goes in when
    it is sent, flagged for review if the rules wanted a manager and none
    approved it, because the money has already moved. "Needs a manager" says
    so here, and once the line is back a manager can approve it before it goes.
  */
  const getApproved = (id: string) => {
    const entry = queuedReversals.find((operation) => operation.operationId === id);
    if (!entry) return;
    setApproving(id);
    void approval
      .run((approver) => {
        const { url, body } = reversalRequest(entry.payload, approver);
        return fetchJson(url, { method: "POST", body: JSON.stringify(body) });
      })
      .then((done) => {
        if (done) removeOfflineSale(id);
      })
      .catch(() => {
        // Refused for another reason: it stays queued with the sync's own verdict.
      })
      .finally(() => setApproving(null));
  };

  return (
    <div className="wait-page">
      <div className="wait-h">
        <h1>Waiting to send</h1>
        <span className="sub">
          {rows.length ? (
            <>
              {count(rows.length, "sale")} · <span className="num">{usd(total)}</span>
            </>
          ) : (
            "Nothing waiting"
          )}
        </span>
        {online && rows.length ? (
          <button
            type="button"
            className="btn btn-icon is-touch end"
            aria-label="Try now"
            title="Try now"
            disabled={syncOfflineSalesPending}
            aria-busy={syncOfflineSalesPending || undefined}
            onClick={syncOfflineSales}
          >
            <ArrowsClockwise className="ic" />
          </button>
        ) : null}
      </div>

      {rows.length ? <div className="wait-box">{rows.map(row)}</div> : null}

      {queuedReversals.length ? (
        <section className="wait-group" aria-labelledby="w-reversals">
          <h2 id="w-reversals" className="wait-sub">
            Refunds and voids · {queuedReversals.length}
          </h2>
          <div className="wait-box">
            {queuedReversals.map((entry) => {
              const manager = rules ? reversalNeedsManager(entry.payload, rules, canApprove) : false;
              const state =
                entry.status === "FAILED_BLOCKING"
                  ? { label: "Refused", tone: "is-bad", title: entry.lastError ?? undefined }
                  : manager
                    ? { label: NEEDS_A_MANAGER, tone: "is-warn", title: undefined }
                    : entry.status === "SYNCING"
                      ? { label: "Sending", tone: "", title: undefined }
                      : { label: "Saved on this till", tone: "", title: undefined };
              return (
                <div key={entry.operationId} className="wait-row">
                  <span className="wait-g" aria-hidden="true">
                    {entry.payload.kind === "void" ? <Prohibit className="ic" /> : <ArrowsCounterClockwise className="ic" />}
                  </span>
                  <span className="wait-n">{entry.payload.saleNo}</span>
                  <span className="wait-t">
                    {queuedReversalLabel(entry.payload)}
                    {entry.payload.body.reason ? `, ${String(entry.payload.body.reason)}` : ""}
                    <time dateTime={entry.payload.at}>{hhmm(entry.payload.at)}</time>
                  </span>
                  <span className="wait-v">{usd(entry.payload.amount)}</span>
                  <span className={`wait-s ${state.tone}`} title={state.title ?? undefined}>
                    {state.label}
                  </span>
                  {manager && entry.status !== "SYNCING" ? (
                    <span className="wait-acts">
                      <button
                        type="button"
                        className="btn btn-touch"
                        disabled={!online || approving === entry.operationId}
                        aria-busy={approving === entry.operationId || undefined}
                        onClick={() => getApproved(entry.operationId)}
                      >
                        Get it approved
                      </button>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
          {approval.dialog}
        </section>
      ) : null}

      {sent.length ? (
        <section className="wait-group" aria-labelledby="w-sent">
          <h2 id="w-sent" className="wait-sub">
            {memory.sentAt ? (
              <>
                Sent at <span className="num">{hhmm(memory.sentAt)}</span>
              </>
            ) : (
              "Sent"
            )}{" "}
            · {count(sent.length, "sale")} · <span className="num">{usd(sentTotal)}</span>
          </h2>
          <div className="wait-box">
            {sent.map(({ sale, verdict, tag }) => {
              const flagged = verdict.kind === "SUPERSEDED" || verdict.kind === "OVERRIDDEN";
              const at = verdict.soldAt ?? sale.postedAt;
              return (
                <Link key={sale.id} className="wait-row is-sent" href={`${base}/${sale.id}`}>
                  <span className="wait-g is-ok" aria-hidden="true">
                    <Check className="ic" />
                  </span>
                  <span className="wait-n">{sale.saleNo}</span>
                  <span className="wait-t">
                    {sale.customerName ?? "Walk-in"}
                    <time dateTime={at}>{hhmm(at)}</time>
                  </span>
                  <span className="wait-v">{usd(sale.totalAmount + sale.depositAmount)}</span>
                  {flagged ? (
                    <span className="wait-s is-warn" title={sale.overrideReason ?? verdict.detail}>
                      {verdict.label}
                    </span>
                  ) : (
                    <span className="wait-s num">{tag}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <TillDialog
        open={Boolean(discarding)}
        onOpenChange={(open) => !open && setDiscarding(null)}
        title={discarding ? `Discard ${discarding.tag}?` : "Discard"}
        description="It never reached the books. The money taken for it is put right by hand, and its stock stays counted on the shelf."
        foot={
          <>
            <button type="button" className="btn" onClick={() => setDiscarding(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (discarding) removeOfflineSale(discarding.id);
                setDiscarding(null);
              }}
            >
              <Trash className="ic" />
              Discard {discarding?.tag}
            </button>
          </>
        }
      />
    </div>
  );
}
