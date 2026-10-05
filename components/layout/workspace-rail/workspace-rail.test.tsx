import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CashRegister, FileText, GearSix, Receipt, Stack, Storefront, Tag } from "@/lib/icons";
import type { RailArea } from "@/lib/rail/areas";
import type { RailModel } from "@/lib/rail/model";

import { WorkspaceRail } from "./workspace-rail";

const floor: RailArea = {
  id: "retail-floor",
  label: "The floor",
  icon: Storefront,
  items: [
    { href: "/retail/sales", label: "Sales", icon: Receipt },
    { href: "/retail/shifts", label: "Shifts", icon: CashRegister },
  ],
};
const products: RailArea = {
  id: "retail-products",
  label: "Products",
  icon: Tag,
  items: [{ href: "/retail/products", label: "Products", icon: Tag }],
};
const stock: RailArea = {
  id: "retail-stock",
  label: "Stock",
  icon: Stack,
  items: [{ href: "/retail/stock", label: "On hand", icon: Stack }],
};
const areasModel: RailModel = {
  shape: "areas",
  areas: [floor, products, stock],
  cost: 999,
  budget: 470,
  pinCapacity: 3,
  overflowing: [],
};
const management = { href: "/management/master-data", label: "Management", icon: GearSix };
const help = { href: "/help", label: "Help", icon: FileText };

function render({
  model = areasModel,
  activeHref = "/retail/shifts",
  panelShown = true,
}: { model?: RailModel; activeHref?: string | null; panelShown?: boolean } = {}) {
  return renderToStaticMarkup(
    <WorkspaceRail
      model={model}
      workspaceLabel="Retail"
      activeHref={activeHref}
      badges={{ "/retail/shifts": "2 open" }}
      tile={<button type="button">HC</button>}
      person={<button type="button">TM</button>}
      management={management}
      supportItems={[help]}
      panelShown={panelShown}
      onOpenPanel={() => {}}
      onCollapse={() => {}}
      onSearch={() => {}}
    />,
  );
}

describe("WorkspaceRail (00-foundations 5.3.2–5.3.3, 98-decisions 5 October)", () => {
  it("draws a mark per module, the current one marked, then the gear to Management and the person", () => {
    const html = render();
    expect(html).toContain('aria-label="Modules"');
    expect(html).toMatch(/aria-label="The floor"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/aria-label="Products"[^>]*aria-current/);
    expect(html).toMatch(/aria-label="Management"[^>]*href="\/management\/master-data"/);
    expect(html.indexOf('aria-label="Management"')).toBeGreaterThan(html.indexOf('aria-label="Stock"'));
    expect(html.indexOf(">TM<")).toBeGreaterThan(html.indexOf('aria-label="Management"'));
  });

  it("opens on the page's module: chevron back to the module list, title, and a separate collapse", () => {
    const html = render();
    expect(html).toContain('<nav aria-label="The floor"');
    expect(html).toContain('aria-label="Back to Retail"');
    expect(html).toContain('aria-label="Collapse the panel"');
    expect(html.indexOf('aria-label="Back to Retail"')).toBeLessThan(html.indexOf('aria-label="Collapse the panel"'));
  });

  it("lists the module's items with the badge, the current item and a pin each", () => {
    const html = render();
    expect(html).toMatch(/href="\/retail\/shifts"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/retail\/shifts"/);
    expect(html).toContain("2 open");
    expect(html).toContain('aria-label="Pin Shifts"');
    expect(html).not.toContain(">On hand<");
  });

  it("keeps Search, Help and Management in the panel", () => {
    const html = render();
    expect(html).toContain(">Search<");
    expect(html).toContain("⌘K");
    expect(html).toMatch(/href="\/help"[^>]*>.*Help/);
    expect(html.match(/href="\/management\/master-data"/g)).toHaveLength(2);
  });

  it("shows the module list when the page belongs to none", () => {
    const html = render({ activeHref: null });
    expect(html).toContain('<nav aria-label="Retail"');
    expect(html).not.toContain('aria-label="Back to Retail"');
    for (const label of ["The floor", "Products", "Stock"]) expect(html).toContain(`>${label}<`);
    expect(html).toContain('href="/retail/stock"');
  });

  it("draws a small workspace flat: every module's items under its title, and no module marks", () => {
    const html = render({ model: { ...areasModel, shape: "flat" } });
    expect(html).not.toContain('aria-label="Back to Retail"');
    expect(html).not.toMatch(/<a[^>]*aria-label="The floor"/);
    for (const label of ["Sales", "Shifts", "On hand"]) expect(html).toContain(`>${label}<`);
  });

  it("leaves the rail alone, with a way to open the panel, when the panel is collapsed", () => {
    const html = render({ panelShown: false });
    expect(html).not.toContain('<nav aria-label="The floor"');
    expect(html).toContain('aria-label="Modules"');
    expect(html).toContain('aria-label="Open the panel"');
  });

  it("opens Setup on its first page inside the shell, not on Shop's settings dialog", () => {
    const setup: RailArea = {
      id: "retail-setup",
      label: "Setup",
      icon: GearSix,
      items: [
        { href: "/preferences/organization", label: "Shop", icon: Storefront },
        { href: "/retail/manage/tills", label: "Tills and devices", icon: GearSix },
      ],
    };
    const html = render({ model: { ...areasModel, areas: [...areasModel.areas, setup] }, activeHref: null });
    expect(html).toMatch(/aria-label="Setup"[^>]*href="\/retail\/manage\/tills"/);
    expect(html).toMatch(/href="\/retail\/manage\/tills"[^>]*>.*?Setup</);
  });

  it("offers a way to turn a module on when the workspace has none", () => {
    const html = render({ model: { ...areasModel, areas: [], shape: "flat" }, activeHref: null });
    expect(html).toContain("No modules yet");
    expect(html).toContain("Turn one on");
  });
});
