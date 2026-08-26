"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { SchoolDaysContent } from "@/components/schools/academics/school-days-content";
import { fetchSchoolsCalendar } from "@/lib/schools/admin-v2";

/**
 * The school calendar, as a destination of its own.
 *
 * The events themselves are `SchoolDaysContent`, which already knows how to
 * add, amend and remove a holiday and is also rendered as a tab inside the
 * academic ladder under Master Data. This wrapper adds only what a page owes
 * the layout law and a tab does not: the app bar's name, and a band carrying
 * what is coming rather than a second copy of the title.
 *
 * Two entry points to one component is deliberate, not duplication. Somebody
 * setting up next year's terms wants the calendar beside them; somebody asking
 * whether the school is open on Monday does not want to go through Master Data
 * to find out.
 */
export function SchoolCalendarPageContent() {
  const calendarQuery = useQuery({
    queryKey: ["schools", "calendar", "events"],
    queryFn: () => fetchSchoolsCalendar(),
  });

  const chips = useMemo(() => {
    const events = calendarQuery.data?.events ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcoming = events.filter((event) => new Date(event.startDate) >= today);
    // A day with no teaching is the one a school gets caught by: everything
    // else on this list is an event people opt into, and a day the gates are
    // shut is a day registers, meals and buses all have to know about.
    const closures = upcoming.filter((event) => !event.isTeachingDay);

    return [
      { label: "Still to come", value: upcoming.length },
      {
        label: "Closures ahead",
        value: closures.length,
        tone: closures.length > 0 ? ("warn" as const) : ("neutral" as const),
      },
    ];
  }, [calendarQuery.data]);

  return (
    <>
      <PageChrome title="Calendar" />
      <PageBand chips={chips} />
      <SchoolDaysContent />
    </>
  );
}
