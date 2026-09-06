import { describe, expect, it } from "vitest";

import { getVisiblePreferencesItems } from "@/lib/preferences/nav";

const ORG_ADMIN_FEATURES = [
  "admin.user-management.directory",
  "admin.sites-sections",
  "hr.employees",
  "core.branding.manage",
];

function idsFor(role: string, enabledFeatures: string[] = ORG_ADMIN_FEATURES) {
  return getVisiblePreferencesItems({ role, enabledFeatures }).map((item) => item.id);
}

describe("preferences navigation", () => {
  it("shows account preferences to every signed-in role", () => {
    expect(idsFor("SALES_EXEC", [])).toEqual(["profile", "notifications", "appearance"]);
  });

  it("shows full organization preferences to superadmins with enabled features", () => {
    expect(idsFor("SUPERADMIN")).toEqual([
      "profile",
      "notifications",
      "appearance",
      "organization",
      "users",
      "sites",
      "departments",
      "branding",
      "templates",
      "billing",
    ]);
  });

  it("keeps manager organization preferences operational and excludes branding templates", () => {
    expect(idsFor("MANAGER")).toEqual([
      "profile",
      "notifications",
      "appearance",
      "organization",
      "users",
      "sites",
      "departments",
      "billing",
    ]);
  });

  it("lets finance officers see billing without broader organization setup", () => {
    expect(idsFor("FINANCE_OFFICER")).toEqual([
      "profile",
      "notifications",
      "appearance",
      "billing",
    ]);
  });
});
