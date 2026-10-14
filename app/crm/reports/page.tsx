import { redirect } from "next/navigation";

/** Sales reports became Reports (All reports) and Reports → Insights → Sales; old links land on Reports. */
export default function CrmReportsPage() {
  redirect("/reports");
}
