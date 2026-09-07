import { redirect } from "next/navigation";

/** Classes moved to Master Data. Links to this route exist in the wild. */
export default function SchoolsClassesPage() {
  redirect("/management/master-data/schools/classes");
}
