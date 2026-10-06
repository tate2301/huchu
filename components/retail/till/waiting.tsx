"use client";

/**
 * Waiting to send: the sales this till took while the line was down, each with
 * what it needs. They go up on their own when the line is back; one the server
 * refused waits for someone, with Send again and Discard. Under them, the
 * sales that went up at a price the shop has since changed, so nobody finds
 * out from the margins weeks later.
 */

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { fetchJson } from "@/lib/api-client";
import { ArrowsClockwise, CaretRight, Trash, WifiSlash } from "@/lib/icons";
import { classifyQueuedSale, classifyReplayedSale } from "@/lib/retail/offline-queue-verdict";
import { getPosPortalHref } from "@/lib/retail/pos-host";
import { queuedSaleLabel } from "@/lib/retail/pos-offline-queue";
import { count, hhmm, usd } from "./format";
import { Empty, TillDialog } from "./parts";
import { useConnection } from "./sell";
import { useTill } from "./state";
import type { PosCatalogItem } from "./types";

type ReplayedSale = {
  id: string;
  saleNo: string;
  saleType: string;
  postedAt: string;
  totalAmount: number;
  depositAmount: number;
  notes: string | null;
  overrideReason: string | null;
};

const TONE = { danger: "status-danger", warning: "status-warning", brand: "status-live", neutral: "" } as const;

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
  const { queuedOfflineSales, syncOfflineSales, syncOfflineSalesPending, retryOfflineSale, removeOfflineSale, zig, isPosHost } = useTill();
  const { operations } = useOfflineRuntime();
  const { online, since } = useConnection();
  const names = useShelfNames();
  const zigRate = zig ? Number(zig.rate) : 0;
  const [discarding, setDiscarding] = React.useState<{ id: string; label: string } | null>(null);
  const base = getPosPortalHref("history", isPosHost);

  // The outbox knows what a sale is stuck behind (its shift, a new customer); the queue holds the sale.
  const blockedBy = new Map(operations.filter((entry) => entry.blockedByOperationId).map((entry) => [entry.operationId, entry.blockedByOperationId ?? null]));
  const rows = queuedOfflineSales.map((operation) => {
    // What was handed over, in US dollars: ZiG cash at today's rate.
    const total = operation.payload.payments.reduce(
      (sum, payment) => sum + (payment.currency === "ZWG" && zigRate > 0 ? payment.amount / zigRate : payment.amount),
      0,
    );
    const verdict = classifyQueuedSale({
      status: operation.status,
      lastError: operation.lastError,
      retryCount: operation.retryCount,
      blockedByOperationId: blockedBy.get(operation.operationId) ?? null,
    });
    return { operation, total, verdict, label: queuedSaleLabel(operation.payload) };
  });
  const blocked = rows.filter((row) => row.operation.status === "FAILED_BLOCKING");
  const waiting = rows.filter((row) => row.operation.status !== "FAILED_BLOCKING");
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const sum = (list: typeof rows) => usd(list.reduce((value, row) => value + row.total, 0));

  // Replays that already landed, off my own sales: one that went up at a changed price is shown, not buried.
  const replayed = useQuery({
    queryKey: ["retail-pos-sales", "offline-replays"],
    queryFn: () => fetchJson<{ data: ReplayedSale[] }>("/api/v2/retail/pos/sales?scope=mine&limit=60"),
    enabled: online,
    staleTime: 30_000,
  });
  const priceNotes = (replayed.data?.data ?? [])
    .filter((sale) => sale.saleType === "SALE")
    .map((sale) => ({ sale, verdict: classifyReplayedSale(sale) }))
    .filter((entry) => entry.verdict.kind === "SUPERSEDED" || entry.verdict.kind === "OVERRIDDEN")
    .slice(0, 12);

  const row = (entry: (typeof rows)[number], needsSomeone: boolean) => {
    const { items, customerName } = entry.operation.payload;
    // A refused sale reads by the product it is about; the rest by who and how many.
    const first = needsSomeone && items[0] ? names.get(items[0].productId) : undefined;
    const what = first
      ? items.length > 1
        ? `${first} + ${items.length - 1} more`
        : first
      : `${customerName || "Walk-in"}, ${count(items.length, "item")}`;
    const { verdict } = entry;
    const status =
      needsSomeone || verdict.kind === "BLOCKED_BY_ANOTHER"
        ? { label: verdict.label, tone: TONE[verdict.tone], title: entry.operation.lastError ?? verdict.detail }
        : entry.operation.status === "SYNCING"
          ? { label: "Sending", tone: "status-live" }
          : entry.operation.status === "FAILED_RETRYABLE" || !online
            ? { label: "No connection", tone: "status-warning" }
            : { label: "Saved on this till", tone: "" };
    return (
      <div
        key={entry.operation.operationId}
        className="row is-queued"
      >
        <span className="code num text-left">
          {entry.label}
        </span>
        <span className="truncate">
          <span className="ink">{what}</span>{" "}
          <span className="muted">{hhmm(entry.operation.createdAt)}</span>
        </span>
        <span className={`status ${status.tone} truncate`} title={status.title ?? status.label}>
          {status.label}
        </span>
        <span className="num ink">
          {usd(entry.total)}
        </span>
        <span>
          {needsSomeone ? (
            <div className="btn-group" role="group" aria-label={entry.label}>
              <button
                type="button"
                className="btn"
                aria-label={`Send again, ${entry.label}`}
                title={verdict.retryable ? undefined : (verdict.action ?? undefined)}
                disabled={!online || syncOfflineSalesPending || !verdict.retryable}
                onClick={() => retryOfflineSale(entry.operation.operationId)}
              >
                <ArrowsClockwise className="ic" />
                Send again
              </button>
              <button
                type="button"
                className="btn btn-danger"
                aria-label={`Discard ${entry.label}`}
                onClick={() => setDiscarding({ id: entry.operation.operationId, label: entry.label })}
              >
                <Trash className="ic" />
                Discard
              </button>
            </div>
          ) : null}
        </span>
      </div>
    );
  };

  const sent = priceNotes.length ? (
    <section aria-labelledby="w-sent">
      <div className="group-head">
        <h2 id="w-sent">Sent after the line came back</h2>
        <span className="sum">
          {count(priceNotes.length, "sale")}
        </span>
      </div>
      <div className="list">
        {priceNotes.map(({ sale, verdict }) => (
          <Link key={sale.id} className="row is-queued" href={`${base}/${sale.id}`}>
            <span className="code num text-left">
              {sale.saleNo}
            </span>
            <span className="truncate">
              <span className="ink">Rung {hhmm(verdict.soldAt ?? sale.postedAt)}</span>{" "}
              <span className="muted">{verdict.detail}</span>
            </span>
            <span className="status status-warning truncate" title={sale.overrideReason ?? verdict.label}>
              {verdict.label}
            </span>
            <span className="num ink">
              {usd(sale.totalAmount + sale.depositAmount)}
            </span>
            <CaretRight className="ic" />
          </Link>
        ))}
      </div>
    </section>
  ) : null;

  return (
    <div className="main is-fixed">
      <div className="bar">
        <h1>Waiting to send</h1>
        <div className="end">
          <button
            type="button"
            className="btn"
            disabled={!online || !rows.length || syncOfflineSalesPending}
            aria-busy={syncOfflineSalesPending || undefined}
            onClick={syncOfflineSales}
          >
            <ArrowsClockwise className="ic" />
            Try now
          </button>
        </div>
      </div>
      {!online ? (
        <div className="banner banner-warning">
          <WifiSlash className="ic" />
          <span>
            <b className="weight-500">No connection{since ? ` since ${hhmm(since)}` : ""}.</b> Moving cash needs the line: write it on
            the safe log and enter it on Shift before you cash up.
          </span>
        </div>
      ) : null}
      {!rows.length && !priceNotes.length ? (
        <Empty icon={WifiSlash} title="Nothing is waiting">
          Sales taken while the line is down are saved here and sent when it is back.
        </Empty>
      ) : (
        <div className="table-shell">
          <div className="table-scroll">
            {rows.length ? (
              <div className="finding">
                <p className="lede-figure">
                  {count(rows.length, "sale")} saved on this till, <span className="num">{usd(total)}</span>.{" "}
                  <span className="q">They go up on their own when the line is back.</span>
                </p>
              </div>
            ) : null}
            {blocked.length ? (
              <section aria-labelledby="w-blocked">
                <div className="group-head">
                  <h2 id="w-blocked">Needs someone</h2>
                  <span className="sum">
                    {count(blocked.length, "sale")}
                  </span>
                </div>
                <div className="list">{blocked.map((entry) => row(entry, true))}</div>
              </section>
            ) : null}
            {waiting.length ? (
              <section aria-labelledby="w-waiting">
                <div className="group-head">
                  <h2 id="w-waiting">Waiting</h2>
                  <span className="sum">
                    {count(waiting.length, "sale")} · {sum(waiting)}
                  </span>
                </div>
                <div className="list">{waiting.map((entry) => row(entry, false))}</div>
              </section>
            ) : null}
            {sent}
          </div>
          <div className="table-foot">
            <div className="foot-row">
              <span className="num text-left">
                1 to {rows.length} of {rows.length}
              </span>
              <span className="foot-sum">
                Waiting <b>{usd(total)}</b>
              </span>
            </div>
          </div>
        </div>
      )}
      <TillDialog
        open={Boolean(discarding)}
        onOpenChange={(open) => !open && setDiscarding(null)}
        title={discarding ? `Discard ${discarding.label}?` : "Discard"}
        description="It never reached the books: the money taken for it has to be put right by hand, and the stock it sold is still counted on the shelf. It cannot be brought back."
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
              Discard {discarding?.label}
            </button>
          </>
        }
      />
    </div>
  );
}
