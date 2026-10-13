import { redirect } from "next/navigation";

/** Reports moved into Management (PageReportsSettings); old links and bookmarks still land. */
export default function PreferencesReportsPage() {
  redirect("/management/reports");
}
