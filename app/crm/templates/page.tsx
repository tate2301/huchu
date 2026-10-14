import { redirect } from "next/navigation";

/** Templates are Build's (spec/routes.md §5). */
export default function CrmTemplatesPage() {
  redirect("/build/templates");
}
