"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
};

type StockCount = {
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
  issuedBy: { name: string } | null;
};

type Site = { id: string; name: string };

/** "+3 bottles", "−2 bottles": a count moves on hand either way. */
function signedQuantity(value: number, unit: string) {
  const text = formatQuantity(Math.abs(value), unit);
  return value < 0 ? `−${text}` : `+${text}`;
}

/**
 * Count stock — what is on the shelf, against what is on hand.
 *
 * Was a card above the table, with a lede and an alert explaining the
 * difference in a sentence. The difference is now a fact under the field that
 * makes it, and the API's refusal of a count that changes nothing is said
 * before the request rather than after it.
 */
function CountStockDialog({
  open,
  onOpenChange,
  sites,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sites: Site[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [siteId, setSiteId] = useState("");
  const [itemId, setItemId] = useState("");
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const activeSiteId = siteId || sites[0]?.id || "";
  const itemsQuery = useQuery({
    queryKey: ["retail-stock-count-items", activeSiteId],
    enabled: open && Boolean(activeSiteId),
    queryFn: () =>
      fetchJson<{ data: InventoryItemRow[] }>(
        `/api/inventory/items?siteId=${encodeURIComponent(activeSiteId)}&limit=200`,
      ),
  });
  const items = itemsQuery.data?.data ?? [];
  const item = items.find((entry) => entry.id === itemId);
  const onHand = item ? Number(item.currentStock) : 0;
  const countedValue = counted.trim() ? Number(counted) : null;

  const close = (next: boolean) => {
    if (!next) {
      setItemId("");
      setCounted("");
      setNote("");
      setErrors([]);
    }
    onOpenChange(next);
  };

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/retail/stock/count", {
        method: "POST",
        body: JSON.stringify({
          siteId: activeSiteId,
          itemId,
          countedStock: countedValue,
          notes: note.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      toast({ title: "Stock count saved", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-count-items"] });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-count-history"] });
      queryClient.invalidateQueries({ queryKey: ["retail-stock-overview"] });
      close(false);
    },
    onError: (error) => setErrors([`That count was not saved: ${getApiErrorMessage(error)}`]),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problems: string[] = [];
    if (!item) problems.push("Pick the product you counted.");
    if (countedValue === null || !Number.isFinite(countedValue) || countedValue < 0)
      problems.push("Counted is a number, zero or more.");
    else if (item && countedValue === onHand)
      problems.push("The count matches what is on hand, so there is nothing to save.");
    setErrors(problems);
    if (problems.length === 0) save.mutate();
  };

  const loadErrors = itemsQuery.isError
    ? [`The products would not load: ${getApiErrorMessage(itemsQuery.error)}`]
    : [];

  return (
    <RecordDialog
      open={open}
      onOpenChange={close}
      title="Count stock"
      size="sm"
      onSubmit={submit}
      errors={[...loadErrors, ...errors]}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            Save count
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

      <FormField label="Counted">
        {(id) => (
          <Input
            id={id}
            value={counted}
            inputMode="decimal"
            className="font-mono"
            onChange={(event) => setCounted(event.target.value)}
          />
        )}
      </FormField>

      {item ? (
        <FactList
          maxWidth={null}
          items={[
            { label: "On hand", value: formatQuantity(onHand, item.unit), mono: true },
            ...(countedValue !== null && Number.isFinite(countedValue) && countedValue !== onHand
              ? [
                  {
                    label: "Difference",
                    value: signedQuantity(countedValue - onHand, item.unit),
                    mono: true,
                    tone: "warn" as const,
                  },
                ]
              : []),
          ]}
        />
      ) : null}

      <FormField label="Note">
        {(id) => <Input id={id} value={note} onChange={(event) => setNote(event.target.value)} />}
      </FormField>
    </RecordDialog>
  );
}

/**
 * Stock counts — every count saved, newest first, with the verb to take
 * another in the bar. A count is written to the stock ledger as an
 * adjustment, so this is the adjustments at the chosen site.
 *
 * The stock page's Count stock sends people here with `?new=1`, which opens
 * the dialog straight away.
 */
export default function RetailStockCountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [counting, setCounting] = useState(() => searchParams.get("new") === "1");
  const [search, setSearch] = useState("");
  const [site, setSite] = useState<string>(FILTER_ANY);

  const sitesQuery = useQuery({ queryKey: ["retail-stock-count-sites"], queryFn: fetchSites });
  const sites = useMemo<Site[]>(() => sitesQuery.data ?? [], [sitesQuery.data]);
  const siteOptions = useMemo(() => new Map(sites.map((entry) => [entry.id, entry.name])), [sites]);

  const siteId = site === FILTER_ANY ? "" : site;
  const historyQuery = useQuery({
    queryKey: ["retail-stock-count-history", siteId],
    queryFn: () =>
      fetchJson<{ data: StockCount[] }>(
        `/api/inventory/movements?movementType=ADJUSTMENT&limit=100${
          siteId ? `&siteId=${encodeURIComponent(siteId)}` : ""
        }`,
      ),
  });
  const counts = useMemo(() => historyQuery.data?.data ?? [], [historyQuery.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return counts;
    return counts.filter((count) =>
      [count.item.name, count.item.itemCode, count.referenceId].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [counts, search]);

  const openCount = (open: boolean) => {
    setCounting(open);
    if (!open && searchParams.get("new")) router.replace("/retail/stock/count");
  };

  const emptyTitle = search.trim()
    ? "No stock counts match that search"
    : site !== FILTER_ANY
      ? "No stock counts match this filter"
      : "No stock counts yet";

  return (
    <>
      <RecordListShell
        title="Stock counts"
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
        count={historyQuery.isSuccess ? `${rows.length} of ${counts.length}` : null}
        createLabel="Count stock"
        onCreate={() => openCount(true)}
      >
        {historyQuery.isError ? (
          <Alert tone="danger" title="The stock counts would not load" className="mt-4">
            {getApiErrorMessage(historyQuery.error)}
          </Alert>
        ) : (
          <RecordTable
            rows={rows}
            isLoading={historyQuery.isPending}
            emptyTitle={emptyTitle}
            columns={[
              {
                id: "product",
                label: "Product",
                cell: (count) => <RecordTableName title={count.item.name} subtitle={count.item.itemCode} />,
              },
              ...(sites.length > 1
                ? [
                    {
                      id: "site",
                      label: "Site",
                      width: "10rem",
                      cell: (count: StockCount) => <RecordCell value={count.item.site?.name ?? "No site"} />,
                    },
                  ]
                : []),
              {
                id: "reference",
                label: "Reference",
                width: "10rem",
                cell: (count) => <RecordCell kind="code" value={count.referenceId} />,
              },
              {
                id: "date",
                label: "Counted",
                width: "11rem",
                cell: (count) => <RecordCell kind="date" value={formatRetailDateTime(count.createdAt)} />,
              },
              {
                id: "change",
                label: "Change",
                align: "end",
                width: "9rem",
                cell: (count) => (
                  <RecordCell kind="number" value={signedQuantity(Number(count.quantity), count.unit)} />
                ),
              },
              {
                id: "by",
                label: "By",
                width: "10rem",
                cell: (count) => <RecordCell value={count.issuedBy?.name ?? "Not on file"} />,
              },
            ]}
          />
        )}
      </RecordListShell>

      <CountStockDialog open={counting} onOpenChange={openCount} sites={sites} />
    </>
  );
}
