"use client";

import { ManagementShell } from "@/components/settings/management-shell";
import { SchoolsYearsContent } from "@/components/schools/academics/schools-years-content";

/**
 * Years, terms and the school calendar.
 *
 * Moved out of the school's own sidebar: this is set up once a year by an
 * administrator and everything else in the module hangs off it, which makes it
 * master data rather than daily work. The old `/schools/academics` route
 * redirects here.
 */
export default function SchoolsYearsMasterDataPage() {
  return (
    <ManagementShell
      area="master-data"
      title="Years and terms"
      description="academic years, their terms, and the school calendar everything else is dated against"
    >
      <SchoolsYearsContent />
    </ManagementShell>
  );
}
