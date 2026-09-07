import { redirect } from "next/navigation";

export default function AdminFeatureCatalogRoute() {
  redirect("/admin/commercial?view=catalog");
}
