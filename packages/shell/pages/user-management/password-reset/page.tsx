import { redirect } from "next/navigation";

export default function UserManagementPasswordResetPage() {
  redirect("/preferences/organization/users");
}
