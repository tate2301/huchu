"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { Button } from "@/components/ui/button";
import { fetchEmployees, fetchGoldDispatches, fetchGoldPours } from "@/lib/api";
import { DispatchForm } from "@/app/gold/components/dispatch-form";
import { goldRoutes, mapLegacyGoldViewToRoute } from "@/app/gold/routes";

export default function GoldTransitDispatchCreatePage() {
  const router = useRouter();

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-transit"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const { data: poursData } = useQuery({
    queryKey: ["gold-pours", "dispatch-form"],
    queryFn: () => fetchGoldPours({ limit: 300 }),
  });

  const { data: dispatchesData } = useQuery({
    queryKey: ["gold-dispatches", "dispatch-form"],
    queryFn: () => fetchGoldDispatches({ limit: 300 }),
  });

  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);
  const pours = useMemo(() => poursData?.data ?? [], [poursData]);
  const dispatches = useMemo(() => dispatchesData?.data ?? [], [dispatchesData]);

  const dispatchCountByPourId = useMemo(() => {
    const map = new Map<string, number>();
    dispatches.forEach((dispatch) => {
      const current = map.get(dispatch.goldPourId) ?? 0;
      map.set(dispatch.goldPourId, current + 1);
    });
    return map;
  }, [dispatches]);

  const availablePours = useMemo(
    () =>
      pours
        .map((pour) => ({
          ...pour,
          dispatchCount: dispatchCountByPourId.get(pour.id) ?? 0,
        }))
        .sort((left, right) => right.pourDate.localeCompare(left.pourDate)),
    [dispatchCountByPourId, pours],
  );

  return (
    <GoldShell
      activeTab="transit"
      title="Dispatches"
      description="Record a new batch dispatch"
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href={goldRoutes.transit.dispatches}>View Dispatches</Link>
        </Button>
      }
    >
      <PageIntro
        title="Record Dispatch"
        purpose="Move a batch into transit with full custody details."
        nextStep="Select a batch, fill dispatch details, and save."
      />
      <DispatchForm
        setViewMode={(view) => router.push(mapLegacyGoldViewToRoute(view))}
        employees={employees}
        employeesLoading={employeesLoading}
        availablePours={availablePours}
      />
    </GoldShell>
  );
}
