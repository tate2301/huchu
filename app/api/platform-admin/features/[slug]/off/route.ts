import { eachOf } from "@/lib/admin/bulk";
import { featureFacts, switchFeature } from "@/lib/admin/features";

import { workspaceBulk } from "../../workspace-bulk";

/** A workspace's Features › Switch off: each feature off by hand, with the reason the owner reads. */
export const POST = workspaceBulk("workspace.edit", async (operator, workspace, { ids, reason }) => {
  const facts = await featureFacts(workspace.id);
  const find = async (keys: string[]) => facts.features.filter((feature) => keys.includes(feature.key)).map((feature) => ({ id: feature.key, name: feature.name }));
  return eachOf(ids, find, (feature) => switchFeature(operator, workspace, feature.id, false, reason, facts), "feature");
});
