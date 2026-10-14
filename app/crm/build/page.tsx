import { redirect } from "next/navigation";

/** The CRM's Build is Build, a module of its own (spec/routes.md §5). */
export default function CrmBuildPage() {
  redirect("/build");
}
