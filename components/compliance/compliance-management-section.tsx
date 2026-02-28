"use client";

import { useSearchParams } from "next/navigation";
import { RecordSavedBanner } from "@/components/shared/record-saved-banner";
import { ManagementShell } from "@/components/settings/management-shell";
import { IncidentsTab } from "@/components/compliance/incidents-tab";
import { InspectionsTab } from "@/components/compliance/inspections-tab";
import { PermitsTab } from "@/components/compliance/permits-tab";
import { TrainingTab } from "@/components/compliance/training-tab";

type ComplianceSection = "permits" | "inspections" | "incidents" | "training";

const sectionMeta: Record<ComplianceSection, { title: string; description: string }> = {
  permits: {
    title: "Compliance Permits",
    description: "Track permit status, expiry windows, and ownership by site.",
  },
  inspections: {
    title: "Compliance Inspections",
    description: "Manage inspections, due actions, and completion by responsible staff.",
  },
  incidents: {
    title: "Compliance Incidents",
    description: "Log incidents, severity trends, and mitigation updates.",
  },
  training: {
    title: "Compliance Training",
    description: "Monitor training records, expiries, and certificate evidence.",
  },
};

export function ComplianceManagementSection({ section }: { section: ComplianceSection }) {
  const searchParams = useSearchParams();
  const createdId = searchParams.get("createdId");
  const meta = sectionMeta[section];

  return (
    <ManagementShell area="compliance" title={meta.title} description={meta.description}>
      <RecordSavedBanner entityLabel="compliance record" />
      {section === "permits" ? <PermitsTab createdId={createdId} /> : null}
      {section === "inspections" ? <InspectionsTab createdId={createdId} /> : null}
      {section === "incidents" ? <IncidentsTab createdId={createdId} /> : null}
      {section === "training" ? <TrainingTab createdId={createdId} /> : null}
    </ManagementShell>
  );
}

