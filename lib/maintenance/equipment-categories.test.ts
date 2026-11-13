import { describe, expect, it } from "vitest";

import { isEquipmentCategoryAllowed } from "./equipment-categories";

describe("isEquipmentCategoryAllowed", () => {
  it("accepts the workspace's own categories, as the maintenance screen offers them", () => {
    expect(isEquipmentCategoryAllowed({ category: "CRUSHER", workspaceProfile: "GOLD_MINE", enabledFeatures: [] })).toBe(true);
    expect(isEquipmentCategoryAllowed({ category: "BUILDING", workspaceProfile: "SCHOOLS", enabledFeatures: [] })).toBe(true);
  });

  it("refuses another vertical's category", () => {
    expect(isEquipmentCategoryAllowed({ category: "BUILDING", workspaceProfile: "GOLD_MINE", enabledFeatures: [] })).toBe(false);
    expect(isEquipmentCategoryAllowed({ category: "CRUSHER", workspaceProfile: "RETAIL", enabledFeatures: [] })).toBe(false);
  });

  it("keeps a record's existing category valid", () => {
    expect(
      isEquipmentCategoryAllowed({ category: "CRUSHER", workspaceProfile: "RETAIL", enabledFeatures: [], current: "CRUSHER" }),
    ).toBe(true);
  });
});
