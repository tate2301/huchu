/**
 * Migration witness for 20261001090000_notification_email.
 *
 * Notifications are emailed as well as shown, behind a per-person switch that
 * starts on, and a record's members are told about new activity on it with
 * their own notice type. This pins what the migration adds.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(
  process.cwd(),
  "prisma/migrations/20261001090000_notification_email/migration.sql",
);

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = ${name}
  `;
  return rows.map((row) => row.label);
}

describe("the notification email migration", () => {
  it("adds an email switch that is on unless somebody turns it off", async () => {
    const [column] = await prisma.$queryRaw<
      Array<{ is_nullable: string; column_default: string | null; udt_name: string }>
    >`
      SELECT is_nullable, column_default, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'UserNotificationPreference' AND column_name = 'emailEnabled'
    `;
    expect(column).toMatchObject({ is_nullable: "NO", column_default: "true", udt_name: "bool" });
  });

  it("adds the record-activity notice and the record it points at", async () => {
    expect(await enumLabels("NotificationType")).toContain("CRM_RECORD_ACTIVITY");
    expect(await enumLabels("NotificationEntityType")).toContain("CRM_RECORD");
  });

  it("is additive: it drops and rewrites nothing", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).not.toMatch(/\bDROP\b|\bUPDATE\b|\bDELETE\b/i);
  });
});
