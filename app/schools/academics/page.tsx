import { redirect } from "next/navigation";

/**
 * The academic ladder moved to Master Data. Links to this route exist in the
 * wild — bookmarks, older notices, the odd printed handbook — so it redirects
 * rather than 404s.
 */
export default function SchoolsAcademicsPage() {
  redirect("/management/master-data/schools/years");
}
