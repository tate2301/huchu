"use client";

import { ManagementShell } from "@/components/settings/management-shell";
import { SchoolsSubjectsContent } from "@/components/schools/subjects/schools-subjects-content";

/** The subject catalogue — the canonical one; the other two lists link here. */
export default function SchoolsSubjectsMasterDataPage() {
  return (
    <ManagementShell
      area="master-data"
      title="Subjects"
      description="what the school teaches, and which classes take each subject"
    >
      <SchoolsSubjectsContent />
    </ManagementShell>
  );
}
