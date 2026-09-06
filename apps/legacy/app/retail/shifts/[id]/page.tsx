"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Alert, Skeleton, StatCard } from "@corelithzw/react";

import { RetailShell } from "@corelithzw/module-sell/components/retail-shell";
import { retailMoney, retailTypeLabel } from "@corelithzw/module-sell/components/sale-detail";
import { Button } from "@corelithzw/ui/components/button";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { ReceiptLong } from "@corelithzw/ui/lib/icons";

/**
 * One drawer, and everything that happened at it.
 *
 * R-4.3. This is the screen a manager wants on a Monday morning when Friday's
 * till was short. The list could show a hundred shifts and a variance column;
 * it could not answer the only question that matters after that, which is
 * *where did the difference come from*.
 *
 * So the page is laid out as the reconciliation itself — float, takings, what
 * was banked mid-shift, expected, counted — and then the two ledgers behind it,
 * in the order somebody checking would read them.
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

function when(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function RetailShiftDetailPage() {
  const params = useParams<{ id: string }>();
  const shiftId = params?.id ?? "";

  const query = useQuery({
    queryKey: ["retail-shift", shiftId],
    enabled: Boolean(shiftId),
    queryFn: () => fetchJson<{ data: ShiftDetail }>(`/api/v2/retail/shifts/${shiftId}`),
  });

  const shift = query.data?.data;
  const tenders = Object.entries(shift?.tenderMix ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <RetailShell
      area="shifts"
      title={shift?.shiftNo ?? "Shift"}
      description={
        shift
          ? `${shift.cashierName ?? "Unknown cashier"} · ${shift.registerName ?? "Unknown till"} · ${shift.status}`
          : "One drawer, its takings and its cash-up."
      }
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/retail/shifts">
            <ReceiptLong className="h-4 w-4" />
            All shifts
          </Link>
        </Button>
      }
    >
      {query.isPending ? (
        <div aria-busy="true" aria-live="polite" className="space-y-4">
          <span className="sr-only">Fetching the shift…</span>
          <Skeleton height={104} />
          <Skeleton height={280} />
        </div>
      ) : query.isError ? (
        <Alert tone="danger" title="That shift would not open">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : !shift ? (
        <Alert tone="warn" title="No shift with that reference">
          The link may be from another shop. Open the shifts list and find the
          drawer by its number.
        </Alert>
      ) : (
        <div className="space-y-4">
          {/*
            The reconciliation, in the order it is worked out. Float plus
            takings plus whatever was banked mid-shift is what the drawer should
            hold; what somebody counted is what it did.
          */}
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="Opening float" value={retailMoney(shift.openingFloat)} />
            <StatCard
              label="Takings"
              value={retailMoney(shift.salesValue)}
              footer={`${shift.saleCount} sale(s), ${shift.reversalCount} reversal(s)`}
            />
            <StatCard label="Expected" value={retailMoney(shift.expectedCash)} />
            <StatCard
              label={shift.countedCash === null ? "Not counted yet" : "Counted"}
              value={shift.countedCash === null ? "—" : retailMoney(shift.countedCash)}
              tone={
                shift.variance === null || shift.variance === 0
                  ? "success"
                  : shift.variance < 0
                    ? "danger"
                    : "warn"
              }
              footer={
                shift.variance === null
                  ? "Still open"
                  : shift.variance === 0
                    ? "Balanced"
                    : `${shift.variance > 0 ? "Over" : "Short"} by ${retailMoney(Math.abs(shift.variance))}`
              }
            />
          </div>

          {shift.notes ? (
            <Alert tone="warn" title="Recorded at cash-up">
              {shift.notes}
            </Alert>
          ) : null}

          <div className="grid gap-3 md:grid-cols-4">
            <StatCard label="Branch" value={shift.site?.name ?? "—"} />
            <StatCard label="Till" value={shift.registerCode ?? "—"} />
            <StatCard label="Opened" value={when(shift.openedAt)} />
            <StatCard label="Closed" value={when(shift.closedAt)} />
          </div>

          <section aria-labelledby="shift-tenders">
            <h3 id="shift-tenders" className="t-section t-strong">
              Tender mix
            </h3>
            {tenders.length === 0 ? (
              <p className="t-body-sm t-muted mt-2">Nothing has been rung up at this till yet.</p>
            ) : (
              <ul className="list-plain mt-2">
                {tenders.map(([tender, value]) => (
                  <li key={tender} className="list-item">
                    <span className="lead" aria-hidden="true" />
                    <div>
                      <div className="title bold">{retailTypeLabel(tender)}</div>
                    </div>
                    <NumericCell>{retailMoney(value)}</NumericCell>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/*
            Cash movements sit above the sales on purpose. A short drawer is far
            more often a drop to the safe nobody recorded than a hundred
            receipts adding up wrong, so the shorter list a manager can actually
            check goes first.
          */}
          <section aria-labelledby="shift-cash">
            <h3 id="shift-cash" className="t-section t-strong">
              Cash in and out
            </h3>
            {shift.cashMovements.length === 0 ? (
              <p className="t-body-sm t-muted mt-2">
                Nothing was banked or paid out during this shift.
              </p>
            ) : (
              <ul className="list-plain mt-2">
                {shift.cashMovements.map((movement) => (
                  <li key={movement.id} className="list-item">
                    <span className="lead" aria-hidden="true" />
                    <div>
                      <div className="title bold">{retailTypeLabel(movement.type)}</div>
                      <div className="sub">
                        {movement.reason ?? movement.reasonCode ?? "No reason given"} ·{" "}
                        {movement.recordedByName ?? "Unknown"} · {when(movement.createdAt)}
                      </div>
                    </div>
                    <NumericCell>
                      {movement.currency === "USD"
                        ? retailMoney(movement.amount)
                        : `${movement.amount.toFixed(2)} ${movement.currency}`}
                    </NumericCell>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="shift-sales">
            <h3 id="shift-sales" className="t-section t-strong">
              Transactions
            </h3>
            {shift.sales.length === 0 ? (
              <p className="t-body-sm t-muted mt-2">Nothing has gone through this till.</p>
            ) : (
              <ul className="list-plain mt-2">
                {shift.sales.map((sale) => (
                  <li key={sale.id} className="list-item">
                    <span className="lead" aria-hidden="true" />
                    <div>
                      <div className="title bold">
                        <Link className="underline underline-offset-2" href={`/retail/sales/${sale.id}`}>
                          {sale.saleNo}
                        </Link>
                      </div>
                      <div className="sub">
                        {retailTypeLabel(sale.saleType)} · {sale.customerName ?? "Walk-in"} ·{" "}
                        {when(sale.postedAt)}
                      </div>
                    </div>
                    <NumericCell>{retailMoney(sale.totalAmount)}</NumericCell>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </RetailShell>
  );
}
