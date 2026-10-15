import { redirect } from "next/navigation";

/** Document templates moved from Management to Build (spec/routes.md §5). */
export default function LegacyTemplateSettingsPage() {
  redirect("/build/templates");
}
