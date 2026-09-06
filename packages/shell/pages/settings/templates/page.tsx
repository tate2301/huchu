import { redirect } from "next/navigation";

export default function LegacyTemplateSettingsPage() {
  redirect("/preferences/organization/templates");
}
