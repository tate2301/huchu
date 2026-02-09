"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoldShell } from "@/components/gold/gold-shell";
import {
  fetchEmployees,
  fetchGoldDispatches,
  fetchGoldPours,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { DispatchForm } from "@/app/gold/components/dispatch-form";

const goldRoutes = {
  menu: "/gold",
  pour: "/gold/pour",
  dispatch: "/gold/dispatch",
  receipt: "/gold/receipt",
  reconciliation: "/gold/reconciliation",
  audit: "/gold/audit",
} as const;

type GoldView = keyof typeof goldRoutes;

export default function GoldDispatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-forms"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const { data: poursData } = useQuery({
    queryKey: ["gold-pours"],
    queryFn: () => fetchGoldPours({ limit: 200 }),
  });

  const {
    data: dispatchesData,
    isLoading: dispatchesLoading,
    error: dispatchesError,
  } = useQuery({
    queryKey: ["gold-dispatches"],
    queryFn: () => fetchGoldDispatches({ limit: 200 }),
  });

  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);
  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatches = useMemo(
    () => dispatchesData?.data ?? [],
    [dispatchesData],
  );

  const dispatchByPourId = useMemo(() => {
    const map = new Map<string, (typeof dispatches)[number]>();
    dispatches.forEach((dispatch) => {
      map.set(dispatch.goldPourId, dispatch);
    });
    return map;
  }, [dispatches]);

  const availablePours = useMemo(
    () => pours.filter((pour) => !dispatchByPourId.has(pour.id)),
    [dispatchByPourId, pours],
  );

  const handleNavigate = (view: GoldView) => {
    router.push(goldRoutes[view]);
  };

  return (
    <GoldShell
      activeTab="dispatch"
      description="Generate a chain-of-custody manifest"
    >
      <RecordSavedBanner entityLabel="gold dispatch" />
      <DispatchForm
        setViewMode={handleNavigate}
        employees={employees}
        employeesLoading={employeesLoading}
        availablePours={availablePours}
      />
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
