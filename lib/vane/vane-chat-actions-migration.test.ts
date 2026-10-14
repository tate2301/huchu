/**
 * Migration witness for `20261014090000_vane_chat_actions`.
 *
 * A person's chat with Vane is theirs: it goes with them and with the
 * workspace, and neither reader role can read it. An action Vane proposes
 * waits as PROPOSED until a person decides, goes with its card or its chat
 * answer, keeps who decided when that person leaves, and Vane's reader reads
 * it inside its workspace only.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { column_name: string; is_nullable: string; column_default: string | null };

const columns = async (table: string) => {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, is_nullable, column_default FROM information_schema.columns
    WHERE table_name = ${table} ORDER BY column_name`;
  return Object.fromEntries(rows.map((row) => [row.column_name, row]));
};

const foreignKeys = async (table: string) =>
  prisma.$queryRaw<Array<{ column: string; on_delete: string }>>`
    SELECT kcu.column_name AS column, rc.delete_rule AS on_delete
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
    WHERE kcu.table_name = ${table}
    ORDER BY kcu.column_name`;

const readerColumns = async (table: string, role: string) => {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.column_privileges
    WHERE grantee = ${role} AND privilege_type = 'SELECT' AND table_name = ${table}
    ORDER BY column_name`;
  return rows.map((row) => row.column_name);
};

describe("Vane's chat and its actions, as stored", () => {
  it("keeps each turn of a person's chat, with the job that answered it", async () => {
    const facts = await columns("VaneMessage");
    // `readFrom` came with 20261014160000_vane_message_read.
    expect(Object.keys(facts).sort()).toEqual(["author", "companyId", "createdAt", "id", "jobId", "readFrom", "text", "userId"]);
    expect(facts.jobId.is_nullable).toBe("YES");
    expect(await foreignKeys("VaneMessage")).toEqual([
      { column: "companyId", on_delete: "CASCADE" },
      { column: "jobId", on_delete: "SET NULL" },
      { column: "userId", on_delete: "CASCADE" },
    ]);
  });

  it("keeps a chat out of both reader roles", async () => {
    expect(await readerColumns("VaneMessage", "vane_reader")).toEqual([]);
    expect(await readerColumns("VaneMessage", "vane_reader_private")).toEqual([]);
  });

  it("keeps an action waiting for a person until they decide", async () => {
    const facts = await columns("VaneAction");
    expect(Object.keys(facts).sort()).toEqual(
      ["companyId", "createdAt", "decidedAt", "decidedById", "doneAt", "id", "itemId", "kind", "messageId", "params", "result", "status", "title"].sort(),
    );
    expect(facts.status.column_default).toBe(`'PROPOSED'::"VaneActionStatus"`);
    expect(await foreignKeys("VaneAction")).toEqual([
      { column: "companyId", on_delete: "CASCADE" },
      { column: "decidedById", on_delete: "SET NULL" },
      { column: "itemId", on_delete: "CASCADE" },
      { column: "messageId", on_delete: "CASCADE" },
    ]);
  });

  it("lets Vane's reader read every action column, inside its workspace", async () => {
    expect(await readerColumns("VaneAction", "vane_reader")).toEqual(
      ["companyId", "createdAt", "decidedAt", "decidedById", "doneAt", "id", "itemId", "kind", "messageId", "params", "result", "status", "title"].sort(),
    );
    const policies = await prisma.$queryRaw<Array<{ policyname: string; permissive: string }>>`
      SELECT policyname, permissive FROM pg_policies WHERE tablename = 'VaneAction' ORDER BY policyname`;
    expect(policies).toEqual([
      { policyname: "app_all", permissive: "PERMISSIVE" },
      { policyname: "vane_workspace", permissive: "RESTRICTIVE" },
    ]);
  });
});
