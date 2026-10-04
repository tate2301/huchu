// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Funnel } from "@/lib/icons";
import type { NavItem } from "@/lib/navigation";
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
      href={href}
      {...rest}
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

const rows = (prefix: string, count: number, group?: string): NavItem[] =>
  Array.from({ length: count }, (_, index) => ({
    href: `/${prefix}/${index}`,
    label: `${prefix} ${index}`,
    icon: Funnel,
    ...(group ? { group } : {}),
  }));

/**
 * A CRM beside five other modules: thirteen areas flattened, so it is read
 * whole — Home as its own row, its seven groups as folders.
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

function render(activeHref: string | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <WorkspaceRail
        sections={SECTIONS}
        workspaceLabel="Sales & CRM"
        companyName="Hurudza Creative"
        activeHref={activeHref}
        supportItems={[]}
      />,
    );
  });
}

// The panel's nav, not tier one's column of marks.
const panel = () => container!.querySelector<HTMLElement>('nav:not([aria-label="Areas"])')!;
const title = () => panel().getAttribute("aria-label");
const rowLabels = () => Array.from(panel().querySelectorAll("li a")).map((link) => link.textContent);
const back = () => container!.querySelector<HTMLButtonElement>('button[aria-label^="Back to"]');
const click = (element: Element | null) => act(() => (element as HTMLElement).click());
const rowNamed = (label: string) =>
  Array.from(panel().querySelectorAll("li a")).find((link) => link.textContent === label)!;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("WorkspaceRail", () => {
  it("opens at the folder of the page you are on, and goes back up one level at a time", () => {
    render("/g2/1");
    expect(title()).toBe("Group 2");
    expect(rowLabels()).toEqual(["g2 0", "g2 1", "g2 2", "g2 3"]);

    expect(back()!.getAttribute("aria-label")).toBe("Back to CRM");
    click(back());
    expect(title()).toBe("CRM");
    expect(rowLabels()).toEqual(["Home", ...groups.map((group) => group.label)]);

    expect(back()!.getAttribute("aria-label")).toBe("Back to Sales & CRM");
    click(back());
    expect(title()).toBe("Sales & CRM");
    expect(back()).toBeNull();
    // The map: the loose page first, then the areas.
    expect(rowLabels()).toEqual(["Reports", "CRM", "Module 0", "Module 1", "Module 2", "Module 3", "Module 4"]);
  });

  it("goes down a level from a row, even into the page already open", () => {
    render("/g2/0");
    click(back());
    click(back());
    click(rowNamed("CRM"));
    expect(title()).toBe("CRM");
    click(rowNamed("Group 2"));
    expect(title()).toBe("Group 2");
  });

  it("stands on the map on a loose page, with that row current", () => {
    render("/reports");
    expect(title()).toBe("Sales & CRM");
    expect(rowNamed("Reports").getAttribute("aria-current")).toBe("page");
  });
});
