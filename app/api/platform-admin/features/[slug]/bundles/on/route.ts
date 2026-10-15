import { eachOf } from "@/lib/admin/bulk";
import { catalogueBundles, setBundle } from "@/lib/admin/features";

import { workspaceBulk } from "../../../workspace-bulk";

/** A workspace's Bundles › Turn on: each bundle on its own, in the order ticked. */
export const POST = workspaceBulk("workspace.edit", async (operator, workspace, { ids }) => {
  const find = async (codes: string[]) =>
    (await catalogueBundles()).filter((bundle) => codes.includes(bundle.code)).map((bundle) => ({ id: bundle.code, name: bundle.name }));
  return eachOf(ids, find, (bundle) => setBundle(operator, workspace, bundle.id, true), "bundle");
});
