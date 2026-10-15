import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { reopenWorkspaceSite, sitesByIds } from "@/lib/admin/sites";

/** Sites › Reopen. Each site on its own; refusals are named, the rest go through. */
export const POST = bulkRoute("workspace.edit", (operator, { ids, reason }) =>
  eachOf(ids, sitesByIds, (site) => reopenWorkspaceSite(operator, site, reason), "site"),
);
