import { redirect } from "next/navigation";

/** The CRM's insights moved to Reports → Insights → Sales; old links still land there. */
export default async function CrmInsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const range = (await searchParams).range;
  redirect(typeof range === "string" && ["30d", "90d", "12m"].includes(range) ? `/reports/insights/sales?period=${range}` : "/reports/insights/sales");
}
