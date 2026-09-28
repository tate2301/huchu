import { QueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";

import { watchPersistedQueries } from "./client-runtime";
import { getOfflineSnapshot, resetOfflineSnapshot } from "./runtime-store";

/**
 * "Last online" is the last time the server answered — not what
 * `navigator.onLine` says, which stays true on a network whose server is
 * down. These pin which query events count as the server answering.
 */
describe("last online", () => {
  let stop: (() => void) | null = null;

  afterEach(() => {
    stop?.();
    stop = null;
    resetOfflineSnapshot();
  });

  function watch() {
    const client = new QueryClient();
    stop = watchPersistedQueries(client);
    return client;
  }

  it("moves when a fetch succeeds", async () => {
    const client = watch();
    expect(getOfflineSnapshot().lastOnlineAt).toBeNull();

    await client.fetchQuery({ queryKey: ["deals"], queryFn: async () => ["a deal"] });

    expect(getOfflineSnapshot().lastOnlineAt).not.toBeNull();
  });

  it("does not move for data written by hand", () => {
    const client = watch();
    client.setQueryData(["deals"], ["a deal"]);
    expect(getOfflineSnapshot().lastOnlineAt).toBeNull();
  });

  it("does not move for results restored from the device", () => {
    // What the persister hands back on the next visit: last session's cache.
    const lastSession = new QueryClient();
    lastSession.setQueryData(["deals"], ["a kept deal"]);
    const kept = dehydrate(lastSession);

    const client = watch();
    hydrate(client, kept);

    expect(client.getQueryData(["deals"])).toEqual(["a kept deal"]);
    expect(getOfflineSnapshot().lastOnlineAt).toBeNull();
  });

  it("does not move when a fetch fails", async () => {
    const client = watch();
    await client
      .fetchQuery({
        queryKey: ["deals"],
        queryFn: async () => {
          throw new Error("Failed to fetch");
        },
        retry: false,
      })
      .catch(() => undefined);
    expect(getOfflineSnapshot().lastOnlineAt).toBeNull();
  });
});
