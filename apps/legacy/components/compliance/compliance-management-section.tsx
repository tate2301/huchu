"use client";

import { useSearchParams } from "next/navigation";
import { RecordSavedBanner } from "@corelithzw/ui/shared/record-saved-banner";
import { IncidentsTab } from "@/components/compliance/incidents-tab";
import { InspectionsTab } from "@/components/compliance/inspections-tab";
import { PermitsTab } from "@/components/compliance/permits-tab";
import { TrainingTab } from "@/components/compliance/training-tab";

type ComplianceSection = "permits" | "inspections" | "incidents" | "training";

export function ComplianceManagementSection({ section }: { section: ComplianceSection }) {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  // Each tab renders its own MasterDataPage (shell included); the section only
  // routes to the right tab and passes the saved-record banner through.
  const banner = <RecordSavedBanner entityLabel="compliance record" />;

  if (section === "permits") return <PermitsTab createdId={createdId} banner={banner} />;
  if (section === "inspections") return <InspectionsTab createdId={createdId} banner={banner} />;
  if (section === "incidents") return <IncidentsTab createdId={createdId} banner={banner} />;
  return <TrainingTab createdId={createdId} banner={banner} />;
}
