import { eachOf } from "@/lib/admin/bulk";
import { featureFacts, resetFeature } from "@/lib/admin/features";

import { workspaceBulk } from "../../workspace-bulk";

/** A workspace's Features › Back to what its verticals say: each hand switch taken away. */
export const POST = workspaceBulk("workspace.edit", async (operator, workspace, { ids }) => {
  const facts = await featureFacts(workspace.id);
  const find = async (keys: string[]) => facts.features.filter((feature) => keys.includes(feature.key)).map((feature) => ({ id: feature.key, name: feature.name }));
  return eachOf(ids, find, (feature) => resetFeature(operator, workspace, feature.id, facts), "feature");
});
