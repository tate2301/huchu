import { describe, expect, it } from "vitest";
import { navigationSectionsForRole, registerNavigationSections } from "./navigation";

const icon = (() => null) as unknown as import("@corelithzw/ui/lib/icons").LucideIcon;

describe("navigation registry", () => {
  it("filters items by role and drops sections left empty", () => {
    registerNavigationSections([
      {
        id: "people",
        title: "People",
        items: [
          { href: "/people", label: "Directory", icon },
          { href: "/payroll/runs", label: "Runs", icon, roles: ["MANAGER"] },
        ],
      },
      { id: "admin", title: "Admin", items: [{ href: "/admin", label: "Admin", icon, roles: ["SUPERADMIN"] }] },
    ]);
    const forRep = navigationSectionsForRole("SALES_REP");
    expect(forRep.map((section) => section.id)).toEqual(["people"]);
    expect(forRep[0].items.map((item) => item.href)).toEqual(["/people"]);
  });
});
