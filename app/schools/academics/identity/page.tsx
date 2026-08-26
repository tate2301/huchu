import { redirect } from "next/navigation";

/** Identity settings moved to Master Data > School Records. */
export default function SchoolsIdentityPage() {
  redirect("/management/master-data/schools/identity");
}
