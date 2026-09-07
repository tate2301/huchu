"use client";

import { MasterDataShell } from "@corelithzw/shell/master-data-shell";
import { SchoolsYearsContent } from "../../../../../components/academics/schools-years-content";

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
    <MasterDataShell
      activeTab="schools-years"
      title="Years and Terms"
      description="Academic years, their terms, and the school calendar everything else is dated against."
    >
      <SchoolsYearsContent />
    </MasterDataShell>
  );
}
