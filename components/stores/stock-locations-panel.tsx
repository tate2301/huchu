"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { StatusDot } from "@/components/management/ui";
import { RecordList } from "@/components/records/record-list";
import {
  RecordCell,
  RecordTable,
  RecordTableName,
  type RecordTableGroup,
} from "@/components/records/record-table";
import { RowMenu } from "@/components/retail/row-menu";
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
 * Making, renaming and closing a location used to happen in a side sheet on
 * the On hand page, below the stock list, while this page could only read.
 * The verbs live with the list they act on now: "New location" in the bar,
 * and Edit and Delete behind each row's menu.
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
  const groups = useMemo<RecordTableGroup[] | null>(() => {
    const bySite = new Map<string, RecordTableGroup & { ids: string[] }>();
    for (const row of rows) {
      const group = bySite.get(row.site.id);
      if (group) {
        group.ids.push(row.id);
        group.count += 1;
      } else {
        bySite.set(row.site.id, { id: row.site.id, label: row.site.name, count: 1, ids: [row.id] });
      }
    }
    return bySite.size > 1 ? [...bySite.values()] : null;
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
      if (confirmed) remove.mutate(location);
    });
  };

  const menuFor = (location: LocationRow) => (
    <RowMenu
      label={`More for ${location.name}`}
      items={[
        { label: "Edit location", onSelect: () => setEditing(toEditable(location)) },
        { label: "Delete location", onSelect: () => confirmRemove(location), destructive: true },
      ]}
    />
  );

  const hrefFor = (location: LocationRow) =>
    `/stores/inventory?siteId=${location.site.id}&locationId=${location.id}`;

  const emptyTitle = search.trim() ? "No locations match that search" : "No locations yet";

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
        <RecordTable
          rows={rows}
          groups={groups}
          isLoading={locationsQuery.isPending}
          emptyTitle={emptyTitle}
          rowHref={hrefFor}
          columns={[
            {
              id: "location",
              label: "Location",
              cell: (location) => <RecordTableName title={location.name} subtitle={location.code} />,
            },
            {
              id: "state",
              label: "Status",
              width: "8rem",
              cell: stateOf,
            },
            {
              id: "items",
              label: "Stock items",
              align: "end",
              width: "8rem",
              cell: (location) => <RecordCell kind="number" value={location.itemCount} />,
            },
            {
              id: "value",
              label: "Value",
              align: "end",
              width: "10rem",
              cell: (location) => <RecordCell kind="money" value={valueOf(location)} />,
            },
            {
              id: "menu",
              label: "",
              menu: <span className="sr-only">More</span>,
              width: "3rem",
              align: "end",
              cell: menuFor,
            },
          ]}
          mobile={
            <RecordList
              rows={rows.map((location) => ({
                id: location.id,
                href: hrefFor(location),
                title: location.name,
                subtitle: `${location.code} · ${location.site.name}`,
                status: stateOf(location),
                facts: [
                  { label: "Value", value: valueOf(location), kind: "money", primary: true },
                  { label: "Stock items", value: location.itemCount, kind: "number" },
                ],
                actions: menuFor(location),
              }))}
              isLoading={locationsQuery.isPending}
              emptyTitle={emptyTitle}
            />
          }
        />
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
      />
    </>
  );
}
