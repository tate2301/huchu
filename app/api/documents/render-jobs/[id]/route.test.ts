/**
 * A render job's progress, read through the real handler and a real database:
 * the person who asked for the export sees it, a colleague does not, and
 * nobody is shown what went into it or where the file is stored.
 *
 * The session is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});
vi.mock("@/lib/documents/service", () => ({ processDocumentRenderJobsBatch: vi.fn() }));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

const { GET } = await import("./route");

const SLUG = "render-job-access-test";

let companyId: string;
let otherCompanyId: string;
let tendai: string;
let rudo: string;
let jobId: string;

async function read(as: { id: string; role: string; companyId?: string }) {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: as.id, role: as.role, companyId: as.companyId ?? companyId } },
  });
  const response = await GET(new NextRequest(`http://docs.test/api/documents/render-jobs/${jobId}`), {
    params: Promise.resolve({ id: jobId }),
  });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  const [company, other] = await Promise.all(
    [SLUG, `${SLUG}-other`].map((slug) =>
      prisma.company.upsert({ where: { slug }, update: {}, create: { name: slug, slug } }),
    ),
  );
  companyId = company.id;
  otherCompanyId = other.id;
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
  const job = await prisma.documentRenderJob.create({
    data: {
      companyId,
      documentType: "REPORT_TABLE",
      targetType: "LIST",
      sourceKey: "reports.shift",
      renderMode: "ASYNC",
      status: "SUCCEEDED",
      payloadJson: JSON.stringify({ input: { filters: { q: "secret" } } }),
      requestedById: tendai,
      artifact: {
        create: {
          companyId,
          mimeType: "text/csv",
          fileName: "shift.csv",
          blobUrl: "https://blob.example.invalid/shift.csv",
          byteSize: 10,
        },
      },
    },
  });
  jobId = job.id;
});

afterAll(async () => {
  await prisma.documentRenderJob.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, `${SLUG}-other`] } } });
});

describe("a render job", () => {
  it("is read by the person who asked for it, without its inputs or its file's address", async () => {
    const { status, body } = await read({ id: tendai, role: "SALES_REP" });
    expect(status).toBe(200);
    expect(body).toMatchObject({ id: jobId, status: "SUCCEEDED", artifact: { fileName: "shift.csv" } });
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(JSON.stringify(body)).not.toContain("blob.example.invalid");
    expect(body.payloadJson).toBeUndefined();
  });

  it("is not found for a colleague", async () => {
    const { status } = await read({ id: rudo, role: "SALES_REP" });
    expect(status).toBe(404);
  });

  it("is read by a manager", async () => {
    const { status } = await read({ id: rudo, role: "MANAGER" });
    expect(status).toBe(200);
  });

  it("is not found from another company", async () => {
    const { status } = await read({ id: tendai, role: "SUPERADMIN", companyId: otherCompanyId });
    expect(status).toBe(404);
  });
});
