"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { ContextHelp } from "@/components/shared/context-help";
import { Button } from "@/components/ui/button";
import { GoldShell } from "@/components/gold/gold-shell";
import { fetchEmployees, fetchSites } from "@/lib/api";
import { PourForm } from "@/app/gold/components/pour-form";

const formRoutes = {
  menu: "/gold",
  pour: "/gold/pour/new",
  dispatch: "/gold/dispatch/new",
  receipt: "/gold/receipt/new",
  reconciliation: "/gold/reconciliation",
  audit: "/gold/audit",
} as const;

type GoldView = keyof typeof formRoutes;

export default function GoldPourCreatePage() {
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
    router.push(formRoutes[view]);
  };

  return (
    <GoldShell
      activeTab="pour"
      description="Record a new gold pour"
      actions={
        <Button asChild variant="outline" size="sm">
          <Link href="/gold/pour">View Pour History</Link>
        </Button>
      }
    >
      <ContextHelp href="/help#gold" />
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

