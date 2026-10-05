import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CashRegister, GearSix, Receipt, Storefront, Tag } from "@/lib/icons";
import type { RailModel } from "@/lib/rail/model";

import { WorkspaceRail } from "./workspace-rail";

const floor = {
  id: "retail-floor",
  label: "The floor",
  icon: Storefront,
  items: [
    { href: "/retail/sales", label: "Sales", icon: Receipt },
    { href: "/retail/shifts", label: "Shifts", icon: CashRegister },
  ],
};
const products = { id: "retail-products", label: "Products", icon: Tag, items: [{ href: "/retail/products", label: "Products", icon: Tag }] };
const manage = { id: "retail-manage", label: "Management", icon: GearSix, items: [{ href: "/retail/manage/tills", label: "Tills and devices", icon: GearSix }] };
const model: RailModel = { areas: [floor, products], management: manage };

function render(panelShown = true) {
  return renderToStaticMarkup(
    <WorkspaceRail
      model={model}
      currentArea={floor}
      activeHref="/retail/shifts"
      badges={{ "/retail/shifts": "2 open" }}
      tile={<button type="button">HC</button>}
      panelShown={panelShown}
      onOpenPanel={() => {}}
      onCollapse={() => {}}
    />,
  );
}

describe("WorkspaceRail (00-foundations 5.3.2–5.3.3)", () => {
  it("draws a mark per module, the current one marked, and the gear last", () => {
    const html = render();
    expect(html).toContain('aria-label="Modules"');
    expect(html).toMatch(/aria-label="The floor"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/aria-label="Products"[^>]*aria-current/);
    expect(html.indexOf('aria-label="Management"')).toBeGreaterThan(html.indexOf('aria-label="Products"'));
  });

  it("lists the module's items with the badge and the current item", () => {
    const html = render();
    expect(html).toContain('<nav aria-label="The floor"');
    expect(html).toContain('aria-label="Collapse the panel"');
    expect(html).toMatch(/aria-current="page"[^>]*href="\/retail\/shifts"|href="\/retail\/shifts"[^>]*aria-current="page"/);
    expect(html).toContain("2 open");
    expect(html.match(/aria-current="page"/g)).toHaveLength(2);
  });

  it("leaves the rail alone when the panel is collapsed", () => {
    const html = render(false);
    expect(html).not.toContain('<nav aria-label="The floor"');
    expect(html).toContain('aria-label="Modules"');
  });
});
