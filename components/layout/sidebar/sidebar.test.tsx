// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { composeNav } from "@/lib/nav/compose";
import { activeNav } from "@/lib/nav/match";
import { NO_PREFS, type NavPrefs } from "@/lib/nav/prefs";

import { Sidebar } from "./sidebar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/core/vane-mark", () => ({ VaneMark: () => <span /> }));

const groups = composeNav({ canOpen: () => true });
const nodes = groups.flatMap((group) => group.items);
// A node whose name no other node shares (Retail and Books both have a Sales).
const first = nodes.find((node) => node.kids.length > 0 && nodes.filter((other) => other.label === node.label).length === 1)!;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function setup(prefs: NavPrefs = NO_PREFS, pathname = "/") {
  const onPref = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <Sidebar
        groups={groups}
        active={activeNav(groups, pathname, null)}
        badges={{}}
        prefs={prefs}
        onPref={onPref}
        tile={<span>tile</span>}
        person={<span>person</span>}
      />,
    );
  });
  return onPref;
}

const links = () => [...host!.querySelectorAll("a")].map((a) => a.textContent?.trim());
const button = (label: string) => host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ?? [...host!.querySelectorAll("button")].find((b) => b.textContent?.trim() === label)!;

describe("Sidebar", () => {
  it("draws each node the person has as a link", () => {
    setup();
    expect(host!.querySelector('nav[aria-label="Main"]')).toBeTruthy();
    expect(links()).toContain(first.label);
  });

  it("opens a node's children from its toggle and tells the preference", () => {
    const onPref = setup();
    act(() => button(`${first.label}, open`).click());
    expect(onPref).toHaveBeenCalledWith("opened", first.id);
  });

  it("shows the children of an open node and marks the page's own child", () => {
    const kid = first.kids[0]!;
    setup({ ...NO_PREFS, opened: [first.id] }, kid.href);
    const current = host!.querySelector('a[aria-current="page"]');
    expect(current?.textContent?.trim()).toBe(kid.label);
  });

  it("lifts pinned nodes under Pinned", () => {
    setup({ ...NO_PREFS, pinned: [first.id] });
    const pinned = host!.querySelector('section[aria-label="Pinned"]');
    expect(pinned?.textContent).toContain(first.label);
  });

  it("keeps hidden nodes in More until it is opened", () => {
    setup({ ...NO_PREFS, hidden: [first.id] });
    expect(links()).not.toContain(first.label);
    act(() => button("More").click());
    expect(links()).toContain(first.label);
  });
});
