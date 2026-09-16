"use client";

import { PageChrome } from "@/components/layout/page-chrome";
import { SchoolDaysContent } from "@/components/schools/academics/school-days-content";

/**
 * The school calendar, as a destination of its own.
 *
 * The events themselves are `SchoolDaysContent`, which already knows how to
 * add, amend and remove a holiday and is also rendered as a tab inside the
 * academic ladder under Master Data. This wrapper adds only what a page owes
 * the layout law and a tab does not: the app bar's name.
 *
 * Two entry points to one component is deliberate, not duplication. Somebody
 * setting up next year's terms wants the calendar beside them; somebody asking
 * whether the school is open on Monday does not want to go through Master Data
 * to find out.
 */
export function SchoolCalendarPageContent() {
  return (
    <>
      <PageChrome title="Calendar" />
      <SchoolDaysContent />
    </>
  );
}
