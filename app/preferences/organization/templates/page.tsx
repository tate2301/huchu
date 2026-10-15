import { redirect } from "next/navigation";

/** Document templates moved from Management to Build (PageBuildTemplates, spec/routes.md §5). */
export default function PreferencesTemplatesPage() {
  redirect("/build/templates");
}
