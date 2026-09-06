"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageBand } from "@/components/schools/common/page-band";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import {
  fetchSchoolsAcademicYears,
  fetchSchoolsCalendar,
  fetchSchoolsTerms,
} from "@/lib/schools/admin-v2";
import { SchoolDaysContent } from "@/components/schools/academics/school-days-content";
import { SchoolsCalendarContent } from "@/components/schools/academics/schools-calendar-content";

/**
 * Years, terms and the school calendar — the frame everything else is dated
 * against, on one screen under Master Data.
 *
 * These were three separate views inside the school's own Academics page,
 * beside classes and subjects, which put restructuring the year one click from
 * a registrar's daily work. They are reference data, so they moved; the three
 * still belong together because a term is written inside a year and a holiday
 * is written inside a term, and setting one up without seeing the other two is
 * how a school ends up with a Term 2 that starts before Term 1 finishes.
 */

type YearsView = "years" | "terms" | "calendar";

export function SchoolsYearsContent() {
  // Years lead: a year has to exist before a term can, and a term before
  // anything at all can be recorded.
  const [activeView, setActiveView] = useState<YearsView>("years");

  const yearsQuery = useQuery({
    queryKey: ["schools", "academic-years"],
    queryFn: () => fetchSchoolsAcademicYears({ page: 1, limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 200 }),
  });
  const calendarQuery = useQuery({
    queryKey: ["schools", "calendar", "events"],
    queryFn: () => fetchSchoolsCalendar(),
  });

  const years = yearsQuery.data?.data ?? [];
  const terms = termsQuery.data?.data ?? [];
  const events = useMemo(() => calendarQuery.data?.events ?? [], [calendarQuery.data]);

  const currentYear = years.find((year) => year.isActive);
  const currentTerm = terms.find((term) => term.isActive);
  const closedDays = events.filter((event) => !event.isTeachingDay).length;

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          {
            label: "Current year",
            value: currentYear?.name ?? "None",
            tone: currentYear ? "brand" : "warn",
          },
          {
            label: "Current term",
            value: currentTerm?.name ?? "None",
            tone: currentTerm ? "success" : "warn",
          },
          { label: "Days that close the school", value: closedDays },
        ]}
      />

      <VerticalDataViews
        items={[
          { id: "years", label: "Academic years", count: years.length },
          { id: "terms", label: "Terms", count: terms.length },
          { id: "calendar", label: "Holidays & Events", count: events.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as YearsView)}
        railLabel="Calendar views"
      >
        {activeView === "years" || activeView === "terms" ? (
          <SchoolsCalendarContent view={activeView} />
        ) : null}

        {activeView === "calendar" ? (
          <div className="space-y-2">
            <h2 className="text-section-title">Holidays and Events</h2>
            <SchoolDaysContent />
          </div>
        ) : null}
      </VerticalDataViews>
    </div>
  );
}
