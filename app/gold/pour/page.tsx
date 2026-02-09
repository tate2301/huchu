"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { fetchEmployees, fetchSites } from "@/lib/api";
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

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-forms"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ["sites", "gold"],
    queryFn: () => fetchSites(),
  });

  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);
  const sites = useMemo(() => sitesData ?? [], [sitesData]);

  const handleNavigate = (view: GoldView) => {
    router.push(goldRoutes[view]);
  };

  return (
    <GoldShell activeTab="pour" description="Record a new gold pour">
      <PourForm
        setViewMode={handleNavigate}
        employees={employees}
        employeesLoading={employeesLoading}
        sites={sites}
        sitesLoading={sitesLoading}
      />
    </GoldShell>
  );
}
