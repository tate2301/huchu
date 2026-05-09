"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { DetailShell, DetailSection, FactGrid } from "@/components/gold/detail-shell";
import { Scale, Gem, ArrowRightLeft, FileCheck } from "@/lib/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

type ReceiptDetail = {
  id: string;
  receiptNumber: string;
  receiptDate: string;
  assayResult: number | null;
  paidAmount: number;
  paidValueUsd: number | null;
  paymentMethod: string;
  paymentChannel: string | null;
  paymentReference: string | null;
  notes: string | null;
  goldPriceUsdPerGram: number | null;
  goldPour: {
    id: string;
    pourBarId: string;
    grossWeight: number;
    pourDate: string;
    valueUsd: number | null;
    site: { id: string; name: string; code: string };
    goldShiftAllocation: {
      id: string;
      date: string;
      shift: string;
      workerShareWeight: number;
      companyShareWeight: number;
    } | null;
  } | null;
  goldDispatch: {
    id: string;
    dispatchDate: string;
    courier: string;
    destination: string;
    sealNumbers: string;
    goldPour: {
      id: string;
      pourBarId: string;
      grossWeight: number;
      valueUsd?: number | null;
      site: { id: string; name: string; code: string };
    };
  } | null;
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

export default function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-receipt", id],
    queryFn: () => fetchJson<ReceiptDetail>(`/api/gold/receipts/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <DetailShell
        activeTab="sales"
        backHref={goldRoutes.settlement.receipts}
        backLabel="Sales"
        title="Loading…"
        primary={<Skeleton className="h-64 w-full" />}
        side={<Skeleton className="h-40 w-full" />}
      />
    );
  }

  if (error || !data) {
    return (
      <DetailShell
        activeTab="sales"
        backHref={goldRoutes.settlement.receipts}
        backLabel="Sales"
        title="Could not load receipt"
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

  const pour = data.goldPour ?? data.goldDispatch?.goldPour ?? null;

  return (
    <DetailShell
      activeTab="sales"
      backHref={goldRoutes.settlement.receipts}
      backLabel="Sales"
      title={data.receiptNumber}
      subtitle={`Sold ${new Date(data.receiptDate).toLocaleString()} · ${data.paymentMethod.replace(/_/g, " ").toLowerCase()}`}
      primary={
        <>
          <DetailSection title="Sale details" icon={Scale} tone="success">
            <FactGrid
              items={[
                { label: "Receipt #", value: data.receiptNumber },
                { label: "Sale date", value: new Date(data.receiptDate).toLocaleString() },
                { label: "Paid", value: usd(data.paidValueUsd ?? data.paidAmount) },
                { label: "Tested gold", value: data.assayResult != null ? grams(data.assayResult) : "—" },
                { label: "Payment method", value: data.paymentMethod.replace(/_/g, " ").toLowerCase() },
                { label: "Payment channel", value: data.paymentChannel ?? "—" },
                { label: "Reference", value: data.paymentReference ?? "—" },
                { label: "Spot $/g", value: usd(data.goldPriceUsdPerGram) },
              ]}
            />
            {data.notes ? (
              <p className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">{data.notes}</p>
            ) : null}
          </DetailSection>

          {pour ? (
            <DetailSection
              title="Linked batch"
              icon={Gem}
              tone="primary"
              actions={
                <Link href={`/gold/intake/pours/${pour.id}`} className="text-xs text-primary hover:underline">
                  Open batch →
                </Link>
              }
            >
              <FactGrid
                items={[
                  { label: "Batch", value: pour.pourBarId },
                  { label: "Site", value: `${pour.site.name} (${pour.site.code})` },
                  { label: "Gross weight", value: grams(pour.grossWeight) },
                  { label: "Spot value at pour", value: usd(pour.valueUsd) },
                ]}
              />
              {data.goldPour?.goldShiftAllocation ? (
                <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">From shift allocation</p>
                  <p className="text-xs text-muted-foreground">
                    {data.goldPour.goldShiftAllocation.shift} ·{" "}
                    {new Date(data.goldPour.goldShiftAllocation.date).toLocaleDateString()} · Mdara{" "}
                    {grams(data.goldPour.goldShiftAllocation.companyShareWeight)} · Boys{" "}
                    {grams(data.goldPour.goldShiftAllocation.workerShareWeight)}
                  </p>
                  <Link
                    href={`/gold/insights/allocations/${data.goldPour.goldShiftAllocation.id}`}
                    className="text-xs text-primary hover:underline"
                  >
                    Open allocation →
                  </Link>
                </div>
              ) : null}
            </DetailSection>
          ) : null}

          {data.goldDispatch ? (
            <DetailSection
              title="Dispatch"
              icon={ArrowRightLeft}
              tone="warning"
              actions={
                <Link href={`/gold/transit/dispatches/${data.goldDispatch.id}`} className="text-xs text-primary hover:underline">
                  Open dispatch →
                </Link>
              }
            >
              <FactGrid
                items={[
                  { label: "Dispatch", value: data.goldDispatch.id.slice(0, 8) },
                  { label: "Courier", value: data.goldDispatch.courier },
                  { label: "Destination", value: data.goldDispatch.destination },
                  { label: "Seals", value: data.goldDispatch.sealNumbers },
                  { label: "Date", value: new Date(data.goldDispatch.dispatchDate).toLocaleString() },
                ]}
              />
            </DetailSection>
          ) : null}
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
