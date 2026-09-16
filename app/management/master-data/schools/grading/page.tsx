"use client";

import { ManagementShell } from "@/components/settings/management-shell";
import { GradingContent } from "@/components/schools/academics/grading-content";

/**
 * Grading and publishing.
 *
 * New: grading schemes had a create endpoint and no UI, and a publishing
 * window could only be opened with a REST client.
 */
export default function SchoolsGradingMasterDataPage() {
  return (
    <ManagementShell
      area="master-data"
      title="Grading and publishing"
      description="grade boundaries, and the windows in which results may be published"
    >
      <GradingContent />
    </ManagementShell>
  );
}
