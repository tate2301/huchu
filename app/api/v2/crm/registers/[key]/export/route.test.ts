/**
 * Exporting a CRM list through the real handler, the real documents pipeline
 * and a real database: the file holds the rows the list's own filters select,
 * under labelled headings; ticked ids stay inside the company; an export
 * needs `records.export`; and every export is written to the audit trail.
 *
 * The session and the tenant's feature switch are mocked.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});
vi.mock("@/lib/platform/features", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/platform/features")>();
  return { ...actual, hasFeature: vi.fn().mockResolvedValue(true) };
});

const { POST } = await import("./route");

const SLUG = "crm-register-export-test";
const OTHER = "crm-register-export-test-other";

let companyId: string;
let tendai: string;
let mine: string;
let stranger: string;

/**
 * The body as text, with the byte-order mark shown. `Response.text()` decodes
 * UTF-8 the way a browser does, which silently drops the mark — and whether
 * the mark is there is what decides if Excel reads the file as UTF-8.
 */
async function csvText(response: Response) {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await response.arrayBuffer());
}

async function exportList(key: string, body: Record<string, unknown>, as = tendai) {
  validateSessionMock.mockResolvedValue({ session: { user: { id: as, companyId, role: "SALES_REP" } } });
  return POST(
    new NextRequest(`http://crm.test/api/v2/crm/registers/${key}/export`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ key }) },
  );
}

beforeAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
  const [company, other] = await Promise.all(
    [SLUG, OTHER].map((slug) => prisma.company.create({ data: { name: slug, slug } })),
  );
  companyId = company.id;
  const user = await prisma.user.upsert({
    where: { email: `${SLUG}-tendai@example.invalid` },
    update: { companyId, role: "SALES_REP" },
    create: { email: `${SLUG}-tendai@example.invalid`, name: "Tendai", companyId, role: "SALES_REP" },
  });
  tendai = user.id;
  mine = (
    await prisma.crmPerson.create({
      data: {
        companyId,
        personNo: "P-1",
        firstName: "Anesu",
        fullName: "Anesu Dube",
        email: "anesu@example.invalid",
        phone: "+263 77 123 4567",
        assignedToId: tendai,
      },
    })
  ).id;
  await prisma.crmPerson.create({
    data: { companyId, personNo: "P-2", firstName: "Blessing", fullName: "=Blessing Moyo" },
  });
  stranger = (
    await prisma.crmPerson.create({
      data: { companyId: other.id, personNo: "P-1", firstName: "Stranger", fullName: "Other Company Person" },
    })
  ).id;
});

beforeEach(async () => {
  await prisma.userPermissionOverride.deleteMany({ where: { userId: tendai } });
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.userPermissionOverride.deleteMany({ where: { userId: tendai } });
  await prisma.crmPerson.deleteMany({ where: { company: { slug: { in: [SLUG, OTHER] } } } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: { in: [SLUG, OTHER] } } });
});

describe("exporting a CRM list", () => {
  it("writes the rows the list's filters select, under labelled headings", async () => {
    const response = await exportList("person", {
      format: "csv",
      filters: { owner: "me", tz: "Africa/Harare" },
      columns: ["name", "email", "phone"],
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("People");
    const text = await csvText(response);
    expect(text).toBe("\uFEFFName,Email,Phone\r\nAnesu Dube,anesu@example.invalid,+263 77 123 4567\r\n");
  });

  it("keeps ticked ids inside the reader's company", async () => {
    const response = await exportList("person", {
      format: "csv",
      filters: {},
      ids: [mine, stranger],
      columns: ["name"],
    });
    expect(await csvText(response)).toBe("\uFEFFName\r\nAnesu Dube\r\n");
  });

  it("defuses a name that would run as a formula", async () => {
    const response = await exportList("person", { format: "csv", filters: { q: "blessing" }, columns: ["name"] });
    expect(await csvText(response)).toBe("\uFEFFName\r\n'=Blessing Moyo\r\n");
  });

  it("makes a spreadsheet named for the view it came from", async () => {
    const response = await exportList("person", { format: "xlsx", filters: {}, title: "My contacts" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const sheet = workbook.worksheets[0];
    expect(sheet.name).toBe("My contacts");
    expect(sheet.getRow(1).getCell(1).value).toBe("Name");
    expect(sheet.rowCount).toBe(3);
  });

  it("is refused without the export permission", async () => {
    await prisma.userPermissionOverride.create({
      data: { companyId, userId: tendai, permissionKey: "records.export", isAllowed: false },
    });
    const response = await exportList("person", { format: "csv", filters: {} });
    expect(response.status).toBe(403);
  });

  it("does not know a list it does not have", async () => {
    const response = await exportList("salaries", { format: "csv", filters: {} });
    expect(response.status).toBe(404);
  });

  it("writes every export to the audit trail", async () => {
    await exportList("person", { format: "csv", filters: { owner: "me" }, columns: ["name"] });
    const event = await prisma.platformAuditEvent.findFirst({
      where: { companyId, eventType: "crm.records.exported" },
      orderBy: { createdAt: "desc" },
    });
    expect(event).toMatchObject({ actor: tendai, entityType: "CRM_LIST", entityId: "PERSON" });
    expect(JSON.parse(event?.payloadJson ?? "null")).toMatchObject({
      format: "csv",
      rows: 1,
      selected: 0,
      filters: { owner: "me" },
    });
  });
});
