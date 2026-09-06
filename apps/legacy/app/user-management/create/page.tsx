import { redirect } from "next/navigation";

export default function UserManagementCreatePage() {
  redirect("/preferences/organization/users");
}
