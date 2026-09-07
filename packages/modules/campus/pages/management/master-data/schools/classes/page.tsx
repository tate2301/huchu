"use client";

import { MasterDataShell } from "@corelithzw/shell/master-data-shell";
import { SchoolsClassesContent } from "../../../../../components/classes/schools-classes-content";

/** The year-group ladder and the streams inside each one. */
export default function SchoolsClassesMasterDataPage() {
  return (
    <MasterDataShell
      activeTab="schools-classes"
      title="Classes and Streams"
      description="The year-group ladder and the streams inside each one."
    >
      <SchoolsClassesContent />
    </MasterDataShell>
  );
}
