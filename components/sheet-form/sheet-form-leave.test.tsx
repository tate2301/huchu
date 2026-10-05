// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TILL_SHEETS } from "@/lib/retail/sheet-kinds/tills";
import type { SheetCtx } from "@/lib/workspace/sheet-kind";

const router = { replace: vi.fn(), push: vi.fn(), back: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { SheetForm } from "./sheet-form";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Leaving a sheet that shows a pairing code (10-setup W-76, TillReplace
 * footer, 4.3 DELETE /pairing-code): Cancel expires the code, and nothing
 * the sheet still had in flight may issue a new one after it.
 */

const TILL = "11111111-1111-4111-8111-111111111111";
const base = `/api/v2/retail/tills/${TILL}`;

const till = {
  id: TILL,
  name: "Cold room till",
  code: "TILL-5",
  site: { id: "s", name: "Harare Main Branch", isDefault: true },
  device: "CounterMini",
  pairedKind: "COUNTER_MINI",
  lastSaleAt: null,
  lastSale: null,
  onItNow: null,
  state: "CLOSED",
  stateLabel: "Closed",
  deviceKind: "COUNTER_MINI",
  priceListId: null,
  sitePriceList: "Shelf prices",
  hasPrinter: true,
  hasDrawer: true,
  hasScale: false,
  current: { id: "d", kind: "COUNTER_MINI", label: "CounterMini", appVersion: null, lastSeenAt: null, lastSeen: "Now", seen: "11:38", pairedAt: "", pairedBy: "", paired: "" },
  openShift: null,
  priceLists: [],
  sub: "Harare Main Branch · CounterMini · closed",
  siteCount: 1,
};

type Call = { method: string; url: string };
let calls: Call[];
/** Answers for GET /pairing, in turn; a function holds the answer back. */
let pairing: Array<string | (() => Promise<string>)>;
let root: Root | null;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  pairing = [];
  router.replace.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ method, url });
      if (method === "GET" && url === base) return json({ data: till });
      if (method === "POST" && url === `${base}/pairing-code`) return json({ code: "730264", expiresAt: "" });
      if (method === "POST" && url === "/api/v2/retail/tills") return json({ data: { ...till, current: null }, code: "482917" }, 201);
      if (method === "DELETE") return new Response(null, { status: 204 });
      if (method === "GET" && url === `${base}/pairing`) {
        const next = pairing.shift() ?? "waiting";
        return json({ state: typeof next === "string" ? next : await next(), expiresAt: null });
      }
      return json({ error: "not here" }, 404);
    }),
  );
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function ctxFor(id: string | null, params = ""): SheetCtx {
  return { params: new URLSearchParams(params), id, user: { id: "u", name: "Tafara Nyathi", role: "MANAGER" }, can: () => true };
}

async function mount(kindKey: string, ctx: SheetCtx) {
  const onClose = vi.fn();
  const client = new QueryClient();
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const draw = (open: boolean) =>
    root!.render(
      <QueryClientProvider client={client}>
        <SheetForm kind={TILL_SHEETS[kindKey]!} ctx={ctx} open={open} onClose={onClose} />
      </QueryClientProvider>,
    );
  await act(async () => draw(true));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return { onClose, close: () => act(async () => draw(false)) };
}

const button = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((node) => node.textContent === text) as HTMLButtonElement | undefined;

async function wait(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const after = (call: Call) => calls.slice(calls.indexOf(call) + 1);
const codes = () => calls.filter((call) => call.method === "POST" && call.url === `${base}/pairing-code`);

describe("Leaving a sheet with a pairing code", () => {
  it("Cancel expires the code, polling stops and no new code is issued", async () => {
    const { onClose } = await mount("till-replace", ctxFor(TILL));
    expect(codes()).toHaveLength(1);
    await wait(2000);
    expect(calls.at(-1)).toEqual({ method: "GET", url: `${base}/pairing` });

    // The code Cancel expires reads "expired" from here on.
    pairing = ["expired", "expired", "expired"];
    await act(async () => button("Cancel")!.click());
    await wait(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    const cancel = calls.find((call) => call.method === "DELETE")!;
    expect(cancel).toEqual({ method: "DELETE", url: `${base}/pairing-code` });

    await wait(10_000);
    expect(after(cancel)).toEqual([]);
    expect(codes()).toHaveLength(1);
  });

  it("a poll in flight when Cancel is pressed cannot issue a code after it", async () => {
    let answer: (state: string) => void = () => undefined;
    pairing = [() => new Promise<string>((resolve) => (answer = resolve))];
    await mount("till-replace", ctxFor(TILL));
    await wait(2000);
    expect(calls.at(-1)).toEqual({ method: "GET", url: `${base}/pairing` });

    await act(async () => button("Cancel")!.click());
    await wait(0);
    // The undo waits for the poll, so nothing that poll does lands after it.
    expect(calls.some((call) => call.method === "DELETE")).toBe(false);

    // The server, having seen the DELETE first in the bad old order, says expired.
    await act(async () => answer("expired"));
    await wait(10_000);
    const cancel = calls.find((call) => call.method === "DELETE")!;
    expect(cancel).toEqual({ method: "DELETE", url: `${base}/pairing-code` });
    expect(after(cancel)).toEqual([]);
    expect(codes()).toHaveLength(1);
  });

  it("a code that runs out while the sheet is open is replaced", async () => {
    pairing = ["expired"];
    await mount("till-replace", ctxFor(TILL));
    await wait(2000);
    expect(codes()).toHaveLength(2);
  });

  it("leaving Pair a till some other way (Back, a link) still removes the till it made", async () => {
    const { close } = await mount("till-new", ctxFor(null));
    await close();
    await wait(10_000);
    expect(calls).toEqual([
      { method: "POST", url: "/api/v2/retail/tills" },
      { method: "DELETE", url: base },
    ]);
  });

  it("a reload or another address removes it too, as the page goes", async () => {
    await mount("till-new", ctxFor(null));
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(calls.filter((call) => call.method === "DELETE")).toEqual([{ method: "DELETE", url: base }]);
    const init = vi.mocked(fetch).mock.calls.find(([, options]) => options?.method === "DELETE")![1]!;
    expect(init.keepalive).toBe(true);
  });

  it("Pair another device asks before dropping unsaved edits", async () => {
    await mount("till", ctxFor(TILL));
    const name = document.getElementById("sf-name") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(name, "Cold room");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => button("Pair another device")!.click());
    expect(router.replace).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
});
