// @vitest-environment jsdom
import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RecordPeekHost, RecordPeekProvider, useRecordPeek } from "./record-peek";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const shell = vi.hoisted(() => ({ width: "wide" as "wide" | "mid" | "phone" }));
vi.mock("@/components/layout/shell-state", () => ({ useShell: () => ({ width: shell.width }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/records/record-trail", () => ({ useRecordTrail: () => ({ current: null, follow: () => {} }) }));
vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    fetchJson: vi.fn(async (path: string) => {
      const parts = path.split("/").filter(Boolean);
      const id = parts[parts.length - 2];
      return { title: `Deal ${id}`, href: `/crm/deals/${id}`, properties: [], status: null, reference: null, subtitle: null };
    }),
  };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

function Opener() {
  const { open } = useRecordPeek();
  return (
    <>
      {["/crm/deals/abc", "/crm/deals/b"].map((href) => (
        <button key={href} type="button" data-open={href} onClick={() => open(href)} />
      ))}
    </>
  );
}
const peek = (href: string) => act(async () => host!.querySelector<HTMLButtonElement>(`button[data-open="${href}"]`)!.click());

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  shell.width = "wide";
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

async function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root!.render(
      <QueryClientProvider client={client}>
        <RecordPeekProvider>
          <Opener />
          <RecordPeekHost />
        </RecordPeekProvider>
      </QueryClientProvider>,
    );
  });
}

const settle = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 20))));
const press = (key: string) => act(() => void window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));

describe("RecordPeekHost", () => {
  it("draws nothing until a record is peeked", async () => {
    await mount();
    expect(host!.querySelector("aside")).toBeNull();
  });

  it("docks a peek beside the page, and ] hides and shows it", async () => {
    await mount();
    await peek("/crm/deals/abc");
    expect(host!.querySelector('aside[aria-label="Details"]')).toBeTruthy();
    press("]");
    expect(host!.querySelector("aside")).toBeNull();
    expect(window.localStorage.getItem("details:hidden")).toBe("true");
    press("]");
    expect(host!.querySelector("aside")).toBeTruthy();
  });

  it("steps down the list the record was opened from", async () => {
    window.sessionStorage.setItem(
      "seq:last",
      JSON.stringify({ from: "/crm/deals", hrefs: ["/crm/deals/a", "/crm/deals/b", "/crm/deals/c"] }),
    );
    await mount();
    await peek("/crm/deals/b");
    await settle();
    const next = host!.querySelector<HTMLButtonElement>('button[aria-label="Next, J"]')!;
    expect(next.disabled).toBe(false);
    await act(async () => next.click());
    await settle();
    expect(host!.textContent).toContain("Deal c");
    expect(host!.querySelector<HTMLButtonElement>('button[aria-label="Next, J"]')!.disabled).toBe(true);
  });

  it("a peek brings back a hidden panel", async () => {
    window.localStorage.setItem("details:hidden", "true");
    await mount();
    await peek("/crm/deals/abc");
    expect(host!.querySelector("aside")).toBeTruthy();
  });
});
