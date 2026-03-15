import { redirect } from "next/navigation";

export default function AdminHealthRoute() {
  redirect("/admin/reliability?view=health");
}
