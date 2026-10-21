import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { accessToken, addGrant, validateSession, findMembership, canSeeRecord } = vi.hoisted(() => {
  const addGrant = vi.fn();
  const toJwt = vi.fn(async () => "signed.jwt");
  return {
    addGrant,
    accessToken: vi.fn(function AccessToken() {
      return { addGrant, toJwt };
    }),
    validateSession: vi.fn(),
    findMembership: vi.fn(),
    canSeeRecord: vi.fn(),
  };
});

vi.mock("livekit-server-sdk", () => ({ AccessToken: accessToken }));
vi.mock("@/lib/api-utils", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/api-utils")>()), validateSession }));
vi.mock("@/lib/prisma", () => ({ prisma: { workspaceMembership: { findFirst: findMembership } } }));
vi.mock("@/lib/teams/record-team", () => ({ canSeeRecord }));

import { POST } from "./route";

const record = { subjectType: "DEAL", subjectId: "d-14" };
const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/teams/livekit/token", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TEAMS_CALLS", "on");
  vi.stubEnv("LIVEKIT_URL", "wss://calls.example.test");
  vi.stubEnv("LIVEKIT_API_KEY", "key");
  vi.stubEnv("LIVEKIT_API_SECRET", "secret");
  validateSession.mockResolvedValue({ session: { user: { id: "u1", companyId: "c1" } } });
  findMembership.mockResolvedValue({ id: "m1", user: { name: "Sean" } });
  canSeeRecord.mockResolvedValue(true);
});

describe("POST /api/teams/livekit/token", () => {
  it("is not there while the flag is off, and never touches the SDK", async () => {
    vi.stubEnv("TEAMS_CALLS", "");
    expect((await call(record)).status).toBe(404);
    vi.stubEnv("NODE_ENV", "production");
    expect((await call(record)).status).toBe(404);
    expect(accessToken).not.toHaveBeenCalled();
  });

  it("mints a token for the record's room with the membership id as identity", async () => {
    const response = await call(record);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ token: "signed.jwt", url: "wss://calls.example.test", room: "record:c1:DEAL:d-14", identity: "m1" });
    expect(accessToken).toHaveBeenCalledWith("key", "secret", { identity: "m1", name: "Sean", ttl: "10m" });
    expect(addGrant).toHaveBeenCalledWith({ roomJoin: true, room: "record:c1:DEAL:d-14", canPublish: true, canSubscribe: true, canPublishData: true });
  });

  it("gives each record, and each workspace, its own room", async () => {
    await call(record);
    await call({ subjectType: "RETAIL_PRODUCT", subjectId: "p-9" });
    validateSession.mockResolvedValue({ session: { user: { id: "u1", companyId: "c2" } } });
    await call(record);
    expect(addGrant.mock.calls.map(([grant]) => grant.room)).toEqual(["record:c1:DEAL:d-14", "record:c1:RETAIL_PRODUCT:p-9", "record:c2:DEAL:d-14"]);
  });

  it("refuses someone who is not signed in, not a member, or cannot open the record", async () => {
    validateSession.mockResolvedValueOnce(NextResponse.json({ error: "Unauthorised" }, { status: 401 }));
    expect((await call(record)).status).toBe(401);
    findMembership.mockResolvedValueOnce(null);
    expect((await call(record)).status).toBe(403);
    canSeeRecord.mockResolvedValueOnce(false);
    expect((await call(record)).status).toBe(403);
    expect(accessToken).not.toHaveBeenCalled();
  });

  it("asks for a record, and says so when calls are not set up", async () => {
    expect((await call({ subjectType: "NOPE", subjectId: "x" })).status).toBe(400);
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    expect((await call(record)).status).toBe(503);
    expect(accessToken).not.toHaveBeenCalled();
  });
});
