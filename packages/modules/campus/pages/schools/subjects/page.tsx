import { redirect } from "next/navigation";

/** Subjects moved to Master Data. Links to this route exist in the wild. */
export default function SchoolsSubjectsPage() {
  redirect("/management/master-data/schools/subjects");
}
