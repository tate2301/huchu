import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { rememberListQuery, useListHref } from "./list-href";

/**
 * A record's back link returns to its list as it was last looked at. The
 * address is kept per tab; the server, which cannot see it, draws the bare
 * list so the first render agrees with it.
 */
const store = new Map<string, string>();

beforeEach(() => {
  vi.stubGlobal("window", {
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
});

describe("remembering a list's address", () => {
  it("keeps the latest, and forgets it once the list is back at its front door", () => {
    rememberListQuery("DEAL", "owner=me&layout=table");
    rememberListQuery("DEAL", "owner=me&layout=table&by=stage");
    expect([...store.values()]).toEqual(["owner=me&layout=table&by=stage"]);
    rememberListQuery("DEAL", "");
    expect(store.size).toBe(0);
  });

  it("gives up quietly when storage is refused", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
        removeItem: () => {
          throw new Error("SecurityError");
        },
      },
    });
    expect(() => rememberListQuery("DEAL", "owner=me")).not.toThrow();
    expect(() => rememberListQuery("DEAL", "")).not.toThrow();
  });
});

describe("a record's back link", () => {
  function Back() {
    return <a href={useListHref("DEAL")}>Deals</a>;
  }

  it("is the bare list on the server, whatever the tab remembers", () => {
    rememberListQuery("DEAL", "owner=me&layout=table");
    expect(renderToStaticMarkup(<Back />)).toBe('<a href="/crm/deals">Deals</a>');
  });
});
