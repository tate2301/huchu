// @vitest-environment jsdom

import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OfflineStatusButton } from "./offline-status-button";
import {
  resetOfflineSnapshot,
  updateOfflineSnapshot,
} from "@/lib/offline/runtime-store";

/**
 * The app bar's device-sync button, hydrated for real.
 *
 * The bug this pins: the server rendered "Device sync — ready", and the
 * button's first client render said "preparing", because by the time the
 * navbar's Suspense boundary hydrated, the device had already started keeping
 * pages. React logged "A tree hydrated but some attributes of the server
 * rendered HTML didn't match" on every signed-in page.
 *
 * Each case moves the store to a client-only state *before* hydrating — the
 * exact order that broke — and asserts React has nothing to say.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PREPARING = { pages: { warming: true, routes: [], keptCount: 0 } };
const OFFLINE_WITH_QUEUE = {
  online: false,
  queue: { pending: 2, blocking: 0, operations: [] },
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  resetOfflineSnapshot();
  vi.restoreAllMocks();
});

function label(container: HTMLElement) {
  return container.querySelector("button")?.getAttribute("aria-label");
}

async function hydrateAfter(clientState: Parameters<typeof updateOfflineSnapshot>[0]) {
  const serverHtml = renderToString(<OfflineStatusButton />);
  const container = document.createElement("div");
  container.innerHTML = serverHtml;
  document.body.appendChild(container);

  // The device learns something the server could not before this subtree
  // hydrates.
  updateOfflineSnapshot(clientState);

  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const recoverable = vi.fn();
  await act(async () => {
    root = hydrateRoot(container, <OfflineStatusButton />, {
      onRecoverableError: recoverable,
    });
  });

  return { container, serverHtml, consoleError, recoverable };
}

describe("OfflineStatusButton", () => {
  it("renders the same markup on the server whatever the device knows", () => {
    const server = renderToStaticMarkup(<OfflineStatusButton />);
    updateOfflineSnapshot(PREPARING);
    expect(renderToStaticMarkup(<OfflineStatusButton />)).toBe(server);
    expect(server).toContain('aria-label="Device sync — ready"');
  });

  it("hydrates without a mismatch when the device is already preparing", async () => {
    const { container, consoleError, recoverable } = await hydrateAfter(PREPARING);

    expect(consoleError).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    // …and the live state takes over in the render straight after.
    expect(label(container)).toBe("Device sync — preparing");
  });

  it("hydrates without a mismatch when the device is offline with work queued", async () => {
    const { container, consoleError, recoverable } = await hydrateAfter(OFFLINE_WITH_QUEUE);

    expect(consoleError).not.toHaveBeenCalled();
    expect(recoverable).not.toHaveBeenCalled();
    // Notable, so it takes the tint and the dot as well as the label.
    expect(label(container)).toBe("Device sync — 2 changes queued");
    expect(container.querySelector("button span[aria-hidden]")).not.toBeNull();
  });

  it("stays a quiet glyph with no dot when everything is in order", () => {
    const html = renderToStaticMarkup(<OfflineStatusButton />);
    // The dot is the only ringed, rounded span the button draws.
    expect(html).not.toContain("rounded-full ring-2");
    // …and no tint: the button's own opening tag carries no colour.
    expect(html).not.toMatch(/^<button[^>]*style=/);
  });
});
