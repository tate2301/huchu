import { eachOf } from "@/lib/admin/bulk";
import { featureFacts, switchFeature } from "@/lib/admin/features";

import { workspaceBulk } from "../../workspace-bulk";

/** A workspace's Features › Switch on: each feature on by hand. */
export const POST = workspaceBulk("workspace.edit", async (operator, workspace, { ids }) => {
  const facts = await featureFacts(workspace.id);
  const find = async (keys: string[]) => facts.features.filter((feature) => keys.includes(feature.key)).map((feature) => ({ id: feature.key, name: feature.name }));
  return eachOf(ids, find, (feature) => switchFeature(operator, workspace, feature.id, true, undefined, facts), "feature");
});
