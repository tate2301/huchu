import { redirect } from "next/navigation";

/** The template library moved to Build (spec/routes.md §5). */
export default function TemplatesPage() {
  redirect("/build/templates");
}
