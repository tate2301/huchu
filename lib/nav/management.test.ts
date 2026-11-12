import { describe, expect, it } from "vitest";

import { NAV_NODES } from "./registry";
import { activeManagementItem, composeManagement, isManagementPath, MANAGEMENT_GROUPS } from "./management";

const everyEntry = new Set(MANAGEMENT_GROUPS.flatMap((group) => group.items).flatMap((item) => (item.gate.kind === "settings" ? [item.gate.entry] : [])));

describe("composeManagement", () => {
  it("keeps the catalogue's order and drops a group nobody may open", () => {
    const out = composeManagement({ settings: everyEntry, canOpen: (href) => !href.startsWith("/crm") });
    expect(out.map((group) => group.id)).not.toContain("crm");
    expect(out[0]!.id).toBe("workspace");
    expect(out.at(-1)!.id).toBe("account");
  });

  it("asks a moved row of its address, and the settings rail's rows of their entry", () => {
    const out = composeManagement({ settings: new Set(["profile"]), canOpen: (href) => href === "/retail/manage/tills" });
    expect(out.map((group) => [group.id, group.items.map((item) => item.id)])).toEqual([
      ["shop", ["tills"]],
      ["account", ["profile"]],
    ]);
  });

  it("sends Sites to the shop's own page where the workspace runs a shop", () => {
    const out = composeManagement({ settings: new Set(["sites"]), canOpen: (href) => href === "/retail/manage/sites" });
    expect(out[0]!.items[0]).toMatchObject({ id: "sites", href: "/retail/manage/sites" });
  });

  it("gives every row one home: no address twice", () => {
    const hrefs = MANAGEMENT_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("holds nothing the main sidebar still holds", () => {
    const main = new Set(NAV_NODES.flatMap((node) => [node.href, ...(node.kids ?? []).map((kid) => kid.href)]).map((href) => href.split("?")[0]));
    const shared = MANAGEMENT_GROUPS.flatMap((group) => group.items).filter((item) => main.has(item.href.split("?")[0]!));
    expect(shared.map((item) => item.href)).toEqual([]);
  });
});

describe("isManagementPath", () => {
  it("is Management for its own pages and the setup that moved into it", () => {
    for (const path of ["/preferences/profile", "/management/money-and-tax", "/retail/manage/tills", "/books/settings/tax", "/crm/settings", "/payroll/statutory"]) {
      expect(isManagementPath(path)).toBe(true);
    }
    expect(isManagementPath("/activity", new URLSearchParams("view=workspace"))).toBe(true);
  });

  it("is not Management for work", () => {
    for (const path of ["/retail/sales", "/books/invoices", "/payroll/statutory/returns", "/crm/deals", "/activity"]) {
      expect(isManagementPath(path)).toBe(false);
    }
  });
});

describe("activeManagementItem", () => {
  const all = composeManagement({ settings: everyEntry, canOpen: () => true });

  it("lights the longest match", () => {
    expect(activeManagementItem(all, "/preferences/organization/users/u1")).toBe("users");
    expect(activeManagementItem(all, "/preferences/organization")).toBe("general");
  });

  it("lights a CRM settings row by its tab, the first when none is given", () => {
    expect(activeManagementItem(all, "/crm/settings", new URLSearchParams("tab=keys"))).toBe("keys");
    expect(activeManagementItem(all, "/crm/settings")).toBe("pipelines");
  });
});
