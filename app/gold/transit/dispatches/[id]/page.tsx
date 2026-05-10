"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DetailShell, DetailSection, FactGrid } from "@/components/gold/detail-shell";
import { ArrowRightLeft, PackageCheck, Scale, FileCheck } from "@/lib/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusChip } from "@/components/ui/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

type DispatchDetail = {
  id: string;
  dispatchDate: string;
  courier: string;
  vehicle: string | null;
  destination: string;
  sealNumbers: string;
  receivedBy: string | null;
  notes: string | null;
  goldPriceUsdPerGram: number | null;
  valueUsd: number | null;
  goldPour: {
    id: string;
    pourBarId: string;
    grossWeight: number;
    valueUsd: number | null;
    site: { name: string; code: string };
  };
  handedOverBy: { name: string; employeeId: string } | null;
  batches: Array<{
    id: string;
    sortOrder: number;
    goldPour: {
      id: string;
      pourBarId: string;
      grossWeight: number;
      valueUsd: number | null;
      pourDate: string;
      site: { name: string };
    };
  }>;
  buyerReceipts: Array<{
    id: string;
    receiptNumber: string;
    receiptDate: string;
    paidAmount: number;
    paymentMethod: string;
    goldPourId: string | null;
  }>;
  accountingEvents: Array<{
    id: string;
    sourceAction: string;
    status: string;
    amount: number | null;
    netAmount: number | null;
  }>;
};

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const grams = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} g`;

export default function DispatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-dispatch", id],
    queryFn: () => fetchJson<DispatchDetail>(`/api/gold/dispatches/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <DetailShell
        activeTab="dispatches"
        backHref={goldRoutes.transit.dispatches}
        backLabel="Dispatches"
        title="Loading…"
        primary={<Skeleton className="h-64 w-full" />}
        side={<Skeleton className="h-40 w-full" />}
      />
    );
  }

  if (error || !data) {
    return (
      <DetailShell
        activeTab="dispatches"
        backHref={goldRoutes.transit.dispatches}
        backLabel="Dispatches"
        title="Could not load dispatch"
        primary={
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error ? getApiErrorMessage(error) : "Not found"}</AlertDescription>
          </Alert>
        }
        side={<div />}
      />
    );
  }

  const allBatches = data.batches.length
    ? data.batches.map((b) => b.goldPour)
    : [data.goldPour];
  const totalGrams = allBatches.reduce((s, b) => s + b.grossWeight, 0);

  return (
    <DetailShell
      activeTab="dispatches"
      backHref={goldRoutes.transit.dispatches}
      backLabel="Dispatches"
      title={`Dispatch ${data.id.slice(0, 8)}`}
      subtitle={`${new Date(data.dispatchDate).toLocaleString()} · ${data.courier} → ${data.destination}`}
      primary={
        <>
          <DetailSection title="Trip details" icon={ArrowRightLeft} tone="primary">
            <FactGrid
              items={[
                { label: "Courier", value: data.courier },
                { label: "Vehicle", value: data.vehicle ?? "—" },
                { label: "Destination", value: data.destination },
                { label: "Seal numbers", value: data.sealNumbers },
                { label: "Handed over by", value: data.handedOverBy ? `${data.handedOverBy.name} (${data.handedOverBy.employeeId})` : "—" },
                { label: "Received by", value: data.receivedBy ?? "—" },
                { label: "Total weight", value: grams(totalGrams) },
                { label: "Spot value", value: usd(data.valueUsd) },
              ]}
            />
            {data.notes ? (
              <p className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">{data.notes}</p>
            ) : null}
          </DetailSection>

          <DetailSection
            icon={PackageCheck}
            count={allBatches.length}
            title={`Batches in trip`}
            description="Each batch travelled together; receipts may be recorded individually."
          >
            <ul className="divide-y">
              {allBatches.map((b) => {
                const sold = data.buyerReceipts.some(
                  (r) => r.goldPourId === b.id,
                );
                return (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/gold/intake/pours/${b.id}`}
                        className="font-mono font-semibold hover:underline"
                      >
                        {b.pourBarId}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">
                        {b.site.name}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusChip
                        status={sold ? "passing" : "pending"}
                        label={sold ? "Sold" : "Awaiting sale"}
                      />
                      <div className="text-right text-sm">
                        <p className="font-semibold">{grams(b.grossWeight)}</p>
                        <p className="text-xs text-muted-foreground">
                          {usd(b.valueUsd)}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </DetailSection>

          <DetailSection
            title="Receipts"
            icon={Scale}
            count={data.buyerReceipts.length}
            tone={data.buyerReceipts.length > 0 ? "success" : "neutral"}
          >
            {data.buyerReceipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sales recorded for this dispatch yet.</p>
            ) : (
              <ul className="divide-y">
                {data.buyerReceipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <div>
                      <Link href={`/gold/settlement/receipts/${r.id}`} className="font-mono font-semibold hover:underline">
                        {r.receiptNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.receiptDate).toLocaleString()} · {r.paymentMethod.replace(/_/g, " ").toLowerCase()}
                      </p>
                    </div>
                    <p className="font-semibold">{usd(r.paidAmount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        </>
      }
      side={
        <DetailSection title="Accounting events" icon={FileCheck} count={data.accountingEvents.length}>
          {data.accountingEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {data.accountingEvents.map((e) => (
                <li key={e.id} className="py-2">
                  <p className="font-medium">{e.sourceAction}</p>
                  <p className="text-xs text-muted-foreground">
                    {e.status} · {usd(e.netAmount ?? e.amount)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DetailSection>
      }
    />
  );
}
