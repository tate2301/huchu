import { Suspense } from "react";

import { TemplateRun } from "@/components/reports/template-run";

/** Reports › a template, run (PageRetailTemplate): every row of "All reports" opens here. */
export default async function RetailTemplatePage({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  return (
    <Suspense>
      <TemplateRun templateRef={ref} />
    </Suspense>
  );
}
