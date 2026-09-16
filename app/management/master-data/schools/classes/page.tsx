"use client";

import { ManagementShell } from "@/components/settings/management-shell";
import { SchoolsClassesContent } from "@/components/schools/classes/schools-classes-content";

/** The year-group ladder and the streams inside each one. */
export default function SchoolsClassesMasterDataPage() {
  return (
    <ManagementShell
      area="master-data"
      title="Classes and streams"
      description="the year-group ladder and the streams inside each one"
    >
      <SchoolsClassesContent />
    </ManagementShell>
  );
}
