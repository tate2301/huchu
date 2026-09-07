import { redirect } from "next/navigation";

export default function AdminTemplatesRoute() {
  redirect("/admin/commercial?view=templates");
}
