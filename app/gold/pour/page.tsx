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
import { fetchGoldPours } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";

export default function GoldPourPage() {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const {
    data: poursData,
    isLoading: poursLoading,
    error: poursError,
  } = useQuery({
    queryKey: ["gold-pours", "history"],
    queryFn: () => fetchGoldPours({ limit: 200 }),
  });

  const pours = useMemo(() => poursData?.data ?? [], [poursData]);

  return (
    <GoldShell
      activeTab="pour"
      description="View and review recorded gold pours"
      actions={
        <Button asChild size="sm">
          <Link href="/gold/pour/new">Record New Pour</Link>
        </Button>
      }
    >
      <RecordSavedBanner entityLabel="gold pour" />
      <ContextHelp href="/help#gold" />
      <Card>
        <CardHeader>
          <CardTitle>Pour History</CardTitle>
          <CardDescription>Recent recorded pours</CardDescription>
        </CardHeader>
        <CardContent>
          {poursLoading ? (
            <p className="text-sm text-muted-foreground">Loading pours...</p>
          ) : poursError ? (
            <Alert variant="destructive">
              <AlertTitle>Unable to load pours</AlertTitle>
              <AlertDescription>{getApiErrorMessage(poursError)}</AlertDescription>
            </Alert>
          ) : pours.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pours recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-3 text-left font-semibold">Date</th>
                    <th className="p-3 text-left font-semibold">Bar ID</th>
                    <th className="p-3 text-left font-semibold">Site</th>
                    <th className="p-3 text-right font-semibold">Gross Weight</th>
                  </tr>
                </thead>
                <tbody>
                  {pours.map((pour) => (
                    <tr
                      key={pour.id}
                      className={`border-b ${createdId === pour.id ? "bg-[var(--status-success-bg)]" : ""}`}
                    >
                      <td className="p-3">{new Date(pour.pourDate).toLocaleString()}</td>
                      <td className="p-3">{pour.pourBarId}</td>
                      <td className="p-3">{pour.site.name}</td>
                      <td className="p-3 text-right">{pour.grossWeight.toFixed(2)} g</td>
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
