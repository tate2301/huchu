"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Skeleton } from "@corelithzw/react";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  ColumnRowAction,
  SectionHeading,
  StatusDot,
} from "@/components/management/ui";
import { dsConfirm } from "@/components/ui/ds-confirm";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatSignedMoney } from "@/lib/retail/words";

import { LocationDialog, type EditableLocation } from "./location-dialog";

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

/**
 * What the stock in a location is worth. An item with no unit cost adds
 * nothing to the total, so where one is missing the figure is a floor and
 * says so, rather than quietly under-reporting.
 */
function valueOf(location: LocationRow): string {
  const money = formatSignedMoney(location.stockValue);
  return location.valueComplete ? money : `At least ${money}`;
}

/** A register's measure: wide enough for its figures, not the whole window. */
const WIDTH = 960;

function stateOf(location: LocationRow) {
  if (!location.isActive) return <StatusDot tone="neutral" label="Inactive" />;
  if (location.lowCount > 0) return <StatusDot tone="warn" label={`${location.lowCount} low`} />;
  return null;
}

const toEditable = (location: LocationRow): EditableLocation => ({
  id: location.id,
  code: location.code,
  name: location.name,
  siteId: location.site.id,
  isActive: location.isActive,
});

/**
 * Locations — where stock is kept, under the site each belongs to.
 *
 * Drawn as the management registers are: "New location" in the bar, search
 * in the toolbar, and a `ColumnList` per site — a heading for each once there
 * is more than one. The name opens what the location holds on the On hand
 * page; a location has no record page, so Edit is on the row and Delete is in
 * the edit form's footer.
 */
export function StockLocationsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableLocation | null>(null);

  const locationsQuery = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => fetchJson<{ data: LocationRow[] }>("/api/v2/inventory/locations"),
  });
  const locations = useMemo(() => locationsQuery.data?.data ?? [], [locationsQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return locations;
    return locations.filter((row) =>
      `${row.name} ${row.code} ${row.site.name}`.toLowerCase().includes(needle),
    );
  }, [locations, search]);

  // Under a heading per site once there is more than one; the API sorts by
  // site first, which is the order the groups need.
  const groups = useMemo(() => {
    const bySite = new Map<string, { id: string; label: string; rows: LocationRow[] }>();
    for (const row of rows) {
      const group = bySite.get(row.site.id);
      if (group) group.rows.push(row);
      else bySite.set(row.site.id, { id: row.site.id, label: row.site.name, rows: [row] });
    }
    return [...bySite.values()];
  }, [rows]);

  const remove = useMutation({
    mutationFn: (location: LocationRow) =>
      fetchJson(`/api/stock-locations/${location.id}` as const, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Location deleted", variant: "success" });
      void queryClient.invalidateQueries({ queryKey: ["inventory-locations"] });
      void queryClient.invalidateQueries({ queryKey: ["stock-locations"] });
    },
    onError: (error) =>
      toast({
        title: "That location was not deleted",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const confirmRemove = (location: LocationRow) => {
    void dsConfirm({
      title: `Delete ${location.name}?`,
      description:
        "It is removed for good. A location that still has stock items in it cannot be deleted — make it inactive instead.",
      confirmLabel: "Delete location",
      variant: "danger",
    }).then((confirmed) => {
      if (!confirmed) return;
      setEditing(null);
      remove.mutate(location);
    });
  };

  const hrefFor = (location: LocationRow) =>
    `/stores/inventory?siteId=${location.site.id}&locationId=${location.id}`;

  const emptyTitle = search.trim() ? "No location matches that search." : "No locations yet.";

  const listFor = (label: string, list: LocationRow[]) => (
    <ColumnList
      label={label}
      maxWidth={WIDTH}
      empty={emptyTitle}
      columns={[
        { id: "location", label: "Location" },
        { id: "state", label: "Status", hideBelow: "sm" },
        { id: "items", label: "Stock items", align: "end", hideBelow: "sm" },
        { id: "value", label: "Value", align: "end" },
        { id: "act", label: "" },
      ]}
      rows={list.map((location) => ({
        id: location.id,
        cells: {
          location: <ColumnName code={location.code} name={location.name} href={hrefFor(location)} />,
          state: stateOf(location),
          items: (
            <ColumnFigure tone={location.itemCount === 0 ? "muted" : "default"}>
              {location.itemCount}
            </ColumnFigure>
          ),
          value: <ColumnFigure>{valueOf(location)}</ColumnFigure>,
          act: (
            <ColumnRowAction>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={`Edit ${location.name}`}
                onClick={() => setEditing(toEditable(location))}
              >
                Edit
              </Button>
            </ColumnRowAction>
          ),
        },
      }))}
    />
  );

  return (
    <>
      <RecordListShell
        title="Locations"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by location, code or site"
        count={locationsQuery.isSuccess ? `${rows.length} of ${locations.length}` : null}
        createLabel="New location"
        onCreate={() => setCreating(true)}
        error={locationsQuery.error}
      >
        {locationsQuery.isPending ? (
          <div className="space-y-1.5" aria-busy="true" style={{ maxWidth: WIDTH }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : groups.length > 1 ? (
          groups.map((group, index) => (
            <section key={group.id}>
              <SectionHeading
                count={group.rows.length}
                maxWidth={WIDTH}
                className={index === 0 ? "mt-0" : undefined}
              >
                {group.label}
              </SectionHeading>
              {listFor(group.label, group.rows)}
            </section>
          ))
        ) : (
          <div className="space-y-3">
            {listFor("Locations", rows)}
            {rows.length === 0 && !search.trim() ? (
              <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
                New location
              </Button>
            ) : null}
          </div>
        )}
      </RecordListShell>

      <LocationDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        location={editing}
        footerStart={
          editing ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                const row = locations.find((candidate) => candidate.id === editing.id);
                if (row) confirmRemove(row);
              }}
            >
              Delete location
            </Button>
          ) : null
        }
      />
    </>
  );
}
