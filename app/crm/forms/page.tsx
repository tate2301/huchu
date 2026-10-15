import { redirect } from "next/navigation";

/** Intake forms are Build's forms (spec/routes.md §5). */
export default function CrmFormsPage() {
  redirect("/build?kind=forms");
}
