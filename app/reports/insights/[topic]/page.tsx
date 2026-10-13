import { Suspense } from "react";
import { notFound } from "next/navigation";

import { InsightFrame, InsightLoading } from "@/components/reports/insight-page";
import { SalesInsight } from "@/components/reports/insights/sales-insight";
import { VisitsInsight } from "@/components/reports/insights/visits-insight";

/**
 * Reports → Insights → one topic, in the insight page's shape
 * (PageInsightVisits): Sales (what `/crm/insights` and `/crm/reports` showed)
 * and Site visits (the visits a site-visit form recorded). The period, the
 * chips and the view live in the address, which only the browser knows.
 */
export default async function ReportsInsightPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const page = topic === "sales" ? <SalesInsight /> : topic === "site-visits" ? <VisitsInsight /> : null;
  if (!page) notFound();
  return (
    <Suspense
      fallback={
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      }
    >
      {page}
    </Suspense>
  );
}
