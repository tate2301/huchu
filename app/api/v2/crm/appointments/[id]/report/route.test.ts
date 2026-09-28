/**
 * A visit report's photos, as rows, through the real handler and a real
 * database.
 *
 * The report sheet sends its whole photo list on every save — "Save draft"
 * twice, then "Complete visit" — so the behaviour worth pinning is what a
 * repeated save does:
 *
 *   - it stores each photo once, keyed on the id minted on the phone;
 *   - it keeps where and when the camera said a photo was taken, whatever a
 *     later save claims — a caption is the rep's to change, a location is not;
 *   - a photo dropped from the list is deleted, and a photo that belongs to a
 *     question's answer is not the report's to delete.
 *
 * Only the session and the ownership check are mocked.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});
vi.mock("@/lib/crm/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crm/permissions")>();
  return { ...actual, canEditRecord: vi.fn().mockResolvedValue(true) };
});

const { GET, PUT } = await import("./route");

const SLUG = "visit-report-photos-test";
const EMAIL = "visit-report-photos-test@example.invalid";

let companyId: string;
let userId: string;
let appointmentId: string;

const LOCATED = {
  clientPhotoId: "0b8e1f4a-2c3d-4e5f-8a9b-0c1d2e3f4a01",
  url: "https://store.example.invalid/companies/co/crm-attachments/2026/09/front.jpg",
  pathname: "companies/co/crm-attachments/2026/09/front.jpg",
  fileName: "IMG_0001.jpg",
  contentType: "image/jpeg",
  size: 204800,
  caption: "Front of the warehouse",
  latitude: -17.825,
  longitude: 31.0375,
  capturedAt: "2026-09-20T08:15:30.000Z",
};

const UNLOCATED = {
  clientPhotoId: "0b8e1f4a-2c3d-4e5f-8a9b-0c1d2e3f4a02",
  url: "https://store.example.invalid/companies/co/crm-attachments/2026/09/crack.jpg",
  pathname: "companies/co/crm-attachments/2026/09/crack.jpg",
  fileName: "screenshot.jpg",
  contentType: "image/jpeg",
  size: 102400,
  caption: null,
  latitude: null,
  longitude: null,
  capturedAt: null,
};

function put(body: unknown) {
  return new NextRequest(`http://crm.test/api/v2/crm/appointments/${appointmentId}/report`, {
    method: "PUT",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function save(photos: unknown[]) {
  const response = await PUT(put({ photos }), { params: Promise.resolve({ id: appointmentId }) });
  expect(response.status).toBe(200);
}

async function read() {
  const response = await GET(
    new NextRequest(`http://crm.test/api/v2/crm/appointments/${appointmentId}/report`),
    { params: Promise.resolve({ id: appointmentId }) },
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { photos: Array<typeof LOCATED | typeof UNLOCATED> };
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Visit Report Photos Test", slug: SLUG },
  });
  companyId = company.id;

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Rudo Rep", companyId, role: "CLERK" },
  });
  userId = user.id;

  await prisma.crmAppointment.deleteMany({ where: { companyId } });
  const appointment = await prisma.crmAppointment.create({
    data: {
      companyId,
      appointmentNo: "APT-PHOTO-1",
      assignedToId: userId,
      scheduledStart: new Date("2026-09-20T08:00:00.000Z"),
    },
  });
  appointmentId = appointment.id;
});

beforeEach(async () => {
  validateSessionMock.mockResolvedValue({
    session: { user: { id: userId, companyId, role: "CLERK" } },
  });
  await prisma.crmSiteVisitPhoto.deleteMany({ where: { companyId } });
  await prisma.crmSiteVisitSection.deleteMany({ where: { companyId } });
});

afterAll(async () => {
  await prisma.crmSiteVisitPhoto.deleteMany({ where: { companyId } });
  await prisma.crmSiteVisitSection.deleteMany({ where: { companyId } });
  await prisma.crmAppointment.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("saving a report's photos", () => {
  it("stores each photo as a row with where and when it was taken", async () => {
    await save([LOCATED, UNLOCATED]);

    const rows = await prisma.crmSiteVisitPhoto.findMany({
      where: { appointmentId },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      clientPhotoId: LOCATED.clientPhotoId,
      blobPathname: LOCATED.pathname,
      latitude: -17.825,
      longitude: 31.0375,
      uploadedById: userId,
    });
    expect(rows[0].capturedAt?.toISOString()).toBe(LOCATED.capturedAt);
    // Accepted without a location, and stored as having none.
    expect(rows[1]).toMatchObject({ latitude: null, longitude: null, capturedAt: null });

    const report = await read();
    expect(report.photos).toEqual([LOCATED, UNLOCATED]);
  });

  it("stores a photo once however often the report is saved", async () => {
    await save([LOCATED, UNLOCATED]);
    const first = await prisma.crmSiteVisitPhoto.findFirstOrThrow({
      where: { clientPhotoId: LOCATED.clientPhotoId },
    });

    await save([LOCATED, UNLOCATED]);
    await save([LOCATED, UNLOCATED]);

    expect(await prisma.crmSiteVisitPhoto.count({ where: { appointmentId } })).toBe(2);
    const again = await prisma.crmSiteVisitPhoto.findFirstOrThrow({
      where: { clientPhotoId: LOCATED.clientPhotoId },
    });
    // The same row, so the list keeps its order.
    expect(again.id).toBe(first.id);
    expect(again.createdAt.getTime()).toBe(first.createdAt.getTime());
  });

  it("lets the caption change and keeps what the camera said", async () => {
    await save([LOCATED]);
    await save([
      {
        ...LOCATED,
        caption: "Loading bay, north side",
        // A later save cannot move the photo.
        latitude: -20.15,
        longitude: 28.58,
        capturedAt: "2026-09-25T12:00:00.000Z",
      },
    ]);

    const row = await prisma.crmSiteVisitPhoto.findFirstOrThrow({
      where: { clientPhotoId: LOCATED.clientPhotoId },
    });
    expect(row.caption).toBe("Loading bay, north side");
    expect(row.latitude).toBe(-17.825);
    expect(row.longitude).toBe(31.0375);
    expect(row.capturedAt?.toISOString()).toBe(LOCATED.capturedAt);
  });

  it("deletes a photo the rep removed from the list", async () => {
    await save([LOCATED, UNLOCATED]);
    await save([LOCATED]);

    const rows = await prisma.crmSiteVisitPhoto.findMany({ where: { appointmentId } });
    expect(rows.map((row) => row.clientPhotoId)).toEqual([LOCATED.clientPhotoId]);
  });

  it("leaves a question's photos alone", async () => {
    const section = await prisma.crmSiteVisitSection.create({
      data: { companyId, appointmentId, name: "Epoxy floor", kind: "PRODUCT" },
    });
    await prisma.crmSiteVisitPhoto.create({
      data: {
        companyId,
        appointmentId,
        sectionId: section.id,
        clientPhotoId: "0b8e1f4a-2c3d-4e5f-8a9b-0c1d2e3f4a99",
        blobPathname: "companies/co/crm-attachments/2026/09/joint.jpg",
        url: "https://store.example.invalid/companies/co/crm-attachments/2026/09/joint.jpg",
        contentType: "image/jpeg",
        size: 1,
      },
    });

    await save([LOCATED]);

    expect(await prisma.crmSiteVisitPhoto.count({ where: { sectionId: section.id } })).toBe(1);
    // And the report only lists its own.
    const report = await read();
    expect(report.photos.map((photo) => photo.clientPhotoId)).toEqual([LOCATED.clientPhotoId]);
  });
});
