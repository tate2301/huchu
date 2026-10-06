// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CountLine, CountView } from "@/lib/retail/stock/counts";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { role: "STOCK_CLERK" } } }) }));

import { CountPhone } from "./count-phone";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COUNT: CountView = {
  id: "count-1",
  countNo: "CNT-0023",
  name: "Spirits shelf",
  status: "COUNTING",
  scope: "CATEGORIES",
  scopeLabel: "Spirits",
  site: { id: "site-1", name: "Harare Main Branch" },
  multiSite: false,
  place: null,
  blind: true,
  keepSelling: true,
  counter: { id: "user-1", name: "Tendai Sibanda", role: "STOCK_CLERK" },
  createdBy: { name: "Tafara Nyathi" },
  startedAt: "2026-10-06T10:00:00.000Z",
  firstCountedAt: null,
  submittedAt: null,
  approvedAt: null,
  approvedBy: null,
  lines: 2,
  counted: 0,
  differ: 0,
  recount: 0,
  approves: "A manager",
  history: [],
  yours: true,
  approver: "Tafara Nyathi or the owner",
};

const line = (id: string, product: string): CountLine => ({
  id,
  productId: null,
  product,
  sub: "Shelf 2, top",
  barcode: null,
  counted: null,
  countedAt: null,
  why: null,
  recount: false,
});
const LINES = [line("line-1", "Gordon's Gin 750ml"), line("line-2", "Nederburg Baronne 750ml")];

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

let host: HTMLDivElement | null = null;
let puts: Array<{ url: string; body: string }> = [];

beforeEach(() => {
  puts = [];
  // jsdom draws nothing, so it has no scrolling.
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") {
        puts.push({ url, body: String(init.body) });
        const id = url.split("/").pop()!;
        const counted = (JSON.parse(String(init.body)) as { counted: string }).counted;
        return json({ line: { ...LINES.find((row) => row.id === id)!, counted }, progress: { counted: 1, total: 2 } });
      }
      if (url.endsWith("/lines")) return json({ lines: LINES, progress: { counted: 0, total: 2 } });
      return json({ data: COUNT });
    }),
  );
});

afterEach(() => {
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
});

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("CountPhone", () => {
  it("saves a figure once when Enter moves the focus on and the blur follows", async () => {
    host = document.createElement("div");
    document.body.append(host);
    const client = new QueryClient();
    const root = createRoot(host);
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <CountPhone countId="count-1" />
        </QueryClientProvider>,
      ),
    );
    await settle();

    const gin = host.querySelector<HTMLInputElement>('input[aria-label="Counted, Gordon\'s Gin 750ml"]')!;
    const wine = host.querySelector<HTMLInputElement>('input[aria-label="Counted, Nederburg Baronne 750ml"]')!;
    expect(gin).not.toBeNull();
    act(() => gin.focus());
    type(gin, "20");
    act(() => {
      gin.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    // A blur while the save is on its way sends nothing more.
    act(() => gin.blur());
    act(() => gin.focus());
    await settle();

    // Enter moved the focus to the next line; that blur sent nothing either.
    expect(document.activeElement).toBe(wine);
    act(() => wine.blur());
    await settle();

    expect(puts).toEqual([{ url: "/api/v2/retail/stock/counts/count-1/lines/line-1", body: '{"counted":"20"}' }]);
    expect(host.textContent).toContain("1 of 2");

    // A new figure on the same line is a new save.
    act(() => gin.focus());
    type(gin, "21");
    act(() => gin.blur());
    await settle();
    expect(puts.map((put) => put.body)).toEqual(['{"counted":"20"}', '{"counted":"21"}']);

    act(() => root.unmount());
  });
});
