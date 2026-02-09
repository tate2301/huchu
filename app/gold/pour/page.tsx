"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GoldShell } from "@/components/gold/gold-shell";
import { fetchEmployees, fetchGoldPours, fetchSites } from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-client";
import { PourForm } from "@/app/gold/components/pour-form";

const goldRoutes = {
  menu: "/gold",
  pour: "/gold/pour",
  dispatch: "/gold/dispatch",
  receipt: "/gold/receipt",
  reconciliation: "/gold/reconciliation",
  audit: "/gold/audit",
} as const;

type GoldView = keyof typeof goldRoutes;

export default function GoldPourPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-forms"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ["sites", "gold"],
    queryFn: () => fetchSites(),
  });
  const {
    data: poursData,
    isLoading: poursLoading,
    error: poursError,
  } = useQuery({
    queryKey: ["gold-pours", "history"],
    queryFn: () => fetchGoldPours({ limit: 200 }),
  });

  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);
  const sites = useMemo(() => sitesData ?? [], [sitesData]);
  const pours = useMemo(() => poursData?.data ?? [], [poursData]);

  const handleNavigate = (view: GoldView) => {
    router.push(goldRoutes[view]);
  };

  return (
    <GoldShell activeTab="pour" description="Record a new gold pour">
      <RecordSavedBanner entityLabel="gold pour" />
      <PourForm
        setViewMode={handleNavigate}
        employees={employees}
        employeesLoading={employeesLoading}
        sites={sites}
        sitesLoading={sitesLoading}
      />
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
