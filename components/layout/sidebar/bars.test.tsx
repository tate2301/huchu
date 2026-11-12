// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { composeNav } from "@/lib/nav/compose";
import { activeNav } from "@/lib/nav/match";
import { NO_PREFS } from "@/lib/nav/prefs";

import { PhoneBar, PHONE_DESTINATIONS } from "./phone-bar";
import { Rail } from "./rail";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const groups = composeNav({ canOpen: () => true });
const nodes = groups.flatMap((group) => group.items);

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

describe("PhoneBar", () => {
  it("holds four destinations and More", () => {
    const onMore = vi.fn();
    mount(<PhoneBar groups={groups} active={null} prefs={NO_PREFS} onMore={onMore} />);
    expect(host!.querySelectorAll("a")).toHaveLength(PHONE_DESTINATIONS);
    const more = [...host!.querySelectorAll("button")].find((b) => b.textContent === "More")!;
    act(() => more.click());
    expect(onMore).toHaveBeenCalled();
  });

  it("puts a pinned page first", () => {
    const pick = nodes[8]!;
    mount(<PhoneBar groups={groups} active={null} prefs={{ ...NO_PREFS, pinned: [pick.id] }} onMore={() => {}} />);
    expect(host!.querySelector("a")?.textContent).toBe(pick.label);
  });
});

describe("Rail", () => {
  it("has a mark for each top-level page, a hairline per group, and opens the sidebar", () => {
    const onOpen = vi.fn();
    mount(
      <Rail
        groups={groups}
        active={activeNav(groups, "/", null)}
        prefs={NO_PREFS}
        badges={{}}
        switcher={<i />}
        management={{ href: "/preferences/organization", current: false }}
        onOpen={onOpen}
      />,
    );
    const marks = [...host!.querySelectorAll("a[aria-label]")].filter((a) => a.getAttribute("aria-label") !== "Management");
    expect(marks).toHaveLength(nodes.length);
    expect(host!.querySelector('a[aria-label="Management"]')).toBeTruthy();
    act(() => host!.querySelector<HTMLButtonElement>('button[aria-label="Open the sidebar, ["]')!.click());
    expect(onOpen).toHaveBeenCalled();
  });
});
