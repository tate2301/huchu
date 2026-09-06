import { redirect } from "next/navigation";

export default function AdminAddonsRoute() {
  redirect("/admin/commercial?view=bundles");
}
