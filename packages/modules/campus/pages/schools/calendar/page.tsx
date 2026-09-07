import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { SchoolCalendarPageContent } from "../../../components/academics/school-calendar-page-content";

/**
 * The school year as it is actually lived — holidays, closures, events.
 *
 * Distinct from the academic ladder under Master Data, which is where a year
 * and its terms are defined. That is setup, done once an intake; this is the
 * thing an office looks at in a given week to answer "are we open on Monday",
 * and it changes all term.
 */
export default async function SchoolsCalendarPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SchoolCalendarPageContent />
    </div>
  );
}
