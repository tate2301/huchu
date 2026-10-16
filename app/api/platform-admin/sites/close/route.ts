import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { closeWorkspaceSite, sitesByIds } from "@/lib/admin/sites";

/** Sites › Close. Each site on its own; the ones its workspace would not close are named, the rest go through. */
export const POST = bulkRoute("workspace.edit", (operator, { ids, reason }) =>
  eachOf(ids, sitesByIds, (site) => closeWorkspaceSite(operator, site, reason ?? ""), "site"),
);
