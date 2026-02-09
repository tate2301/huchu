"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import {
  fetchEmployees,
  fetchGoldDispatches,
  fetchGoldPours,
} from "@/lib/api";
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

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-forms"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const { data: poursData } = useQuery({
    queryKey: ["gold-pours"],
    queryFn: () => fetchGoldPours({ limit: 200 }),
  });

  const { data: dispatchesData } = useQuery({
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
      <DispatchForm
        setViewMode={handleNavigate}
        employees={employees}
        employeesLoading={employeesLoading}
        availablePours={availablePours}
      />
    </GoldShell>
  );
}
