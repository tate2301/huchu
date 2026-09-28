/**
 * A finished export, fetched through the real handler and a real database: it
 * is streamed to the person it was made for under its own file name, never
 * redirected to the stored file, and refused once it has expired.
 *
 * The session and the stored file's host are mocked.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET } = await import("./route");

const SLUG = "render-artifact-access-test";

let companyId: string;
let tendai: string;
let rudo: string;
let liveId: string;
let expiredId: string;

async function download(artifactId: string, as: string, role = "SALES_REP") {
  validateSessionMock.mockResolvedValue({ session: { user: { id: as, role, companyId } } });
  return GET(new NextRequest(`http://docs.test/api/documents/artifacts/${artifactId}`), {
    params: Promise.resolve({ id: artifactId }),
  });
}

async function job(fileName: string, expiresAt: Date) {
  const created = await prisma.documentRenderJob.create({
    data: {
      companyId,
      documentType: "REPORT_TABLE",
      targetType: "LIST",
      sourceKey: "reports.shift",
      renderMode: "ASYNC",
      status: "SUCCEEDED",
      payloadJson: "{}",
      requestedById: tendai,
      artifact: {
        create: {
          companyId,
          mimeType: "text/csv; charset=utf-8",
          fileName,
          blobUrl: `https://blob.example.invalid/${fileName}`,
          byteSize: 10,
          expiresAt,
        },
      },
    },
    include: { artifact: true },
  });
  return created.artifact!.id;
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: SLUG, slug: SLUG },
  });
  companyId = company.id;
  const users = await Promise.all(
    ["tendai", "rudo"].map((name) =>
      prisma.user.upsert({
        where: { email: `${SLUG}-${name}@example.invalid` },
        update: {},
        create: { email: `${SLUG}-${name}@example.invalid`, name, companyId, role: "SALES_REP" },
      }),
    ),
  );
  [tendai, rudo] = users.map((user) => user.id);
  await prisma.documentRenderJob.deleteMany({ where: { companyId } });
  liveId = await job("Sites — Harare.csv", new Date(Date.now() + 60 * 60 * 1000));
  expiredId = await job("old.csv", new Date(Date.now() - 1000));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prisma.documentRenderJob.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("an export's file", () => {
  it("is streamed to its requester under its own name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("Name\r\nTendai\r\n", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await download(liveId, tendai);
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-disposition")).toContain(
      `filename*=UTF-8''${encodeURIComponent("Sites — Harare.csv")}`,
    );
    expect(await response.text()).toBe("Name\r\nTendai\r\n");
    expect(fetchMock).toHaveBeenCalledWith("https://blob.example.invalid/Sites — Harare.csv", {
      cache: "no-store",
    });
  });

  it("is not found for a colleague", async () => {
    const response = await download(liveId, rudo);
    expect(response.status).toBe(404);
  });

  it("is gone once it has expired", async () => {
    const response = await download(expiredId, tendai);
    expect(response.status).toBe(410);
  });
});
