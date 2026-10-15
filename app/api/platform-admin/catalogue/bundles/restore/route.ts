import { bulkRoute, eachOf } from "@/lib/admin/bulk";
import { setBundleActive } from "@/lib/admin/catalogue";
import { catalogueBundles } from "@/lib/admin/features";

/** Catalogue › Bundles › Bring back. Only bundles made here; owners only. */
export const POST = bulkRoute("operator.manage", (operator, { ids }) =>
  eachOf(
    ids,
    async (codes) => (await catalogueBundles()).filter((bundle) => codes.includes(bundle.code)).map((bundle) => ({ id: bundle.code, name: bundle.name })),
    (bundle) => setBundleActive(operator, bundle.id, true),
    "bundle",
  ),
);
