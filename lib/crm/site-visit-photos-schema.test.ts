/**
 * Migration witness for 20260925130000_crm_site_visit_photo_rows.
 *
 * The report route and the geotag helper would pass their own tests against a
 * schema file that disagreed with the database. This reads the catalogue and
 * pins what the migration exists to do:
 *
 *  - The photos are rows. `CrmAppointment.photos` — the JSON array that could
 *    not say where a picture was taken — is gone, so nothing can quietly go on
 *    writing to it.
 *  - Each row can say where and when, and may say neither: a photo with no
 *    location is accepted and marked, never refused, so all three columns are
 *    NULLABLE.
 *  - A photo is stored once however often the report is saved: the key minted
 *    on the phone is unique per tenant.
 *  - The tenant's camera recommendation is two optional columns on Company,
 *    null meaning "the default".
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

async function columns(table: string): Promise<Map<string, { is_nullable: string; data_type: string }>> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string; is_nullable: string; data_type: string }>>`
    SELECT column_name, is_nullable, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function indexes(table: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}
  `;
  return rows.map((row) => row.indexdef);
}

describe("site-visit photos are rows", () => {
  it("drops the JSON array from the appointment", async () => {
    const cols = await columns("CrmAppointment");
    expect(cols.has("photos")).toBe(false);
    // The checklist stays a JSON column — only the photos moved.
    expect(cols.get("checklist")?.data_type).toBe("jsonb");
  });

  it("lets a photo carry a location and a capture time, and not require either", async () => {
    const cols = await columns("CrmSiteVisitPhoto");
    expect(cols.get("latitude")?.is_nullable).toBe("YES");
    expect(cols.get("longitude")?.is_nullable).toBe("YES");
    expect(cols.get("capturedAt")?.is_nullable).toBe("YES");
  });

  it("keeps the file's name, optionally", async () => {
    const cols = await columns("CrmSiteVisitPhoto");
    expect(cols.get("fileName")?.is_nullable).toBe("YES");
  });

  it("stores a photo once per tenant however often the report is saved", async () => {
    const defs = await indexes("CrmSiteVisitPhoto");
    expect(
      defs.some(
        (def) => def.startsWith("CREATE UNIQUE INDEX") && def.includes('("companyId", "clientPhotoId")'),
      ),
    ).toBe(true);
  });
});

describe("the tenant's recommended camera app", () => {
  it("is two optional columns on Company, null meaning the default", async () => {
    const cols = await columns("Company");
    expect(cols.get("fieldCameraAppName")?.is_nullable).toBe("YES");
    expect(cols.get("fieldCameraAppUrl")?.is_nullable).toBe("YES");
  });
});
