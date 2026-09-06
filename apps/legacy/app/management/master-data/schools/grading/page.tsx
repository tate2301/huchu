"use client";

import { MasterDataShell } from "@corelithzw/shell/master-data-shell";
import { GradingContent } from "@/components/schools/academics/grading-content";

/**
 * Grading and publishing.
 *
 * New: grading schemes had a create endpoint and no UI, and a publishing
 * window could only be opened with a REST client.
 */
export default function SchoolsGradingMasterDataPage() {
  return (
    <MasterDataShell
      activeTab="schools-grading"
      title="Grading and Publishing"
      description="Grade boundaries, and the windows in which results may be published."
    >
      <GradingContent />
    </MasterDataShell>
  );
}
