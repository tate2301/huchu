"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IncidentsTab } from "@/components/compliance/incidents-tab";
import { InspectionsTab } from "@/components/compliance/inspections-tab";
import { PermitsTab } from "@/components/compliance/permits-tab";
import { TrainingTab } from "@/components/compliance/training-tab";

type ComplianceTab = "permits" | "inspections" | "incidents" | "training";

const parseTab = (value: string | null): ComplianceTab => {
  if (value === "permits" || value === "inspections" || value === "incidents" || value === "training") {
    return value;
  }
  return "permits";
};

export default function CompliancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<ComplianceTab>(parseTab(searchParams.get("tab")));
  const createdId = searchParams.get("createdId");

  const handleTabChange = (value: string) => {
    const tab = parseTab(value);
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("createdId");
    params.delete("createdAt");
    params.delete("source");
    router.push(`/compliance?${params.toString()}`);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading title="Compliance" description="Permits, inspections, incidents, and training records" />
      <RecordSavedBanner entityLabel="compliance record" />

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="permits">Permits</TabsTrigger>
          <TabsTrigger value="inspections">Inspections</TabsTrigger>
          <TabsTrigger value="incidents">Incidents</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "permits" ? <PermitsTab createdId={createdId} /> : null}
      {activeTab === "inspections" ? <InspectionsTab createdId={createdId} /> : null}
      {activeTab === "incidents" ? <IncidentsTab createdId={createdId} /> : null}
      {activeTab === "training" ? <TrainingTab createdId={createdId} /> : null}
    </div>
  );
}
