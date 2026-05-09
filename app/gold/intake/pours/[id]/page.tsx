"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { DetailShell, DetailSection, FactGrid } from "@/components/gold/detail-shell";
import { Gem, ArrowRightLeft, Scale, FileCheck, Building2, Coins } from "@/lib/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusChip } from "@/components/ui/status-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

type PourDetail = {
  id: string;
  pourBarId: string;
  pourDate: string;
  grossWeight: number;
  estimatedPurity: number | null;
  storageLocation: string;
  additionalExpensesWeight: number | null;
  additionalExpensesNote: string | null;
  notes: string | null;
  goldPriceUsdPerGram: number | null;
  valueUsd: number | null;
  site: { id: string; name: string; code: string };
  witness1: { name: string; employeeId: string } | null;
  witness2: { name: string; employeeId: string } | null;
  createdBy: { name: string } | null;
  createdAt: string;
  goldShiftAllocation: {
    id: string;
    date: string;
    shift: string;
    totalWeight: number;
    netWeight: number;
    workerShareWeight: number;
    companyShareWeight: number;
    workflowStatus: string;
    shiftReport?: { groupLeader?: { name: string } | null } | null;
    expenses: Array<{ id: string; type: string; weight: number }>;
  } | null;
  dispatches: Array<{
    id: string;
    dispatchDate: string;
    courier: string;
    destination: string;
  }>;
  dispatchBatches: Array<{
    id: string;
    dispatch: { id: string; dispatchDate: string; courier: string; destination: string };
  }>;
  receipts: Array<{
    id: string;
    receiptNumber: string;
    receiptDate: string;
    paidAmount: number;
    paidValueUsd: number | null;
    paymentMethod: string;
  }>;
  inventoryEvents: Array<{
    id: string;
    direction: "IN" | "OUT";
    grams: number;
    eventDate: string;
    valueUsd: number | null;
    notes: string | null;
  }>;
  accountingEvents: Array<{
    id: string;
    sourceType: string | null;
    sourceAction: string;
    status: string;
    amount: number | null;
    netAmount: number | null;
    entryDate: string | null;
    journalEntryId: string | null;
  }>;
  corrections: string | null;
};

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const grams = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} g`;

export default function PourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = useQuery({
    queryKey: ["gold-pour", id],
    queryFn: () => fetchJson<PourDetail>(`/api/gold/pours/${id}`),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <DetailShell
        activeTab="batches"
        backHref={goldRoutes.intake.pours}
        backLabel="Batches"
        title="Loading…"
        primary={<Skeleton className="h-64 w-full" />}
        side={<Skeleton className="h-40 w-full" />}
      />
    );
  }

  if (error || !data) {
    return (
      <DetailShell
        activeTab="batches"
        backHref={goldRoutes.intake.pours}
        backLabel="Batches"
        title="Could not load batch"
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

  const isSold = data.receipts.length > 0;
  const isDispatched = data.dispatches.length > 0 || data.dispatchBatches.length > 0;

  return (
    <DetailShell
      activeTab="batches"
      backHref={goldRoutes.intake.pours}
      backLabel="Batches"
      title={data.pourBarId}
      subtitle={`${data.site.name} (${data.site.code}) · poured ${new Date(data.pourDate).toLocaleString()}`}
      status={
        <StatusChip
          status={isSold ? "passing" : isDispatched ? "warning" : "pending"}
          label={isSold ? "Settled" : isDispatched ? "In transit" : "On site"}
        />
      }
      primary={
        <>
          <DetailSection title="Batch facts" icon={Gem} tone="primary">
            <FactGrid
              items={[
                { label: "Gross weight", value: grams(data.grossWeight) },
                { label: "Spot value at pour", value: usd(data.valueUsd) },
                { label: "Estimated purity", value: data.estimatedPurity != null ? `${data.estimatedPurity}%` : "—" },
                { label: "Storage", value: data.storageLocation },
                { label: "Additional expense weight", value: grams(data.additionalExpensesWeight) },
                { label: "Additional expense note", value: data.additionalExpensesNote ?? "—" },
                { label: "Witness 1", value: data.witness1 ? `${data.witness1.name} (${data.witness1.employeeId})` : "—" },
                { label: "Witness 2", value: data.witness2 ? `${data.witness2.name} (${data.witness2.employeeId})` : "—" },
                { label: "Recorded by", value: data.createdBy?.name ?? "—" },
                { label: "Recorded at", value: new Date(data.createdAt).toLocaleString() },
              ]}
            />
            {data.notes ? (
              <p className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">{data.notes}</p>
            ) : null}
          </DetailSection>

          {data.goldShiftAllocation ? (
            <DetailSection
              title="Originating shift allocation"
              description={`${data.goldShiftAllocation.shift} · ${new Date(data.goldShiftAllocation.date).toLocaleDateString()} · ${data.goldShiftAllocation.workflowStatus}`}
              actions={
                <Link
                  href={`/gold/insights/allocations/${data.goldShiftAllocation.id}`}
                  className="text-xs text-primary hover:underline"
                >
                  Open allocation →
                </Link>
              }
            >
              <FactGrid
                items={[
                  { label: "Group leader", value: data.goldShiftAllocation.shiftReport?.groupLeader?.name ?? "—" },
                  { label: "Total weight", value: grams(data.goldShiftAllocation.totalWeight) },
                  { label: "Net weight", value: grams(data.goldShiftAllocation.netWeight) },
                  { label: "Workers share", value: grams(data.goldShiftAllocation.workerShareWeight) },
                  { label: "Company share", value: grams(data.goldShiftAllocation.companyShareWeight) },
                ]}
              />
              {data.goldShiftAllocation.expenses.length > 0 ? (
                <ul className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {data.goldShiftAllocation.expenses.map((e) => (
                    <li key={e.id} className="rounded border px-2 py-1">
                      {e.type}: {grams(e.weight)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </DetailSection>
          ) : null}

          <DetailSection
            title="Dispatch trail"
            icon={ArrowRightLeft}
            tone={isDispatched ? "warning" : "neutral"}
            count={data.dispatches.length}
          >
            {data.dispatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not dispatched yet.</p>
            ) : (
              <ul className="divide-y">
                {data.dispatches.map((d) => (
                  <li key={d.id} className="flex items-center justify-between py-2">
                    <div>
                      <Link href={`/gold/transit/dispatches/${d.id}`} className="font-mono font-semibold hover:underline">
                        Dispatch {d.id.slice(0, 8)}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(d.dispatchDate).toLocaleString()} · {d.courier} → {d.destination}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection
            title="Sales"
            icon={Scale}
            tone={isSold ? "success" : "neutral"}
            count={data.receipts.length}
          >
            {data.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not sold yet.</p>
            ) : (
              <ul className="divide-y">
                {data.receipts.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2">
                    <div>
                      <Link href={`/gold/settlement/receipts/${r.id}`} className="font-mono font-semibold hover:underline">
                        {r.receiptNumber}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {new Date(r.receiptDate).toLocaleString()} · {r.paymentMethod.replace(/_/g, " ").toLowerCase()}
                      </p>
                    </div>
                    <p className="font-semibold">{usd(r.paidValueUsd ?? r.paidAmount)}</p>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>
        </>
      }
      side={
        <>
          <DetailSection title="Inventory events" icon={Coins}>
            {data.inventoryEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.inventoryEvents.map((e) => (
                  <li key={e.id} className="flex items-center justify-between">
                    <span>{e.direction === "IN" ? "+" : "-"}{grams(e.grams)}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.eventDate).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </DetailSection>

          <DetailSection title="Accounting events" icon={FileCheck}>
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

          {data.corrections ? (
            <DetailSection title="Corrections audit">
              <pre className="whitespace-pre-wrap text-xs">{data.corrections}</pre>
            </DetailSection>
          ) : null}
        </>
      }
    />
  );
}
