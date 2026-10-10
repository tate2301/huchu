/**
 * A custom report reads its sources through the same gate as a report's own
 * page: a source switched off in the workspace, or one that does not exist,
 * comes back missing — never as rows — and the list of sources to build on
 * leaves it out too.
 *
 * The session is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { getCatalogFeatureKeys } from "@/lib/platform/gating/catalog-utils";
import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { POST } = await import("./route");
const { GET } = await import("../route");

const SLUG = "report-sources-rows-test";

let companyId: string;

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: SLUG } });
  companyId = (await prisma.company.create({ data: { name: SLUG, slug: SLUG } })).id;
  validateSessionMock.mockResolvedValue({
    session: { user: { id: `${SLUG}-manager`, companyId, role: "MANAGER", enabledFeatures: getCatalogFeatureKeys() } },
  });
  await prisma.reportSetting.create({ data: { companyId, reportKey: "crm-leads", enabled: false } });
  await prisma.crmPipeline.create({ data: { companyId, name: "Sales", isDefault: true } });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/v2/reports/sources/rows", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("POST /api/v2/reports/sources/rows", () => {
  it("returns the rows of the sources it can read, and names the rest as missing", async () => {
    const response = await post({ keys: ["crm-deals", "crm-leads", "no-such-report"], params: { from: "2026-01-01", to: "" } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Object.keys(body.sources)).toEqual(["crm-deals"]);
    expect(body.sources["crm-deals"]).toMatchObject({ rows: [], truncated: false, params: { from: "2026-01-01", to: "" } });
    expect(body.missing.sort()).toEqual(["crm-leads", "no-such-report"]);
  });

  it("refuses a request without sources", async () => {
    expect((await post({ keys: [] })).status).toBe(400);
  });
});

describe("GET /api/v2/reports/sources", () => {
  it("lists what can be built on, without what the workspace switched off", async () => {
    const response = await GET(new NextRequest("http://localhost/api/v2/reports/sources"));
    const keys = (await response.json()).sources.map((source: { key: string }) => source.key);
    expect(keys).toContain("crm-deals");
    expect(keys).not.toContain("crm-leads");
  });
});
