import { redirect } from "next/navigation";

/**
 * School reports moved to Reports: Collections and Arrears are the Fees
 * insight; Enrolment and Hostel occupancy are reports of their own
 * (`/reports/school-enrolment`, `/reports/school-boarding`).
 */
export default async function SchoolsReportsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  if (view === "enrollment") redirect("/reports/school-enrolment");
  if (view === "occupancy") redirect("/reports/school-boarding");
  redirect("/reports/insights/fees");
}
