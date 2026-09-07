import { redirect } from "next/navigation";

/**
 * The register moved to `/portal/teacher/attendance` when the portal got its
 * own shell and a rail that already names the class. Kept as a redirect
 * because the portal navigation catalogue still points here.
 */
export default function TeacherRegisterAliasPage() {
  redirect("/portal/teacher/attendance");
}
