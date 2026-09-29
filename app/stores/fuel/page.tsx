"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@corelithzw/react";

import { ListSearch } from "@/components/crm/records/list-search";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { RecordCell, RecordTable } from "@/components/records/record-table";
import { ViewToolbar } from "@/components/records/view-toolbar";
import { movementDelta, movementTypeLabel } from "@/components/stores/stock-words";
import { StoresShell } from "@/components/stores/stores-shell";
import { ExportMenu } from "@/components/ui/export-menu";
import { fetchInventoryItems, fetchStockMovements, type StockMovement } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { type DocumentExportFormat } from "@/lib/documents/export-client";
import { exportElementToDocument } from "@/lib/pdf";
import { formatQuantity, formatRetailDate } from "@/lib/retail/words";

type ParsedNotes = {
  supplier?: string;
  invoiceNo?: string;
  notes?: string;
};

const parseMovementNotes = (raw?: string | null): ParsedNotes => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as ParsedNotes;
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    return { notes: raw };
  }
  return { notes: raw };
};

type LedgerRow = StockMovement & { delta: number; opening: number; closing: number };

/** Who the fuel came from, or what it went into. */
function counterparty(entry: LedgerRow): string {
  if (entry.movementType === "RECEIPT") {
    return parseMovementNotes(entry.notes).supplier || entry.issuedTo || "Not on file";
  }
  return entry.issuedTo || "Not on file";
}

function authorisedBy(entry: LedgerRow): string {
  const name =
    entry.movementType === "RECEIPT"
      ? entry.requestedBy || entry.issuedBy?.name
      : entry.approvedBy || entry.requestedBy || entry.issuedBy?.name;
  return name || "Not on file";
}

const signed = (entry: LedgerRow) =>
  `${entry.delta < 0 ? "−" : "+"}${formatQuantity(Math.abs(entry.delta), entry.unit)}`;

/**
 * Fuel log — every litre in and out, with the balance either side of it.
 *
 * The two tiles over the table (current stock, variance against the minimum)
 * and the green "Fuel stock healthy" banner are gone: a healthy balance draws
 * nothing, and one under the minimum is the only thing said above the log.
 */
export default function StoresFuelPage() {
  const fuelPdfRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const {
    data: inventoryData,
    isLoading: inventoryLoading,
    error: inventoryError,
  } = useQuery({
    queryKey: ["inventory-items", "fuel"],
    queryFn: () => fetchInventoryItems({ category: "FUEL", limit: 500 }),
  });

  const {
    data: movementsData,
    isLoading: movementsLoading,
    error: movementsError,
  } = useQuery({
    queryKey: ["stock-movements", "fuel"],
    queryFn: () => fetchStockMovements({ category: "FUEL", limit: 200 }),
  });

  const fuelItems = useMemo(() => inventoryData?.data ?? [], [inventoryData]);
  const fuelMovements = useMemo(() => movementsData?.data ?? [], [movementsData]);
  const fuelUnit =
    fuelItems.length > 0 && fuelItems.every((item) => item.unit === fuelItems[0].unit)
      ? fuelItems[0].unit
      : "units";
  const fuelStock = fuelItems.reduce((sum, item) => sum + item.currentStock, 0);
  const fuelMin = fuelItems.reduce((sum, item) => sum + (item.minStock ?? 0), 0);
  const fuelBelowMin = fuelMin > 0 && fuelStock < fuelMin;

  // Walked newest first from today's balance, so each row's closing is the
  // opening of the row above it.
  const ledgerRows = useMemo(() => {
    return fuelMovements.reduce(
      (acc, movement) => {
        const delta = movementDelta(movement.movementType, movement.quantity);
        const closing = acc.running;
        const opening = closing - delta;
        return {
          running: opening,
          rows: acc.rows.concat({ ...movement, delta, opening, closing }),
        };
      },
      { running: fuelStock, rows: [] as LedgerRow[] },
    ).rows;
  }, [fuelMovements, fuelStock]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return ledgerRows;
    return ledgerRows.filter((entry) =>
      [counterparty(entry), authorisedBy(entry), entry.referenceId, entry.item?.name ?? ""].some(
        (value) => value.toLowerCase().includes(needle),
      ),
    );
  }, [ledgerRows, search]);

  const pageError = inventoryError || movementsError;
  const emptyTitle = search.trim() ? "No fuel movements match that search" : "No fuel movements yet";

  return (
    <StoresShell activeTab="fuel">
      {pageError ? (
        <Alert tone="danger" title="The fuel log would not load">
          {getApiErrorMessage(pageError)}
        </Alert>
      ) : null}

      {!inventoryLoading && fuelBelowMin ? (
        <Alert tone="warn" title="Fuel is under its minimum">
          {formatQuantity(fuelStock, fuelUnit)} on hand against a minimum of{" "}
          {formatQuantity(fuelMin, fuelUnit)}.
        </Alert>
      ) : null}

      <div>
        <ViewToolbar
          search={
            <ListSearch
              value={search}
              onChange={setSearch}
              placeholder="Search by supplier, equipment, person or reference"
              noun="fuel"
            />
          }
          count={movementsLoading ? null : `${rows.length} of ${ledgerRows.length}`}
          end={
            <ExportMenu
              variant="outline"
              size="sm"
              onExport={(format: DocumentExportFormat) => {
                if (!fuelPdfRef.current) return;
                return exportElementToDocument(
                  fuelPdfRef.current,
                  `fuel-log-${new Date().toISOString().slice(0, 10)}.${format}`,
                  format,
                );
              }}
              disabled={movementsLoading || ledgerRows.length === 0}
            />
          }
        />

        <RecordTable
          rows={rows}
          isLoading={movementsLoading}
          emptyTitle={emptyTitle}
          columns={[
            {
              id: "date",
              label: "Date",
              width: "8rem",
              cell: (entry) => <RecordCell kind="date" value={formatRetailDate(entry.createdAt)} />,
            },
            {
              id: "type",
              label: "Type",
              width: "8rem",
              cell: (entry) => movementTypeLabel(entry.movementType),
            },
            {
              id: "counterparty",
              label: "To or from",
              cell: counterparty,
            },
            {
              id: "quantity",
              label: "Quantity",
              align: "end",
              width: "8rem",
              cell: (entry) => <RecordCell kind="number" value={signed(entry)} />,
            },
            {
              id: "opening",
              label: "Opening",
              align: "end",
              width: "8rem",
              cell: (entry) => (
                <RecordCell kind="number" value={formatQuantity(entry.opening, entry.unit)} />
              ),
            },
            {
              id: "closing",
              label: "Closing",
              align: "end",
              width: "8rem",
              cell: (entry) => (
                <RecordCell kind="number" value={formatQuantity(entry.closing, entry.unit)} />
              ),
            },
            {
              id: "authorised",
              label: "Authorised by",
              width: "10rem",
              cell: authorisedBy,
            },
          ]}
        />
      </div>

      <div className="absolute left-[-9999px] top-0">
        <div ref={fuelPdfRef}>
          <PdfTemplate
            title="Fuel log"
            meta={[
              { label: "On hand", value: formatQuantity(fuelStock, fuelUnit) },
              { label: "Minimum", value: formatQuantity(fuelMin, fuelUnit) },
              { label: "Movements", value: String(rows.length) },
            ]}
          >
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2">Date</th>
                  <th className="py-2">Type</th>
                  <th className="py-2">To or from</th>
                  <th className="py-2 text-right">Quantity</th>
                  <th className="py-2 text-right">Opening</th>
                  <th className="py-2 text-right">Closing</th>
                  <th className="py-2">Authorised by</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-100">
                    <td className="py-2">{formatRetailDate(entry.createdAt)}</td>
                    <td className="py-2">{movementTypeLabel(entry.movementType)}</td>
                    <td className="py-2">{counterparty(entry)}</td>
                    <td className="py-2 text-right">{signed(entry)}</td>
                    <td className="py-2 text-right">{formatQuantity(entry.opening, entry.unit)}</td>
                    <td className="py-2 text-right">{formatQuantity(entry.closing, entry.unit)}</td>
                    <td className="py-2">{authorisedBy(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PdfTemplate>
        </div>
      </div>
    </StoresShell>
  );
}
