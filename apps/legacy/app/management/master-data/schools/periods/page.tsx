"use client";

import { MasterDataShell } from "@corelithzw/shell/master-data-shell";
import { SchoolDayContent } from "@/components/schools/academics/school-day-content";

/**
 * The school day.
 *
 * New, not a move: the periods and rooms endpoints existed with no screen
 * behind them, and the timetable sent people to "set the school day up under
 * Academics" — a page that did not exist. This is it.
 */
export default function SchoolsPeriodsMasterDataPage() {
  return (
    <MasterDataShell
      activeTab="schools-school-day"
      title="The School Day"
      description="Periods and rooms — the grid a timetable is laid out on."
    >
      <SchoolDayContent />
    </MasterDataShell>
  );
}
