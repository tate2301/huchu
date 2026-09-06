import { redirect } from "next/navigation";

/** Templates are global, not a CRM feature. They live at the sidebar root. */
export default function CrmTemplatesPage() {
  redirect("/templates");
}
