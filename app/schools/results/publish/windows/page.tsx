import { redirect } from "next/navigation";

/**
 * Publish windows are school configuration, not day-to-day results work, so
 * they now live with the rest of the grading set-up under master data. This
 * route stays as the forward for anybody holding an old link.
 */
export default function SchoolsResultsPublishWindowsPage() {
  redirect("/management/master-data/schools/grading");
}
