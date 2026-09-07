import { redirect } from "next/navigation";

export default function AdminFeaturesRoute() {
  redirect("/admin/commercial?view=catalog");
}
