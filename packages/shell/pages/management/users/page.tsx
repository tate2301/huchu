import { redirect } from "next/navigation";

export default function ManagementUsersPage() {
  redirect("/preferences/organization/users");
}
