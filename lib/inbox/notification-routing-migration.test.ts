/**
 * Migration witness for `20261016110000_notification_routing` (approved 15 Oct).
 *
 * A kind on a channel is on or off once per workspace and once per person; a
 * notification remembers who did it and outlives them; Books, leave, reports
 * and Vane have types; when notifications go is one row per workspace; and
 * Vane's reader reaches all of it within its workspace.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const enumValues = async (name: string) =>
  (await prisma.$queryRawUnsafe<Array<{ value: string }>>(`SELECT unnest(enum_range(NULL::"${name}"))::text AS value`)).map((row) => row.value);

describe("notification routing, as stored", () => {
  it("gives Books, leave, reports and Vane their own types", async () => {
    expect(await enumValues("NotificationType")).toEqual(
      expect.arrayContaining(["BOOKS_INVOICE_PAID", "BOOKS_PAYMENT_RECEIVED", "HR_LEAVE_SUBMITTED", "HR_LEAVE_APPROVED", "HR_LEAVE_REJECTED", "REPORT_SENT", "VANE_ISSUE_RAISED"]),
    );
    expect(await enumValues("NotificationEntityType")).toEqual(expect.arrayContaining(["INVOICE", "PAYMENT", "LEAVE_REQUEST", "REPORT", "VANE_ITEM"]));
    expect(await enumValues("NotificationChannel")).toEqual(["IN_APP", "EMAIL", "WHATSAPP", "PHONE"]);
  });

  it("keeps who did it, and the notification when they leave", async () => {
    const rows = await prisma.$queryRaw<Array<{ is_nullable: string; on_delete: string }>>`
      SELECT c.is_nullable, rc.delete_rule AS on_delete
      FROM information_schema.columns c
      JOIN information_schema.key_column_usage kcu ON kcu.table_name = c.table_name AND kcu.column_name = c.column_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = kcu.constraint_name
      WHERE c.table_name = 'Notification' AND c.column_name = 'actorId'`;
    expect(rows).toEqual([{ is_nullable: "YES", on_delete: "SET NULL" }]);
  });

  it("holds one workspace rule and one personal choice per kind and channel", async () => {
    const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'NotificationSetting' AND indexname = 'NotificationSetting_companyId_userId_kind_channel_key'`;
    expect(index?.indexdef).toContain("UNIQUE INDEX");
    expect(index?.indexdef).toContain("NULLS NOT DISTINCT");
  });

  it("starts a workspace on quiet hours from 20:00 to 06:00, repeats grouped, no morning message", async () => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string; column_default: string | null }>>`
      SELECT column_name, column_default FROM information_schema.columns
      WHERE table_name = 'NotificationPolicy' AND column_name IN ('quietFrom', 'quietTo', 'morningMessage', 'groupRepeats')
      ORDER BY column_name`;
    expect(Object.fromEntries(rows.map((row) => [row.column_name, row.column_default]))).toEqual({
      groupRepeats: "true",
      morningMessage: "false",
      quietFrom: "'20:00'::character varying",
      quietTo: "'06:00'::character varying",
    });
  });

  it("lets Vane's reader read the settings, the policy and who did it, in its workspace", async () => {
    const grants = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT table_name || '.' || column_name AS name FROM information_schema.column_privileges
      WHERE grantee = 'vane_reader' AND privilege_type = 'SELECT'
        AND (table_name IN ('NotificationSetting', 'NotificationPolicy') OR (table_name = 'Notification' AND column_name = 'actorId'))
      ORDER BY 1`;
    expect(grants.map((row) => row.name)).toEqual([
      "Notification.actorId",
      "NotificationPolicy.companyId",
      "NotificationPolicy.groupRepeats",
      "NotificationPolicy.morningMessage",
      "NotificationPolicy.quietFrom",
      "NotificationPolicy.quietTo",
      "NotificationPolicy.updatedAt",
      "NotificationPolicy.updatedById",
      "NotificationSetting.channel",
      "NotificationSetting.companyId",
      "NotificationSetting.createdAt",
      "NotificationSetting.enabled",
      "NotificationSetting.id",
      "NotificationSetting.kind",
      "NotificationSetting.updatedAt",
      "NotificationSetting.updatedById",
      "NotificationSetting.userId",
    ]);
    const policies = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_policies WHERE policyname = 'vane_workspace' AND tablename IN ('NotificationSetting', 'NotificationPolicy') ORDER BY 1`;
    expect(policies.map((row) => row.tablename)).toEqual(["NotificationPolicy", "NotificationSetting"]);
  });
});
