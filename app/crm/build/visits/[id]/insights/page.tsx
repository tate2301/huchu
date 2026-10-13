import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { InsightFrame, InsightLoading } from "@/components/reports/insight-page";
import { VisitsInsight } from "@/components/reports/insights/visits-insight";
import { authOptions } from "@/lib/auth";

/** A site-visit form's own insights, on the kit in the insight page's shape (PageInsightVisits). */
export default async function VisitFormInsightsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <Suspense
      fallback={
        <InsightFrame>
          <InsightLoading />
        </InsightFrame>
      }
    >
      <VisitsInsight formId={id} />
    </Suspense>
  );
}
