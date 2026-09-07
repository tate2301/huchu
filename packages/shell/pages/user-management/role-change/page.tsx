import { redirect } from "next/navigation";

export default function UserManagementRoleChangePage() {
  redirect("/preferences/organization/users");
}
