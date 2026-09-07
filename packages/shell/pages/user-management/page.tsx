import { redirect } from "next/navigation";

export default function UserManagementDirectoryPage() {
  redirect("/preferences/organization/users");
}
