/**
 * Migration witness for `20261014150000_vane_gaps`.
 *
 * Who paused Vane is kept until someone resumes it, and outlives that person
 * leaving. A card has a topic, and a person's stopped topics go with them
 * and with the workspace, one row per topic. A job keeps the question behind
 * a problem. A quote line keeps the product it was picked from, and loses it
 * (not the line) when the product goes. Vane's reader reads each new column,
 * and the stops inside its workspace only.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const nullable = async (table: string, column: string) =>
  (
    await prisma.$queryRaw<Array<{ is_nullable: string }>>`
      SELECT is_nullable FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${column}`
  )[0]?.is_nullable ?? null;

const onDelete = async (table: string, column: string) =>
  (
    await prisma.$queryRaw<Array<{ rule: string }>>`
      SELECT rc.delete_rule AS rule FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = ${table} AND kcu.column_name = ${column}`
  )[0]?.rule ?? null;

const readerReads = async (table: string, column: string) =>
  (
    await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM information_schema.column_privileges
      WHERE grantee = 'vane_reader' AND privilege_type = 'SELECT' AND table_name = ${table} AND column_name = ${column}`
  )[0]!.n > BigInt(0);

describe("what the built Vane pages lacked, as stored", () => {
  it("keeps who paused Vane, and outlives them", async () => {
    expect(await nullable("VaneSettings", "pausedById")).toBe("YES");
    expect(await onDelete("VaneSettings", "pausedById")).toBe("SET NULL");
  });

  it("gives a card a topic, and keeps each person's stopped topics once each", async () => {
    expect(await nullable("VaneItem", "topic")).toBe("YES");
    expect(await nullable("VaneTopicStop", "topic")).toBe("NO");
    expect(await onDelete("VaneTopicStop", "userId")).toBe("CASCADE");
    expect(await onDelete("VaneTopicStop", "companyId")).toBe("CASCADE");
    const unique = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'VaneTopicStop' AND indexname = 'VaneTopicStop_companyId_userId_topic_key'`;
    expect(unique[0]?.indexdef).toContain("UNIQUE");
  });

  it("keeps the question behind a problem, and the product behind a quote line", async () => {
    expect(await nullable("VaneJob", "problemSql")).toBe("YES");
    expect(await nullable("SalesQuotationLine", "productId")).toBe("YES");
    expect(await onDelete("SalesQuotationLine", "productId")).toBe("SET NULL");
  });

  it("lets Vane's reader read each new column, and the stops inside its workspace only", async () => {
    for (const [table, column] of [
      ["VaneSettings", "pausedById"],
      ["VaneItem", "topic"],
      ["VaneJob", "problemSql"],
      ["SalesQuotationLine", "productId"],
      ["VaneTopicStop", "topic"],
    ] as const) {
      expect(await readerReads(table, column)).toBe(true);
    }
    const policies = await prisma.$queryRaw<Array<{ policyname: string }>>`
      SELECT policyname FROM pg_policies WHERE tablename = 'VaneTopicStop' ORDER BY policyname`;
    expect(policies.map((row) => row.policyname)).toEqual(["app_all", "vane_workspace"]);
  });
});
