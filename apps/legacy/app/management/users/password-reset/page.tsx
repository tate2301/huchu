import { redirect } from "next/navigation";

export default function ManagementUsersPasswordResetPage() {
  redirect("/preferences/organization/users");
}
