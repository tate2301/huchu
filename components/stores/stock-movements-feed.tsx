"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import { HistoryFeed, type HistoryEvent } from "@/components/crm/records/history-feed";
import { ListSearch } from "@/components/crm/records/list-search";
import { FILTER_ANY, ViewToolbar, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { useDebounced } from "@/hooks/use-debounced";
import { fetchSites, fetchStockMovements } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { formatQuantity } from "@/lib/retail/words";

import { movementDelta, movementTypeLabel } from "./stock-words";

const PAGE_LIMIT = 200;

const TYPE_OPTIONS = new Map([
  ["RECEIPT", "Received"],
  ["ISSUE", "Issued"],
  ["TRANSFER", "Transferred"],
  ["ADJUSTMENT", "Adjusted"],
]);

/** Which way the stock went, as the sentence says it. */
const PREPOSITION: Record<string, string> = {
  RECEIPT: "into",
  ISSUE: "from",
  TRANSFER: "from",
  ADJUSTMENT: "at",
};

/**
 * The stock movement log, as a history feed rather than a table.
 *
 * Movements are an evidence trail — who took what, out of where, on whose
 * say-so — and that is a sentence, not a row of columns. The feed buckets by
 * day, names the actor, folds the detail behind a toggle and exports to CSV,
 * which is the whole reason anybody opened the table version.
 *
 * Read-only by design: a movement is corrected by recording another movement,
 * never by editing the one that happened. Each is named by what it was —
 * received, issued, transferred or adjusted — rather than everything that was
 * not an issue reading as received.
 */
export function StockMovementsFeed({
  siteId,
  initialSearch = "",
}: {
  siteId?: string;
  /** What the search box starts with — a stock item's code, from On hand. */
  initialSearch?: string;
}) {
  const [site, setSite] = useState(siteId ?? "");
  const [direction, setDirection] = useState<string>("ALL");
  const [search, setSearch] = useState(initialSearch);
  const debounced = useDebounced(search, 300);

  const sitesQuery = useQuery({ queryKey: ["sites"], queryFn: fetchSites });
  const siteOptions = useMemo(
    () => new Map((sitesQuery.data ?? []).map((candidate) => [candidate.id, candidate.name])),
    [sitesQuery.data],
  );

  const movementsQuery = useQuery({
    queryKey: ["stock-movements", site || "all", direction],
    queryFn: () =>
      fetchStockMovements({
        siteId: site || undefined,
        movementType: direction === "ALL" ? undefined : direction,
        limit: PAGE_LIMIT,
      }),
    placeholderData: (previous) => previous,
  });

  const events = useMemo<HistoryEvent[]>(() => {
    const needle = debounced.trim().toLowerCase();
    return (movementsQuery.data?.data ?? [])
      .filter((movement) =>
        needle
          ? `${movement.item?.name ?? ""} ${movement.item?.itemCode ?? ""} ${movement.referenceId} ${
              movement.issuedTo ?? ""
            }`
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .map((movement) => {
        const label = movementTypeLabel(movement.movementType);
        const delta = movementDelta(movement.movementType, movement.quantity);
        const where = movement.item?.location?.name ?? movement.item?.site?.name;
        const preposition = PREPOSITION[movement.movementType] ?? "at";
        return {
          id: movement.id,
          action: label,
          verb: `${label.toLowerCase()} ${formatQuantity(Math.abs(movement.quantity), movement.unit)} of ${
            movement.item?.name ?? "a stock item"
          }${where ? ` ${preposition} ${where}` : ""}`,
          // The log records a name typed into the form, not a linked user, so
          // that string is the actor — there is nothing better to use.
          actorId: null,
          actorName: movement.requestedBy ?? movement.issuedBy?.name ?? "Someone",
          occurredAt: movement.createdAt,
          note: [
            movement.issuedTo ? `To ${movement.issuedTo}` : null,
            movement.approvedBy ? `Approved by ${movement.approvedBy}` : null,
            movement.notes,
          ]
            .filter(Boolean)
            .join(" · "),
          changes: [
            { field: "Reference", from: null, to: movement.referenceId },
            {
              field: "Quantity",
              from: null,
              to: `${delta < 0 ? "−" : "+"}${formatQuantity(Math.abs(delta), movement.unit)}`,
            },
            ...(movement.item?.site?.name
              ? [{ field: "Site", from: null, to: movement.item.site.name }]
              : []),
          ],
        };
      });
  }, [debounced, movementsQuery.data]);

  const emptyMessage = debounced.trim()
    ? "No movements match that search"
    : site || direction !== "ALL"
      ? "No movements match this filter"
      : "No movements yet";

  return (
    <div className="space-y-4">
      <ViewToolbar
        search={
          <ListSearch
            value={search}
            onChange={setSearch}
            placeholder="Search by stock item, code, reference or who it went to"
            noun="movements"
          />
        }
        start={
          <>
            <ViewToolbarFilter
              label="Type"
              value={direction === "ALL" ? FILTER_ANY : direction}
              anyLabel="Any type"
              options={TYPE_OPTIONS}
              onChange={(next) => setDirection(next === FILTER_ANY ? "ALL" : next)}
            />
            <ViewToolbarFilter
              label="Site"
              value={site || FILTER_ANY}
              anyLabel="Any site"
              options={siteOptions}
              onChange={(next) => setSite(next === FILTER_ANY ? "" : next)}
            />
          </>
        }
        filterCount={[direction !== "ALL", Boolean(site)].filter(Boolean).length}
      />

      {movementsQuery.error ? (
        <Alert tone="danger" title="The movements would not load">
          {getApiErrorMessage(movementsQuery.error)}
        </Alert>
      ) : null}

      {movementsQuery.isLoading ? (
        <div className="space-y-2" aria-busy="true">
          <Skeleton height={28} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </div>
      ) : (
        <HistoryFeed events={events} emptyMessage={emptyMessage} exportName="stock-movements" />
      )}
    </div>
  );
}
