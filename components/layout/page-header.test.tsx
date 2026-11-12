// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageChromeProvider } from "./page-chrome";
import { PageHeader } from "./page-header";
import { KitPage } from "@/components/management/ui/kit-page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ pathname: "/help", inManagement: false }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/layout/shell-nav", () => ({
  useShellNav: () => ({ inManagement: state.inManagement, pageLabel: "Help", pageIcon: "help" }),
}));
vi.mock("@/components/layout/shell-state", () => ({
  useShell: () => ({ drawerOpen: false, setDrawerOpen: vi.fn() }),
}));
vi.mock("@/components/layout/use-record-step", () => ({ useRecordStep: () => null }));
vi.mock("@/components/layout/app-bar-tools", () => ({
  VaneBarButton: () => null, NotificationsBell: () => null, SearchTrigger: () => null,
}));
vi.mock("@/components/alerts/emergency-alert-host", () => ({ EmergencyHeaderTrigger: () => null }));
vi.mock("@/components/crm/crm-members", () => ({ CrmMembers: () => null }));
vi.mock("@/components/layout/sidebar/parts", () => ({
  ChromeIcon: () => null,
  NavIcon: ({ name }: { name: string }) => <i data-nav-icon={name} />,
}));
vi.mock("@/lib/icons/corelith-nav.generated", () => ({ NAV_ICONS: { help: "help" } }));
vi.mock("@/lib/navigation", () => ({ EXPLORE_NAV_ITEMS: [], navSections: [] }));
vi.mock("@/components/vane/vane-nav", () => ({ VANE_PAGES: [] }));

let root: Root | null = null;
let host: HTMLDivElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  state.pathname = "/help";
  state.inManagement = false;
});
function mount(page?: React.ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<PageChromeProvider><PageHeader />{page}</PageChromeProvider>));
}

describe("the shared page header after the Management merge", () => {
  it("renders an ordinary route without referencing a removed management row", () => {
    mount();
    expect(host.querySelector("h1")?.textContent).toBe("Help");
    expect(host.querySelector('[data-nav-icon="help"]')).not.toBeNull();
  });

  it.each([false, true])("keeps one title bar and working management actions (flush=%s)", (flush) => {
    state.pathname = "/management/money-accounts";
    state.inManagement = true;
    const onNew = vi.fn();
    mount(
      <KitPage title="Money accounts" mark={<i data-page-mark="bank" />} flush={flush}
        actions={<button onClick={onNew}>New money account</button>}>
        <p>Accounts</p>
      </KitPage>,
    );
    expect(host.querySelectorAll("header")).toHaveLength(1);
    const header = host.querySelector("header")!;
    // Desktop and phone versions share the same identity; CSS selects one.
    expect([...header.querySelectorAll("h1")].map((title) => title.textContent)).toEqual(["Money accounts", "Money accounts"]);
    expect(header.querySelector('[data-page-mark="bank"]')).not.toBeNull();
    expect(host.querySelector(".mn h1")).toBeNull();
    const action = [...header.querySelectorAll("button")].find((button) => button.textContent === "New money account")!;
    act(() => action.click());
    expect(onNew).toHaveBeenCalledOnce();
    expect(host.querySelector(".mn")?.textContent).toBe("Accounts");
  });
});
