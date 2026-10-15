import * as React from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { InsightFrame, InsightLoading } from "@/components/reports/insight-page";
import { FeesInsight } from "@/components/reports/insights/fees-insight";
import { PayCostInsight } from "@/components/reports/insights/pay-cost-insight";
import { ProductionInsight } from "@/components/reports/insights/production-insight";
import { SalesInsight } from "@/components/reports/insights/sales-insight";
import { VisitsInsight } from "@/components/reports/insights/visits-insight";

const INSIGHTS: Record<string, () => React.ReactNode> = {
  sales: () => <SalesInsight />,
  "site-visits": () => <VisitsInsight />,
  // A school's, a gold mine's and a payroll bureau's (PageSchoolFees, PageMineProduction, PagePayCost).
  fees: () => <FeesInsight />,
  production: () => <ProductionInsight />,
  "pay-cost": () => <PayCostInsight />,
};

/**
 * Reports → Insights → one topic, in the insight page's shape
 * (PageInsightVisits): Sales (what `/crm/insights` and `/crm/reports` showed)
 * and Site visits (the visits a site-visit form recorded). The period, the
 * chips and the view live in the address, which only the browser knows.
 */
export default async function ReportsInsightPage({ params }: { params: Promise<{ topic: string }> }) {
  const { topic } = await params;
  const page = INSIGHTS[topic]?.() ?? null;
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
