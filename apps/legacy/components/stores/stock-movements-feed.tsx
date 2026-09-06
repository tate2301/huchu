"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Input, Skeleton } from "@corelithzw/react";

import { SegmentedControl } from "@corelithzw/ui/components/segmented-control";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@corelithzw/ui/components/select";
import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";
import { fetchSites, fetchStockMovements } from "@/lib/api";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { HistoryFeed, type HistoryEvent } from "@/components/crm/records/history-feed";

const PAGE_LIMIT = 200;

/**
 * The stock movement log, as a history feed rather than a table.
 *
 * Movements are an evidence trail — who took what, out of where, on whose
 * say-so — and that is a sentence, not a row of columns. The feed buckets by
 * day, names the actor, folds the detail behind a toggle and exports to CSV,
 * which is the whole reason anybody opened the table version.
 *
 * Read-only by design: a movement is corrected by recording another movement,
 * never by editing the one that happened.
 */
export function StockMovementsFeed({ siteId }: { siteId?: string }) {
  const [site, setSite] = useState(siteId ?? "");
  const [direction, setDirection] = useState<"ALL" | "ISSUE" | "RECEIPT">("ALL");
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);

  const sitesQuery = useQuery({ queryKey: ["sites"], queryFn: fetchSites });
  const sites = useMemo(() => sitesQuery.data ?? [], [sitesQuery.data]);

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
          ? `${movement.item?.name ?? ""} ${movement.referenceId} ${movement.issuedTo ?? ""}`
              .toLowerCase()
              .includes(needle)
          : true,
      )
      .map((movement) => {
        const issued = movement.movementType === "ISSUE";
        const where = movement.item?.location?.name ?? movement.item?.site?.name;
        return {
          id: movement.id,
          action: movement.movementType,
          verb: `${issued ? "issued" : "received"} ${movement.quantity} ${movement.unit} of ${
            movement.item?.name ?? "an item"
          }${where ? ` ${issued ? "from" : "into"} ${where}` : ""}`,
          // The log records a name typed into the form, not a linked user, so
          // that string is the actor — there is nothing better to use.
          actorId: null,
          actorName: movement.requestedBy ?? movement.issuedBy?.name ?? "Unrecorded",
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
              to: `${issued ? "−" : "+"}${movement.quantity} ${movement.unit}`,
            },
            ...(movement.item?.site?.name
              ? [{ field: "Site", from: null, to: movement.item.site.name }]
              : []),
          ],
        };
      });
  }, [debounced, movementsQuery.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by item, reference or who it went to"
          aria-label="Search movements"
          className="h-9 w-full sm:w-72"
        />

        <SegmentedControl
          value={direction}
          onValueChange={(value) => setDirection(value as typeof direction)}
          options={[
            { value: "ALL", label: "All" },
            { value: "RECEIPT", label: "In" },
            { value: "ISSUE", label: "Out" },
          ]}
        />

        <Select value={site} onValueChange={setSite}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Every site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Every site</SelectItem>
            {sites.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {movementsQuery.error ? (
        <Alert tone="danger" title="Unable to load movements">
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
        <HistoryFeed
          events={events}
          emptyMessage="Nothing has moved yet."
          exportName="stock-movements"
        />
      )}
    </div>
  );
}
