import { resolveVerticalDefaults } from "@/lib/platform/vertical-defaults";

/**
 * Whether equipment may be saved under `category` in this workspace.
 *
 * The categories are the workspace's own (`resolveVerticalDefaults`), the same
 * list the maintenance screen offers, plus any a registered extension adds. A
 * category the record already has stays valid, so equipment saved before its
 * workspace's list changed can still be edited.
 */
export function isEquipmentCategoryAllowed(args: {
  category: string;
  workspaceProfile: string | null | undefined;
  enabledFeatures: string[] | undefined;
  current?: string | null;
}): boolean {
  if (args.current && args.category === args.current) return true;
  return resolveVerticalDefaults(args).maintenance.equipmentCategories.includes(args.category);
}
