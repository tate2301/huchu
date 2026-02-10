"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { DataListShell } from "@/components/shared/data-list-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchGoldDispatches, fetchGoldReceipts } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { goldRoutes } from "@/app/gold/routes";

export default function GoldTransitDispatchesPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const [query, setQuery] = useState("");

  const {
    data: dispatchesData,
    isLoading: dispatchesLoading,
    error: dispatchesError,
    refetch,
  } = useQuery({
    queryKey: ["gold-dispatches", "transit-lane"],
    queryFn: () => fetchGoldDispatches({ limit: 300 }),
  });

  const { data: receiptsData } = useQuery({
    queryKey: ["gold-receipts", "transit-lane"],
    queryFn: () => fetchGoldReceipts({ limit: 300 }),
  });

  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);
  const receipts = useMemo(() => receiptsData?.data ?? [], [receiptsData]);

  const settledDispatchIds = useMemo(() => {
    const ids = new Set<string>();
    receipts.forEach((receipt) => ids.add(receipt.goldDispatch.id));
    return ids;
  }, [receipts]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return dispatches;
    return dispatches.filter((dispatch) => {
      return (
        dispatch.goldPour.pourBarId.toLowerCase().includes(term) ||
        dispatch.courier.toLowerCase().includes(term) ||
        dispatch.destination.toLowerCase().includes(term)
      );
    });
  }, [dispatches, query]);

  return (
    <GoldShell
      activeTab="transit"
      title="Dispatches"
      description="All batch dispatch records"
      actions={
        <Button asChild size="sm">
          <Link href={goldRoutes.transit.newDispatch}>Record Dispatch</Link>
        </Button>
      }
    >
      <PageIntro
        title="Dispatches"
        purpose="Track dispatches until sale is recorded."
        nextStep="Find rows marked Awaiting sale and finish them."
      />
      <RecordSavedBanner entityLabel="batch dispatch" />

      <DataListShell
        title="Dispatch History"
        description="Recorded dispatch entries"
        hasData={filtered.length > 0}
        isLoading={dispatchesLoading}
        isError={Boolean(dispatchesError)}
        errorMessage={dispatchesError ? getApiErrorMessage(dispatchesError) : undefined}
        onRetry={() => void refetch()}
        emptyTitle="No dispatch records"
        emptyDescription="Record dispatch when a batch is ready."
        emptyAction={
          <Button asChild size="sm">
            <Link href={goldRoutes.transit.newDispatch}>Record Dispatch</Link>
          </Button>
        }
        filters={
          <div className="max-w-sm">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by batch, courier, destination"
              aria-label="Search dispatches"
            />
          </div>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="p-3 text-left font-semibold">Date</th>
                <th className="p-3 text-left font-semibold">Batch</th>
                <th className="p-3 text-left font-semibold">Courier</th>
                <th className="p-3 text-left font-semibold">Destination</th>
                <th className="p-3 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((dispatch) => {
                const settled = settledDispatchIds.has(dispatch.id);
                return (
                  <tr
                    key={dispatch.id}
                    className={`border-b ${createdId === dispatch.id ? "bg-[var(--status-success-bg)]" : ""}`}
                  >
                    <td className="p-3">{new Date(dispatch.dispatchDate).toLocaleString()}</td>
                    <td className="p-3 font-medium">{dispatch.goldPour.pourBarId}</td>
                    <td className="p-3">{dispatch.courier}</td>
                    <td className="p-3">{dispatch.destination}</td>
                    <td className="p-3">
                      <Badge variant={settled ? "default" : "secondary"}>
                        {settled ? "Settled" : "Awaiting sale"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DataListShell>
    </GoldShell>
  );
}
