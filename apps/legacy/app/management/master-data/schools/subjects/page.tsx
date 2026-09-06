"use client";

import { MasterDataShell } from "@/components/management/master-data/master-data-shell";
import { SchoolsSubjectsContent } from "@/components/schools/subjects/schools-subjects-content";

/** The subject catalogue — the canonical one; the other two lists link here. */
export default function SchoolsSubjectsMasterDataPage() {
  return (
    <MasterDataShell
      activeTab="schools-subjects"
      title="Subjects"
      description="What the school teaches, and which classes take each subject."
    >
      <SchoolsSubjectsContent />
    </MasterDataShell>
  );
}
