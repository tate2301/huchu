import { eachOf } from "@/lib/admin/bulk";
import { isVertical, removeVertical } from "@/lib/admin/verticals";
import { VERTICALS } from "@/lib/platform/verticals";

import { workspaceBulk } from "../../../workspace-bulk";

/** A workspace's Verticals › Remove: its charge stops and what only it brought goes off. */
export const POST = workspaceBulk("workspace.edit", async (operator, workspace, { ids, reason }) => {
  const find = async (names: string[]) => names.filter(isVertical).map((vertical) => ({ id: vertical, name: VERTICALS[vertical].label }));
  return eachOf(ids, find, (vertical) => removeVertical(operator, workspace, vertical.id as keyof typeof VERTICALS, reason), "vertical");
});
