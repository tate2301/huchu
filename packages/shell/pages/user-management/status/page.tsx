import { redirect } from "next/navigation";

export default function UserManagementStatusPage() {
  redirect("/preferences/organization/users");
}
