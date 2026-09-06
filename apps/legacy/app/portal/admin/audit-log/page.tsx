import { redirect } from "next/navigation";

export default function AdminAuditLogRoute() {
  redirect("/admin/reliability?view=audit");
}
