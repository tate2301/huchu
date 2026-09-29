"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { FactList, StatusDot } from "@/components/management/ui";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { RecordList } from "@/components/records/record-list";
import { RecordCell, RecordTable, RecordTableName } from "@/components/records/record-table";
import { FILTER_ANY, ViewToolbarChip, ViewToolbarFilter } from "@/components/records/view-toolbar";
import { RowMenu } from "@/components/retail/row-menu";
import { StockItemDialog } from "@/components/stores/stock-item-dialog";
import {
  STOCK_CATEGORIES,
  stockCategoryLabel,
  stockLevelLabel,
} from "@/components/stores/stock-words";
import { StoresShell } from "@/components/stores/stores-shell";
import { Button } from "@/components/ui/button";
import { dsConfirm } from "@/components/ui/ds-confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportMenu } from "@/components/ui/export-menu";
import { useToast } from "@/components/ui/use-toast";
import { fetchInventoryItems, fetchSites, fetchStockLocations, type InventoryItem } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { formatQuantity, formatSignedMoney } from "@/lib/retail/words";

function buildInventoryQrPayload(item: InventoryItem) {
  return JSON.stringify({
    type: "inventory-item",
    version: 1,
    id: item.id,
    itemCode: item.itemCode ?? "",
    name: item.name,
    category: item.category,
    siteId: item.siteId ?? "",
    locationId: item.locationId ?? "",
    unit: item.unit,
  });
}

function buildInventoryQrImageUrl(payload: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(payload)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LEVEL_OPTIONS = new Map([
  ["low", "Low or out"],
  ["out", "Out"],
]);

const valueOf = (item: InventoryItem) =>
  item.unitCost !== null && item.unitCost !== undefined ? item.currentStock * item.unitCost : null;

const minimumOf = (item: InventoryItem) =>
  item.minStock !== null && item.minStock !== undefined ? formatQuantity(item.minStock, item.unit) : null;

function levelDot(item: InventoryItem) {
  const level = stockLevelLabel(item);
  return level ? <StatusDot tone="warn" label={level} /> : null;
}

/** Where a stock item's row leads: its own movements, found by its code. */
const movementsHref = (item: InventoryItem) =>
  `/stores/movements?q=${encodeURIComponent(item.itemCode)}`;

/**
 * On hand — how much of each stock item a site holds, and where.
 *
 * Drawn as the other lists are: the name in the app bar with its one verb,
 * search and filters in the toolbar, the rows flush under it, and each row's
 * verbs behind one menu. The page used to carry a second table of locations
 * under this one, with its own side sheet; locations are their own page now,
 * and a healthy stock level draws nothing — only Low and Out are written.
 */
export default function StoresInventoryPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const inventoryPdfRef = useRef<HTMLDivElement | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState(searchParams.get("siteId") ?? "");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [locationFilter, setLocationFilter] = useState(searchParams.get("locationId") ?? FILTER_ANY);
  const [level, setLevel] = useState(() => {
    const requested = searchParams.get("level");
    return requested && LEVEL_OPTIONS.has(requested) ? requested : FILTER_ANY;
  });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [labelItem, setLabelItem] = useState<InventoryItem | null>(null);

  const {
    data: sites,
    isLoading: sitesLoading,
    error: sitesError,
  } = useQuery({
    queryKey: ["sites"],
    queryFn: fetchSites,
  });
  const activeSiteId = selectedSiteId || sites?.[0]?.id || "";

  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    isSuccess: inventoryLoaded,
    error: inventoryError,
  } = useQuery({
    queryKey: ["inventory-items", activeSiteId, selectedCategory],
    queryFn: () =>
      fetchInventoryItems({
        siteId: activeSiteId,
        category: selectedCategory === "all" ? undefined : selectedCategory,
        limit: 500,
      }),
    enabled: !!activeSiteId,
  });

  const { data: stockLocationsAllData } = useQuery({
    queryKey: ["stock-locations", "all", activeSiteId],
    queryFn: () =>
      fetchStockLocations({
        siteId: activeSiteId,
        limit: 200,
      }),
    enabled: !!activeSiteId,
  });

  const inventoryItems = useMemo(() => inventoryData?.data ?? [], [inventoryData]);
  const locationOptions = useMemo(
    () =>
      new Map((stockLocationsAllData?.data ?? []).map((location) => [location.id, location.name])),
    [stockLocationsAllData],
  );

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return inventoryItems.filter((item) => {
      if (locationFilter !== FILTER_ANY && item.locationId !== locationFilter) return false;
      if (level !== FILTER_ANY) {
        const itemLevel = stockLevelLabel(item);
        if (!itemLevel || (level === "out" && itemLevel !== "Out")) return false;
      }
      if (!needle) return true;
      return [item.name, item.itemCode ?? "", item.location?.name ?? ""].some((value) =>
        value.toLowerCase().includes(needle),
      );
    });
  }, [inventoryItems, level, locationFilter, search]);

  const activeSiteName =
    sites?.find((site) => site.id === activeSiteId)?.name ?? sites?.[0]?.name ?? "No site";
  const categoryLabel =
    selectedCategory === "all" ? "Any category" : stockCategoryLabel(selectedCategory);
  const totalValue = rows.reduce((sum, item) => sum + (valueOf(item) ?? 0), 0);
  const labelPayload = labelItem ? buildInventoryQrPayload(labelItem) : "";
  const labelImageUrl = labelPayload ? buildInventoryQrImageUrl(labelPayload) : "";

  const handleSiteChange = (value: string) => {
    setSelectedSiteId(value);
    setLocationFilter(FILTER_ANY);
  };

  const deleteInventoryMutation = useMutation({
    mutationFn: async (id: string) =>
      fetchJson(`/api/inventory/items/${id}` as const, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Stock item deleted", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["inventory-items"] });
    },
    onError: (error) => {
      toast({
        title: "That stock item was not deleted",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const confirmDelete = (item: InventoryItem) => {
    void dsConfirm({
      title: `Delete ${item.name}?`,
      description:
        "It is removed for good. A stock item that has ever been received or issued cannot be deleted, so its movements stay in the history.",
      confirmLabel: "Delete stock item",
      variant: "danger",
    }).then((confirmed) => {
      if (confirmed) deleteInventoryMutation.mutate(item.id);
    });
  };

  const handleLabelPrint = () => {
    if (!labelItem) return;

    const payload = buildInventoryQrPayload(labelItem);
    const imageUrl = buildInventoryQrImageUrl(payload);
    const printWindow = window.open("", "_blank", "noopener,noreferrer,width=460,height=640");

    if (!printWindow) {
      toast({
        title: "The label did not open",
        description: "Allow pop-ups for this site and try again.",
        variant: "destructive",
      });
      return;
    }

    const itemCode = labelItem.itemCode || "No code";
    const locationName = labelItem.location?.name ?? "No location";
    const siteName = labelItem.site?.name ?? "No site";
    const escapedPayload = escapeHtml(payload);

    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Stock label</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 24px;
              color: #111827;
            }
            .label {
              border: 1px solid #d1d5db;
              border-radius: 12px;
              padding: 16px;
              max-width: 380px;
              margin: 0 auto;
            }
            .meta {
              margin: 0 0 12px;
              line-height: 1.45;
              font-size: 12px;
            }
            .meta strong {
              display: inline-block;
              min-width: 80px;
            }
            .qr-wrap {
              display: flex;
              justify-content: center;
              margin: 12px 0;
            }
            .qr {
              width: 260px;
              height: 260px;
              object-fit: contain;
            }
            .payload {
              margin-top: 8px;
              font-size: 10px;
              word-break: break-all;
              color: #4b5563;
            }
            @media print {
              body {
                padding: 0;
              }
              .label {
                border: none;
                max-width: 100%;
              }
            }
          </style>
        </head>
        <body>
          <div class="label">
            <p class="meta"><strong>Code:</strong> ${escapeHtml(itemCode)}</p>
            <p class="meta"><strong>Stock item:</strong> ${escapeHtml(labelItem.name)}</p>
            <p class="meta"><strong>Site:</strong> ${escapeHtml(siteName)}</p>
            <p class="meta"><strong>Location:</strong> ${escapeHtml(locationName)}</p>
            <div class="qr-wrap">
              <img id="qr-image" class="qr" src="${imageUrl}" alt="QR code" />
            </div>
            <div class="payload">${escapedPayload}</div>
          </div>
          <script>
            (function () {
              var img = document.getElementById("qr-image");
              var printed = false;
              function runPrint() {
                if (printed) return;
                printed = true;
                window.focus();
                window.print();
                window.close();
              }
              if (!img) {
                setTimeout(runPrint, 120);
                return;
              }
              if (img.complete) {
                setTimeout(runPrint, 120);
                return;
              }
              img.addEventListener("load", function () { setTimeout(runPrint, 120); });
              img.addEventListener("error", function () { setTimeout(runPrint, 120); });
            })();
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const menuFor = (item: InventoryItem) => (
    <RowMenu
      label={`More for ${item.name}`}
      items={[
        { label: "Print a label", onSelect: () => setLabelItem(item) },
        { label: "Edit stock item", onSelect: () => setEditing(item) },
        {
          label: "Delete stock item",
          onSelect: () => confirmDelete(item),
          destructive: true,
          disabled: deleteInventoryMutation.isPending,
        },
      ]}
    />
  );

  const filtering =
    selectedCategory !== "all" || locationFilter !== FILTER_ANY || level !== FILTER_ANY;
  const emptyTitle = search.trim()
    ? "No stock items match that search"
    : filtering
      ? "No stock items match this filter"
      : "No stock items yet";
  const isLoading = sitesLoading || inventoryLoading;

  const siteChip =
    sites && sites.length > 1 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ViewToolbarChip label="Site" value={activeSiteName} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
          <DropdownMenuRadioGroup value={activeSiteId} onValueChange={handleSiteChange}>
            {sites.map((site) => (
              <DropdownMenuRadioItem key={site.id} value={site.id}>
                {site.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <StoresShell activeTab="inventory" barFromPage>
      <RecordListShell
        title="On hand"
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, code or location"
        searchNoun="stock"
        filters={
          <>
            {siteChip}
            <ViewToolbarFilter
              label="Category"
              value={selectedCategory === "all" ? FILTER_ANY : selectedCategory}
              anyLabel="Any category"
              options={STOCK_CATEGORIES}
              onChange={(next) => setSelectedCategory(next === FILTER_ANY ? "all" : next)}
            />
            <ViewToolbarFilter
              label="Location"
              value={locationFilter}
              anyLabel="Anywhere"
              options={locationOptions}
              onChange={setLocationFilter}
            />
            <ViewToolbarFilter
              label="Level"
              value={level}
              anyLabel="Any level"
              options={LEVEL_OPTIONS}
              onChange={setLevel}
            />
          </>
        }
        filterCount={
          [selectedCategory !== "all", locationFilter !== FILTER_ANY, level !== FILTER_ANY].filter(
            Boolean,
          ).length
        }
        count={inventoryLoaded ? `${rows.length} of ${inventoryItems.length}` : null}
        display={
          <ExportMenu
            variant="outline"
            size="sm"
            onExport={(format: DocumentExportFormat) => {
              if (!inventoryPdfRef.current) return;
              return exportElementToDocument(
                inventoryPdfRef.current,
                `on-hand-${activeSiteId || "all-sites"}.${format}`,
                format,
              );
            }}
            disabled={inventoryLoading || rows.length === 0}
          />
        }
        createLabel="New stock item"
        onCreate={() => setCreating(true)}
        error={sitesError || inventoryError}
      >
        <RecordTable
          rows={rows}
          isLoading={isLoading}
          emptyTitle={emptyTitle}
          rowHref={movementsHref}
          columns={[
            {
              id: "item",
              label: "Stock item",
              cell: (item) => <RecordTableName title={item.name} subtitle={item.itemCode} />,
            },
            {
              id: "level",
              label: "Level",
              width: "6rem",
              cell: levelDot,
            },
            {
              id: "category",
              label: "Category",
              width: "8rem",
              cell: (item) => stockCategoryLabel(item.category),
            },
            {
              id: "location",
              label: "Location",
              width: "10rem",
              cell: (item) => item.location?.name ?? "No location",
            },
            {
              id: "onHand",
              label: "On hand",
              align: "end",
              width: "9rem",
              cell: (item) => (
                <RecordCell kind="number" value={formatQuantity(item.currentStock, item.unit)} />
              ),
            },
            {
              id: "minimum",
              label: "Minimum",
              align: "end",
              width: "8rem",
              cell: (item) => <RecordCell kind="number" value={minimumOf(item) ?? "—"} />,
            },
            {
              id: "value",
              label: "Value",
              align: "end",
              width: "8rem",
              cell: (item) => {
                const value = valueOf(item);
                return <RecordCell kind="money" value={value === null ? "No cost" : formatSignedMoney(value)} />;
              },
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
              rows={rows.map((item) => ({
                id: item.id,
                href: movementsHref(item),
                title: item.name,
                subtitle: [item.itemCode, item.location?.name].filter(Boolean).join(" · "),
                status: levelDot(item),
                facts: [
                  {
                    label: "On hand",
                    value: formatQuantity(item.currentStock, item.unit),
                    kind: "number",
                    primary: true,
                  },
                ],
                actions: menuFor(item),
              }))}
              isLoading={isLoading}
              emptyTitle={emptyTitle}
            />
          }
        />
      </RecordListShell>

      <StockItemDialog
        open={creating || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditing(null);
          }
        }}
        item={editing}
        defaultSiteId={activeSiteId}
        defaultCategory={selectedCategory === "all" ? "CONSUMABLES" : selectedCategory}
      />

      <RecordDialog
        open={labelItem !== null}
        onOpenChange={(open) => {
          if (!open) setLabelItem(null);
        }}
        title={labelItem ? `Label for ${labelItem.name}` : "Print a label"}
        size="sm"
        footer={
          <Button type="button" onClick={handleLabelPrint}>
            Print label
          </Button>
        }
      >
        {labelItem ? (
          <>
            <FactList
              maxWidth={null}
              labelWidth={96}
              items={[
                { label: "Code", value: labelItem.itemCode || "No code", mono: true },
                { label: "Site", value: labelItem.site?.name ?? "No site" },
                { label: "Location", value: labelItem.location?.name ?? "No location" },
              ]}
            />
            <div className="flex justify-center py-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- an external QR service, not a static asset */}
              <img
                src={labelImageUrl}
                alt={`QR code for ${labelItem.name}`}
                className="h-56 w-56 rounded border object-contain"
              />
            </div>
          </>
        ) : null}
      </RecordDialog>

      <div className="absolute left-[-9999px] top-0">
        <div ref={inventoryPdfRef}>
          <PdfTemplate
            title="On hand"
            meta={[
              { label: "Site", value: activeSiteName },
              { label: "Category", value: categoryLabel },
              { label: "Stock items", value: String(rows.length) },
              { label: "Value", value: formatSignedMoney(totalValue) },
            ]}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Code</th>
                  <th className="py-2">Stock item</th>
                  <th className="py-2">Category</th>
                  <th className="py-2">Location</th>
                  <th className="py-2 text-right">On hand</th>
                  <th className="py-2 text-right">Minimum</th>
                  <th className="py-2 text-right">Value</th>
                  <th className="py-2">Level</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const value = valueOf(item);
                  return (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 font-mono">{item.itemCode}</td>
                      <td className="py-2 font-semibold">{item.name}</td>
                      <td className="py-2">{stockCategoryLabel(item.category)}</td>
                      <td className="py-2">{item.location?.name ?? "No location"}</td>
                      <td className="py-2 text-right">
                        {formatQuantity(item.currentStock, item.unit)}
                      </td>
                      <td className="py-2 text-right">{minimumOf(item) ?? "—"}</td>
                      <td className="py-2 text-right">
                        {value !== null ? formatSignedMoney(value) : "—"}
                      </td>
                      <td className="py-2">{stockLevelLabel(item) ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </StoresShell>
  );
}
