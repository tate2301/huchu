"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton } from "@corelithzw/react";

import {
  ColumnFigure,
  ColumnList,
  ColumnName,
  FactList,
  SectionHeading,
  StatusBadge,
} from "@/components/management/ui";
import { RetailShell } from "@/components/retail/retail-shell";
import { retailMoney } from "@/components/retail/sale-detail";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  cashMovementLabel,
  formatRetailDateTime,
  formatSignedMoney,
  saleTypeLabel,
  tenderLabel,
} from "@/lib/retail/words";

/**
 * One drawer, and everything that happened at it.
 *
 * The screen a manager wants on a Monday morning when Friday's till was short.
 * The facts are laid out as the cash up itself — float, takings, expected,
 * counted — and then the lists behind it in the order somebody checking would
 * read them: cash in and out first, because a short drawer is far more often a
 * drop to the safe nobody recorded than a hundred sales adding up wrong.
 */

type ShiftDetail = {
  id: string;
  shiftNo: string;
  status: string;
  cashierName: string | null;
  registerName: string | null;
  registerCode: string | null;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  notes: string | null;
  site: { id: string; name: string; code: string } | null;
  saleCount: number;
  reversalCount: number;
  salesValue: number;
  tenderMix: Record<string, number>;
  sales: Array<{
    id: string;
    saleNo: string;
    saleType: string;
    status: string;
    totalAmount: number;
    postedAt: string | null;
    customerName: string | null;
  }>;
  cashMovements: Array<{
    id: string;
    type: string;
    reasonCode: string | null;
    amount: number;
    currency: string;
    baseAmount: number;
    reason: string | null;
    recordedByName: string | null;
    createdAt: string;
  }>;
};

const WIDTH = 560;

export default function RetailShiftPage() {
  const params = useParams<{ id: string }>();
  const shiftId = params?.id ?? "";

  const query = useQuery({
    queryKey: ["retail-shift", shiftId],
    enabled: Boolean(shiftId),
    queryFn: () => fetchJson<{ data: ShiftDetail }>(`/api/v2/retail/shifts/${shiftId}`),
  });

  const shift = query.data?.data;
  const tenders = Object.entries(shift?.tenderMix ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const till = shift?.registerName ?? shift?.registerCode ?? null;

  return (
    <RetailShell title={shift?.shiftNo ?? "Shift"}>
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-3" style={{ maxWidth: WIDTH }}>
          <span className="sr-only">Loading the shift</span>
          <Skeleton height={44} />
          <Skeleton height={44} />
          <Skeleton height={44} />
        </div>
      ) : query.isError ? (
        <Alert tone="danger" title="The shift would not load">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !shift ? (
        <p className="text-sm text-[var(--text-muted)]">There is no shift at this address.</p>
      ) : (
        <div>
          {shift.variance ? (
            <StatusBadge tone="warn" context="header">
              {shift.variance < 0 ? "Short" : "Over"}
            </StatusBadge>
          ) : null}

          <SectionHeading maxWidth={WIDTH}>Details</SectionHeading>
          <FactList
            maxWidth={WIDTH}
            items={[
              { label: "Site", value: shift.site?.name ?? "No site", tone: shift.site ? "default" : "muted" },
              { label: "Till", value: till ?? "Not on file", tone: till ? "default" : "muted" },
              {
                label: "Cashier",
                value: shift.cashierName ?? "Not on file",
                tone: shift.cashierName ? "default" : "muted",
              },
              { label: "Opened", value: formatRetailDateTime(shift.openedAt), mono: true },
              {
                label: "Closed",
                value: formatRetailDateTime(shift.closedAt) || "Still open",
                mono: Boolean(shift.closedAt),
                tone: shift.closedAt ? "default" : "muted",
              },
              ...(shift.notes ? [{ label: "Notes", value: shift.notes }] : []),
            ]}
          />

          <SectionHeading maxWidth={WIDTH}>Cash up</SectionHeading>
          <FactList
            maxWidth={WIDTH}
            align="end"
            items={[
              { label: "Opening float", value: retailMoney(shift.openingFloat), mono: true },
              { label: "Takings", value: formatSignedMoney(shift.salesValue), mono: true },
              { label: "Expected", value: retailMoney(shift.expectedCash), mono: true },
              {
                label: "Counted",
                value: shift.countedCash === null ? "Not counted yet" : retailMoney(shift.countedCash),
                mono: shift.countedCash !== null,
                tone: shift.countedCash === null ? "muted" : "default",
              },
              {
                label: "Variance",
                value: shift.variance === null ? "Not counted yet" : formatSignedMoney(shift.variance),
                mono: shift.variance !== null,
                tone: shift.variance === null ? "muted" : shift.variance !== 0 ? "warn" : "default",
              },
            ]}
          />

          <SectionHeading maxWidth={WIDTH} count={shift.cashMovements.length}>
            Cash in and out
          </SectionHeading>
          <ColumnList
            label="Cash in and out"
            maxWidth={WIDTH}
            empty="No cash moved in or out"
            columns={[
              { id: "movement", label: "Movement" },
              { id: "amount", label: "Amount", align: "end" },
            ]}
            rows={shift.cashMovements.map((movement) => ({
              id: movement.id,
              cells: {
                movement: (
                  <ColumnName
                    name={cashMovementLabel(movement.type)}
                    meta={[
                      movement.reason ?? movement.reasonCode,
                      movement.recordedByName,
                      formatRetailDateTime(movement.createdAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                ),
                amount: (
                  <ColumnFigure>
                    {movement.currency === "USD"
                      ? retailMoney(movement.amount)
                      : `${movement.amount.toFixed(2)} ${movement.currency}`}
                  </ColumnFigure>
                ),
              },
            }))}
          />

          <SectionHeading maxWidth={WIDTH} count={tenders.length}>
            Tender mix
          </SectionHeading>
          <ColumnList
            label="Tender mix"
            maxWidth={WIDTH}
            empty="No sales on this shift yet"
            columns={[
              { id: "tender", label: "Tender" },
              { id: "amount", label: "Amount", align: "end" },
            ]}
            rows={tenders.map(([tender, value]) => ({
              id: tender,
              cells: {
                tender: <ColumnName name={tenderLabel(tender)} />,
                amount: <ColumnFigure>{formatSignedMoney(value)}</ColumnFigure>,
              },
            }))}
          />

          <SectionHeading maxWidth={WIDTH} count={shift.sales.length}>
            Sales
          </SectionHeading>
          <ColumnList
            label="Sales"
            maxWidth={WIDTH}
            empty="No sales on this shift yet"
            columns={[
              { id: "sale", label: "Sale" },
              { id: "total", label: "Total", align: "end" },
            ]}
            rows={shift.sales.map((sale) => ({
              id: sale.id,
              cells: {
                sale: (
                  <ColumnName
                    code={sale.saleNo}
                    name={sale.customerName ?? "Walk-in"}
                    meta={[
                      sale.saleType === "SALE" ? null : saleTypeLabel(sale.saleType),
                      formatRetailDateTime(sale.postedAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    href={`/retail/sales/${sale.id}`}
                  />
                ),
                total: <ColumnFigure>{formatSignedMoney(sale.totalAmount)}</ColumnFigure>,
              },
            }))}
          />
        </div>
      )}
    </RetailShell>
  );
}
