"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { GoldShell } from "@/components/gold/gold-shell";
import { PageIntro } from "@/components/shared/page-intro";
import { Button } from "@/components/ui/button";
import { fetchEmployees, fetchSites } from "@/lib/api";
import { PourForm } from "@/app/gold/components/pour-form";
import { goldRoutes, mapLegacyGoldViewToRoute } from "@/app/gold/routes";

export default function GoldIntakePourCreatePage() {
  const router = useRouter();

  const { data: employeesData, isLoading: employeesLoading } = useQuery({
    queryKey: ["employees", "gold-intake"],
    queryFn: () => fetchEmployees({ active: true, limit: 500 }),
  });

  const { data: sitesData, isLoading: sitesLoading } = useQuery({
    queryKey: ["sites", "gold"],
    queryFn: () => fetchSites(),
  });

  const employees = useMemo(() => employeesData?.data ?? [], [employeesData]);
  const sites = useMemo(() => sitesData ?? [], [sitesData]);

  return (
    <GoldShell
      activeTab="intake"
      title="Batches"
      description="Record a new batch"
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href={goldRoutes.intake.pours}>View Batches</Link>
        </Button>
      }
    >
      <PageIntro
        title="Record Batch"
        purpose="Create the first chain record for produced gold."
        nextStep="Fill required fields and submit."
      />
      <PourForm
        setViewMode={(view) => router.push(mapLegacyGoldViewToRoute(view))}
        employees={employees}
        employeesLoading={employeesLoading}
        sites={sites}
        sitesLoading={sitesLoading}
      />
    </GoldShell>
  );
}
