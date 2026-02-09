"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";

import { ContextHelp } from "@/components/shared/context-help";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoldShell } from "@/components/gold/gold-shell";
import { fetchGoldDispatches } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

export default function GoldDispatchPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");

  const {
    data: dispatchesData,
    isLoading: dispatchesLoading,
    error: dispatchesError,
  } = useQuery({
    queryKey: ["gold-dispatches"],
    queryFn: () => fetchGoldDispatches({ limit: 200 }),
  });

  const dispatches = useMemo(
    () => dispatchesData?.data ?? [],
    [dispatchesData],
  );

  return (
    <GoldShell
      activeTab="dispatch"
      description="View and review gold dispatch manifests"
      actions={
        <Button asChild size="sm">
          <Link href="/gold/dispatch/new">New Dispatch Manifest</Link>
        </Button>
      }
    >
      <RecordSavedBanner entityLabel="gold dispatch" />
      <ContextHelp href="/help#gold" />
      <Card>
        <CardHeader>
          <CardTitle>Dispatch History</CardTitle>
          <CardDescription>Recent dispatch manifests</CardDescription>
        </CardHeader>
        <CardContent>
          {dispatchesLoading ? (
            <p className="text-sm text-muted-foreground">Loading dispatches...</p>
          ) : dispatchesError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load dispatches</AlertTitle>
              <AlertDescription>{getApiErrorMessage(dispatchesError)}</AlertDescription>
            </Alert>
          ) : dispatches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No dispatches recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Date</th>
                    <th className="p-3 text-left font-semibold">Pour</th>
                    <th className="p-3 text-left font-semibold">Courier</th>
                    <th className="p-3 text-left font-semibold">Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {dispatches.map((dispatch) => (
                    <tr
                      key={dispatch.id}
                      className={`border-b ${createdId === dispatch.id ? "bg-[var(--status-success-bg)]" : ""}`}
                    >
                      <td className="p-3">{new Date(dispatch.dispatchDate).toLocaleString()}</td>
                      <td className="p-3">{dispatch.goldPour.pourBarId}</td>
                      <td className="p-3">{dispatch.courier}</td>
                      <td className="p-3">{dispatch.destination}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </GoldShell>
  );
}
