"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, EmptyState, Input, Skeleton } from "@corelithzw/react";

import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { useDebounced } from "@/hooks/use-debounced";
import { ChevronRight } from "@/lib/icons";

type LocationRow = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  site: { id: string; name: string; code: string };
  itemCount: number;
  holdingCount: number;
  lowCount: number;
  stockValue: number;
  valueComplete: boolean;
};

function money(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Stock locations, grouped by the site they belong to.
 *
 * Split out of "Stock on hand", which was doing two jobs at once: a list of
 * items summed across everywhere, and — implicitly, through a site filter — a
 * list of places. Neither question was answerable without doing the other
 * one's work first.
 */
export function StockLocationsPanel() {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search, 300);

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => fetchJson<{ data: LocationRow[] }>("/api/v2/inventory/locations"),
  });

  const grouped = useMemo(() => {
    const needle = debounced.trim().toLowerCase();
    const rows = (locationsQuery.data?.data ?? []).filter((row) =>
      needle
        ? `${row.name} ${row.code} ${row.site.name}`.toLowerCase().includes(needle)
        : true,
    );

    // A Map keeps the sites in the order the API sorted them into, rather than
    // whatever order the object keys happen to come out in.
    const bySite = new Map<string, { name: string; rows: LocationRow[] }>();
    for (const row of rows) {
      const bucket = bySite.get(row.site.id);
      if (bucket) bucket.rows.push(row);
      else bySite.set(row.site.id, { name: row.site.name, rows: [row] });
    }
    return [...bySite.entries()].map(([id, bucket]) => ({ id, ...bucket }));
  }, [debounced, locationsQuery.data]);

  if (locationsQuery.isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton height={32} />
        <Skeleton height={72} />
        <Skeleton height={72} />
      </div>
    );
  }

  if (locationsQuery.error) {
    return (
      <Alert tone="danger" title="Unable to load stock locations">
        {getApiErrorMessage(locationsQuery.error)}
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search stores and locations"
        aria-label="Search stores and locations"
        className="h-9 w-full sm:w-72"
      />

      {grouped.length === 0 ? (
        <EmptyState
          title={debounced ? "Nothing matches that search" : "No stock locations yet"}
          body={
            debounced
              ? undefined
              : "A location is a place inside a site — a bay, a yard, a locked cage. Stock is held at one."
          }
        />
      ) : (
        grouped.map((site) => (
          <section key={site.id} aria-labelledby={`site-${site.id}`} className="space-y-2">
            <h3
              id={`site-${site.id}`}
              className="sticky top-14 z-10 flex items-baseline gap-2 bg-[var(--surface-base)] py-1.5 text-sm font-medium uppercase tracking-wide text-[var(--text-subtle)]"
            >
              <span>{site.name}</span>
              <span className="font-mono normal-case tracking-normal">
                {site.rows.length}
              </span>
            </h3>

            <ul className="space-y-1">
              {site.rows.map((location) => (
                <li key={location.id}>
                  <Link
                    href={`/stores/inventory?siteId=${location.site.id}`}
                    className="flex items-center gap-3 px-3 py-3 hover:bg-[var(--surface-muted)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-[var(--text-strong)]">
                          {location.name}
                        </span>
                        <span className="font-mono text-sm text-[var(--text-subtle)]">
                          {location.code}
                        </span>
                        {!location.isActive ? (
                          <Badge tone="neutral" size="sm">
                            Closed
                          </Badge>
                        ) : null}
                        {location.lowCount > 0 ? (
                          <Badge tone="warn" size="sm">
                            {location.lowCount} low
                          </Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-sm text-[var(--text-muted)]">
                        {location.holdingCount} of {location.itemCount} item
                        {location.itemCount === 1 ? "" : "s"} in stock
                      </span>
                    </span>

                    <span className="hidden text-right sm:block">
                      <span className="block text-sm uppercase tracking-wide text-[var(--text-subtle)]">
                        Value
                      </span>
                      <span className="block font-mono text-sm tabular-nums">
                        {money(location.stockValue)}
                        {/* Say so rather than quietly under-reporting: an item
                            with no unit cost adds nothing to this total. */}
                        {location.valueComplete ? "" : "*"}
                      </span>
                    </span>

                    <ChevronRight className="size-4 flex-none text-[var(--text-subtle)]" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {grouped.some((site) => site.rows.some((row) => !row.valueComplete)) ? (
        <p className="text-sm text-[var(--text-muted)]">
          * Some items in this location have no unit cost recorded, so the value
          shown is lower than what is actually there.
        </p>
      ) : null}
    </div>
  );
}
