/**
 * Migration witness for `20261004134000_audit_entity_index`: a record's
 * Activity tab reads its history by entity, newest first, off an index.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

describe("PlatformAuditEvent, read by entity", () => {
  it("has the (companyId, entityType, entityId, createdAt) index", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'PlatformAuditEvent'
        AND indexname = 'PlatformAuditEvent_companyId_entityType_entityId_createdAt_idx'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.indexdef).toContain('ON public."PlatformAuditEvent"');
    expect(rows[0]!.indexdef).toContain('("companyId", "entityType", "entityId", "createdAt")');
  });
});
