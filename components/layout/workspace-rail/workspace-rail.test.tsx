// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CashRegister, FileText, Funnel, GearSix, Receipt, Stack, Storefront, Tag } from "@/lib/icons";
import type { NavItem } from "@/lib/navigation";
import type { RailArea } from "@/lib/rail/areas";
import { getRailModel, type RailModel } from "@/lib/rail/model";
import type { WorkspaceNavSection } from "@/lib/workspaces";

import { WorkspaceRail } from "./workspace-rail";

vi.mock("next/link", () => ({
  default: ({
    href,
    onClick,
    children,
    ...rest
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      {...rest}
      href={href}
      onClick={(event) => {
        // Following a link is the page's business; the rail only has to react.
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  ),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const rows = (prefix: string, count: number, group?: string): NavItem[] =>
  Array.from({ length: count }, (_, index) => ({
    href: `/${prefix}/${index}`,
    label: `${prefix} ${index}`,
    icon: Funnel,
    ...(group ? { group } : {}),
  }));

/**
 * A CRM beside six other modules: fourteen areas flattened, so each module is
 * read whole — the CRM's Home as a row of its own, its seven groups as folders.
 */
const groups = Array.from({ length: 7 }, (_, index) => ({ id: `g${index}`, label: `Group ${index}` }));
const SECTIONS: WorkspaceNavSection[] = [
  {
    id: "crm",
    title: "CRM",
    flattenGroups: true,
    groups,
    items: [
      { href: "/crm", label: "Home", icon: Funnel },
      ...groups.flatMap((group) => rows(group.id, 4, group.id)),
    ],
  },
  ...Array.from({ length: 5 }, (_, index) => ({
    id: `module-${index}`,
    title: `Module ${index}`,
    items: rows(`module-${index}`, 3),
  })),
  { id: "reports", title: "Reports", items: [{ href: "/reports", label: "Reports", icon: Funnel }] },
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function mount(activeHref: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <WorkspaceRail
        model={getRailModel(SECTIONS)}
        workspaceLabel="Sales & CRM"
        activeHref={activeHref}
        badges={{}}
        tile={<button type="button">HC</button>}
        management={management}
        panelShown
        onOpenPanel={() => {}}
        onCollapse={() => {}}
      />,
    );
  });
}

// The panel's nav, not the rail's column of marks.
const panel = () => container!.querySelector<HTMLElement>('nav:not([aria-label="Modules"])')!;
const title = () => panel().getAttribute("aria-label");
const rowLabels = () => Array.from(panel().querySelectorAll("li a")).map((link) => link.textContent);
const back = () => container!.querySelector<HTMLButtonElement>('button[aria-label^="Back to"]');
const click = (element: Element | null) => act(() => (element as HTMLElement).click());
const rowNamed = (label: string) =>
  Array.from(panel().querySelectorAll("li a")).find((link) => link.textContent === label)!;

describe("WorkspaceRail, a module read whole", () => {
  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    root = null;
    container = null;
  });

  it("opens at the folder of the page you are on, and goes back up one level at a time", () => {
    mount("/g2/1");
    expect(title()).toBe("Group 2");
    expect(rowLabels()).toEqual(["g2 0", "g2 1", "g2 2", "g2 3"]);

    expect(back()!.getAttribute("aria-label")).toBe("Back to CRM");
    click(back());
    expect(title()).toBe("CRM");
    expect(rowLabels()).toEqual(["Home", ...groups.map((group) => group.label)]);
    expect(rowNamed("Group 2").getAttribute("aria-current")).toBe("page");

    expect(back()!.getAttribute("aria-label")).toBe("Back to Sales & CRM");
    click(back());
    expect(title()).toBe("Sales & CRM");
    expect(back()).toBeNull();
    // The module list: a module of one is a module like the rest.
    expect(rowLabels()).toEqual(["CRM", "Module 0", "Module 1", "Module 2", "Module 3", "Module 4", "Reports"]);
  });

  it("goes down a level from a row, even into the page already open", () => {
    mount("/g2/0");
    click(back());
    click(back());
    click(rowNamed("CRM"));
    expect(title()).toBe("CRM");
    click(rowNamed("Group 2"));
    expect(title()).toBe("Group 2");
  });

  it("opens the module, not a folder, on a page outside its folders", () => {
    mount("/crm");
    expect(title()).toBe("CRM");
    expect(rowNamed("Home").getAttribute("aria-current")).toBe("page");
    expect(back()!.getAttribute("aria-label")).toBe("Back to Sales & CRM");
  });

  it("keeps a module of one as a module: its own panel, its page current", () => {
    mount("/reports");
    expect(title()).toBe("Reports");
    expect(rowNamed("Reports").getAttribute("aria-current")).toBe("page");
    expect(container!.querySelector('nav[aria-label="Modules"] a[aria-label="Reports"]')).not.toBeNull();
  });
});
