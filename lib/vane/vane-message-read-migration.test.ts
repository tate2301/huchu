/**
 * Migration witness for `20261014160000_vane_message_read`: each chat turn
 * keeps what Vane read to answer it, an empty list when it read nothing, and
 * a person's conversation stays out of both reader roles.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("what Vane read for a chat answer, as stored", () => {
  it("keeps a list on every turn, empty by default", async () => {
    const [column] = await prisma.$queryRaw<Array<{ is_nullable: string; column_default: string | null; data_type: string }>>`
      SELECT is_nullable, column_default, data_type FROM information_schema.columns WHERE table_name = 'VaneMessage' AND column_name = 'readFrom'`;
    expect(column).toMatchObject({ is_nullable: "NO", data_type: "jsonb" });
    expect(column!.column_default).toContain("'[]'");
  });

  it("keeps the conversation out of both reader roles", async () => {
    const granted = await prisma.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*) AS n FROM information_schema.column_privileges
      WHERE table_name = 'VaneMessage' AND grantee IN ('vane_reader', 'vane_reader_private')`;
    expect(granted[0]!.n).toBe(BigInt(0));
  });
});
