import { describe, expect, it } from "vitest";

import { beginActivityRequest, currentActivityRequest } from "./context";

/**
 * The mechanism the activity log rests on: `validateSession` opens the record
 * in its synchronous head, and the route handler — which awaited it — must
 * find that record in every continuation after the await, including inside
 * Prisma calls. These tests stand in for that shape without Next or Prisma.
 */

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

/** `validateSession`'s shape: begin synchronously, then await the session. */
async function guard(method: string, url: string) {
  const record = beginActivityRequest({ method, url });
  await tick();
  return record;
}

/** A route handler: guard, then do work across several awaits. */
async function handler(method: string, url: string) {
  const opened = await guard(method, url);
  await tick();
  const seenAfterWork = await (async () => {
    await tick();
    return currentActivityRequest();
  })();
  return { opened, seenAfterWork };
}

/** Each request starts from the server's own event, not from the caller's context. */
function request(method: string, url: string) {
  return new Promise<Awaited<ReturnType<typeof handler>>>((resolve, reject) => {
    setImmediate(() => {
      handler(method, url).then(resolve, reject);
    });
  });
}

describe("activity request context", () => {
  it("reaches the handler's continuations after the guard is awaited", async () => {
    const { opened, seenAfterWork } = await request("POST", "http://x.test/api/sites");
    expect(opened).not.toBeNull();
    expect(seenAfterWork).toBe(opened);
  });

  it("keeps concurrent requests apart", async () => {
    const [a, b] = await Promise.all([
      request("POST", "http://x.test/api/sites"),
      request("PATCH", "http://x.test/api/departments/1"),
    ]);
    expect(a.seenAfterWork?.path).toBe("/api/sites");
    expect(b.seenAfterWork?.path).toBe("/api/departments/1");
    expect(a.seenAfterWork).not.toBe(b.seenAfterWork);
  });

  it("opens nothing for a read", async () => {
    const { opened, seenAfterWork } = await request("GET", "http://x.test/api/sites");
    expect(opened).toBeNull();
    expect(seenAfterWork).toBeUndefined();
  });

  it("reuses the open record when a handler validates twice", async () => {
    const result = await new Promise<{ first: unknown; second: unknown }>((resolve) => {
      setImmediate(async () => {
        const first = await guard("POST", "http://x.test/api/sites");
        const second = await guard("POST", "http://x.test/api/sites");
        resolve({ first, second });
      });
    });
    expect(result.second).toBe(result.first);
  });
});
