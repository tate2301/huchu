import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ListFrame } from "@/components/list-frame/list-frame";
import { authOptions } from "@/lib/auth";
import { areaOf } from "@/lib/reports/areas";
import { retailTemplates } from "@/lib/reports/templates";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

/**
 * Reports › Every template, and an area (70-insights-reports 5.10, 5.11;
 * W-69 step 1): every template the person may open, from the
 * `retail-report-templates` source. Every template is grouped by area;
 * `?area=stock` is that area's templates, by name, with Made by on the row.
 * An area that does not exist, or that holds nothing this person may open
 * (the panel does not draw it), is the list without it.
 */
const EVERY = ["seenBy"] as const;
const AREA = ["madeBy", "seenBy"] as const;

export default async function RetailReportsPage({ searchParams }: { searchParams: Promise<{ area?: string | string[] }> }) {
  const given = (await searchParams).area;
  const area = typeof given === "string" ? areaOf(given) : null;
  if (given !== undefined && !area) redirect("/retail/reports");
  if (area) {
    const user = (await getServerSession(authOptions))?.user;
    // Someone who may not open Reports is refused by the page's own list, not here.
    if (user && canRetailRoleDo(user.role, "retail.reports", "view")) {
      const mine = await retailTemplates({ companyId: user.companyId, userId: user.id, role: user.role });
      if (!mine.some((entry) => entry.area.slug === area.slug)) redirect("/retail/reports");
    }
  }

  return (
    <Suspense>
      {area ? (
        <ListFrame
          key={area.slug}
          source="retail-report-templates"
          title={area.label}
          sub={area.sub}
          rowFilters={AREA}
          defaultSort="name"
          defaultGroup={null}
        />
      ) : (
        <ListFrame
          key="every"
          source="retail-report-templates"
          title="Every template"
          sub="Open one to run it. Change what it shows, then save it as your own."
          rowFilters={EVERY}
        />
      )}
    </Suspense>
  );
}
