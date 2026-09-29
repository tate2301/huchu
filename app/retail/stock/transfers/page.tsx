"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@corelithzw/react";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { FactList, FormField } from "@/components/management/ui";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { FILTER_ANY, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { fetchSites } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { formatQuantity, formatRetailDateTime } from "@/lib/retail/words";

type InventoryItemRow = {
  id: string;
  itemCode: string;
  name: string;
  unit: string;
  currentStock: number;
  location: { name: string } | null;
};

type StockLocation = {
  id: string;
  code: string;
  name: string;
  siteId: string;
};

type StockMovement = {
  id: string;
  referenceId: string;
  quantity: number;
  unit: string;
  createdAt: string;
  item: {
    name: string;
    itemCode: string;
    site: { name: string } | null;
  };
  toLocation: { name: string } | null;
};

type Site = { id: string; name: string };

/**
 * Move stock — a product from one stock location at a site to another.
 *
 * On hand is held per site, not per location, so a move takes the whole line
 * (`recordStockMovement` refuses anything else). The quantity field the card
 * used to ask for had one right answer and refused every other; the dialog
 * shows that answer instead of asking for it.
 */
function MoveStockDialog({
  open,
  onOpenChange,
  sites,
  locations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Only the sites with somewhere to move to. */
  sites: Site[];
  locations: StockLocation[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState("");
  const [itemId, setItemId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const activeSiteId = siteId || sites[0]?.id || "";
  const itemsQuery = useQuery({
    queryKey: ["retail-stock-transfer-items", activeSiteId],
    enabled: open && Boolean(activeSiteId),
    queryFn: () =>
      fetchJson<{ data: InventoryItemRow[] }>(
        `/api/inventory/items?siteId=${encodeURIComponent(activeSiteId)}&limit=200`,
      ),
  });
  const items = (itemsQuery.data?.data ?? []).filter((entry) => Number(entry.currentStock) > 0);
  const item = items.find((entry) => entry.id === itemId);
  const destinations = locations.filter((location) => location.siteId === activeSiteId);

  const close = (next: boolean) => {
    if (!next) {
      setItemId("");
      setToLocationId("");
      setNote("");
      setErrors([]);
    }
    onOpenChange(next);
  };

  const move = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/stock/transfers", {
        method: "POST",
        body: JSON.stringify({
          siteId: activeSiteId,
          itemId,
          toLocationId,
          quantity: Number(item?.currentStock ?? 0),
          notes: note.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Stock moved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-transfer-movements"] });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-transfer-items"] });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-overview"] });
      close(false);
    },
    onError: (error) => setErrors([`That stock was not moved: ${getApiErrorMessage(error)}`]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!item) problems.push("Pick the product to move.");
    if (!toLocationId) problems.push("Say where it is going.");
    setErrors(problems);
    if (problems.length === 0) move.mutate();
  };

  const loadErrors = itemsQuery.isError
    ? [`The products would not load: ${getApiErrorMessage(itemsQuery.error)}`]
    : [];

  return (
    <RecordDialog
      open={open}
      onOpenChange={close}
      title="Move stock"
      size="sm"
      onSubmit={submit}
      errors={[...loadErrors, ...errors]}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={move.isPending}>
            Move stock
          </Button>
        </>
      }
    >
      {sites.length > 1 ? (
        <FormField label="Site">
          {(id) => (
            <Select
              value={activeSiteId}
              onValueChange={(value) => {
                setSiteId(value);
                setItemId("");
                setToLocationId("");
              }}
            >
              <SelectTrigger id={id}>
                <SelectValue placeholder="Choose a site" />
              </SelectTrigger>
              <SelectContent>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      ) : null}

      <FormField label="Product">
        {(id) => (
          <Select value={itemId} onValueChange={setItemId}>
            <SelectTrigger id={id}>
              <SelectValue placeholder="Choose a product" />
            </SelectTrigger>
            <SelectContent>
              {items.map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.name} · {entry.itemCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      {item ? (
        <FactList
          maxWidth={null}
          items={[
            { label: "Now in", value: item.location?.name ?? "No location" },
            { label: "Moves", value: formatQuantity(Number(item.currentStock), item.unit), mono: true },
          ]}
        />
      ) : null}

      <FormField label="To">
        {(id) => (
          <Select value={toLocationId} onValueChange={setToLocationId}>
            <SelectTrigger id={id}>
              <SelectValue placeholder="Choose a location" />
            </SelectTrigger>
            <SelectContent>
              {destinations.map((location) => (
                <SelectItem key={location.id} value={location.id}>
                  {location.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </FormField>

      <FormField label="Note">
        {(id) => <Input id={id} value={note} onChange={(event) => setNote(event.target.value)} />}
      </FormField>
    </RecordDialog>
  );
}

/**
 * Transfers — stock moved between locations at a site, newest first.
 *
 * A site with one stock location has nowhere to move anything, so the verb is
 * offered only where a move can be made, and a shop with no such site is told
 * so in the list's own empty state. The sidebar already hides this page on the
 * same rule; this covers a shop that reaches it by address.
 */
export default function RetailStockTransfersPage() {
  const [moving, setMoving] = useState(false);
  const [search, setSearch] = useState("");
  const [site, setSite] = useState<string>(FILTER_ANY);

  const sitesQuery = useQuery({ queryKey: ["retail-stock-transfer-sites"], queryFn: fetchSites });
  const sites = useMemo<Site[]>(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const siteOptions = useMemo(() => new Map(sites.map((entry) => [entry.id, entry.name])), [sites]);

  const locationsQuery = useQuery({
    queryKey: ["retail-stock-transfer-locations"],
    queryFn: () => fetchJson<{ data: StockLocation[] }>("/api/stock-locations?active=true&limit=200"),
  });
  const locations = useMemo(() => locationsQuery.data?.data ?? [], [locationsQuery.data]);

  /** A site can move stock when it has two active locations or more. */
  const movableSites = useMemo(() => {
    const perSite = new Map<string, number>();
    for (const location of locations) perSite.set(location.siteId, (perSite.get(location.siteId) ?? 0) + 1);
    return sites.filter((entry) => (perSite.get(entry.id) ?? 0) >= 2);
  }, [locations, sites]);
  const canMove = movableSites.length > 0;

  const siteId = site === FILTER_ANY ? "" : site;
  const transfersQuery = useQuery({
    queryKey: ["retail-stock-transfer-movements", siteId],
    queryFn: () =>
      fetchJson<{ data: StockMovement[] }>(
        `/api/inventory/movements?movementType=TRANSFER&limit=80${
          siteId ? `&siteId=${encodeURIComponent(siteId)}` : ""
        }`,
      ),
  });
  const transfers = useMemo(() => transfersQuery.data?.data ?? [], [transfersQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return transfers;
    return transfers.filter((transfer) =>
      [transfer.item.name, transfer.item.itemCode, transfer.referenceId].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [transfers, search]);

  const emptyTitle = search.trim()
    ? "No transfers match that search"
    : site !== FILTER_ANY
      ? "No transfers match this filter"
      : locationsQuery.isSuccess && !canMove
        ? "Each site has one stock location, so there is nowhere to move stock to."
        : "No transfers yet";

  const loadError = transfersQuery.error ?? locationsQuery.error;

  return (
    <>
      <RecordListShell
        title="Transfers"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by product, code or reference"
        filters={
          <ViewToolbarFilter
            label="Site"
            value={site}
            anyLabel="Every site"
            options={siteOptions}
            onChange={setSite}
          />
        }
        filterCount={site === FILTER_ANY ? 0 : 1}
        count={transfersQuery.isSuccess ? `${rows.length} of ${transfers.length}` : null}
        createLabel={canMove ? "Move stock" : undefined}
        onCreate={canMove ? () => setMoving(true) : undefined}
      >
        {loadError ? (
          <Alert tone="danger" title="The transfers would not load" className="mt-4">
            {getApiErrorMessage(loadError)}
          </Alert>
        ) : (
          <RecordTable
            rows={rows}
            isLoading={transfersQuery.isPending || locationsQuery.isPending}
            emptyTitle={emptyTitle}
            columns={[
              {
                id: "product",
                label: "Product",
                cell: (transfer) => (
                  <RecordTableName title={transfer.item.name} subtitle={transfer.item.itemCode} />
                ),
              },
              ...(sites.length > 1
                ? [
                    {
                      id: "site",
                      label: "Site",
                      width: "10rem",
                      cell: (transfer: StockMovement) => (
                        <RecordCell value={transfer.item.site?.name ?? "No site"} />
                      ),
                    },
                  ]
                : []),
              {
                id: "to",
                label: "To",
                width: "11rem",
                cell: (transfer) => <RecordCell value={transfer.toLocation?.name ?? "No location"} />,
              },
              {
                id: "reference",
                label: "Reference",
                width: "10rem",
                cell: (transfer) => <RecordCell kind="code" value={transfer.referenceId} />,
              },
              {
                id: "date",
                label: "Moved",
                width: "11rem",
                cell: (transfer) => <RecordCell kind="date" value={formatRetailDateTime(transfer.createdAt)} />,
              },
              {
                id: "quantity",
                label: "Quantity",
                align: "end",
                width: "9rem",
                cell: (transfer) => (
                  <RecordCell
                    kind="number"
                    value={formatQuantity(Math.abs(Number(transfer.quantity)), transfer.unit)}
                  />
                ),
              },
            ]}
          />
        )}
      </RecordListShell>

      {canMove ? (
        <MoveStockDialog open={moving} onOpenChange={setMoving} sites={movableSites} locations={locations} />
      ) : null}
    </>
  );
}
