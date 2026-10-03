import { redirect } from "next/navigation";

/** Insights opens on Sales, the first question. */
export default function RetailInsightsPage() {
  redirect("/retail/insights/sales");
}
