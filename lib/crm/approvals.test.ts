import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";

import { getOrCreateApproval, rotateApproval } from "@/lib/crm/approvals";

type Row = {
  token: string;
  status: "PENDING" | "APPROVED" | "DECLINED" | "EXPIRED" | "REVOKED";
  expiresAt: Date | null;
};

/**
 * A stand-in for the one table these two functions touch. The rules worth
 * pinning down are about which token comes back, not about Prisma, and a fake
 * keeps them assertable without a database.
 */
function fakeTx(initial: Row | null) {
  let row = initial;
  const tx = {
    crmDocumentApproval: {
      findUnique: async () => row,
      upsert: async ({ update, create }: { update: Partial<Row>; create: Partial<Row> }) => {
        row = row
          ? { ...row, ...(update as Partial<Row>) }
          : ({
              status: "PENDING",
              expiresAt: null,
              ...(create as Partial<Row>),
            } as Row);
        return row;
      },
    },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, current: () => row };
}

const params = { companyId: "co", leadDocumentId: "doc" };

describe("getOrCreateApproval", () => {
  it("mints a link for a document that has never been shared", async () => {
    const { tx, current } = fakeTx(null);
    const link = await getOrCreateApproval(tx, params);

    expect(link.issued).toBe(true);
    expect(link.token).toHaveLength(43);
    expect(current()?.token).toBe(link.token);
  });

  /*
    The bug this exists for. Both of the UI's share actions — copy the link and
    email the client — call this, and it used to rotate the token every time. A
    rep who re-read the link on Tuesday to forward it revoked Monday's copy, and
    the customer clicking the link they were sent got "Document not found".
  */
  it("hands back the live link rather than replacing it", async () => {
    const { tx } = fakeTx({ token: "already-sent", status: "PENDING", expiresAt: null });
    const link = await getOrCreateApproval(tx, params);

    expect(link).toEqual({ token: "already-sent", issued: false });
  });

  it("does not disturb a link the customer has already answered", async () => {
    const { tx, current } = fakeTx({ token: "already-sent", status: "APPROVED", expiresAt: null });
    const link = await getOrCreateApproval(tx, params);

    expect(link.token).toBe("already-sent");
    // Rewriting the row here is how an approval's recorded answer was lost.
    expect(current()?.status).toBe("APPROVED");
  });

  it("issues a fresh link when the last one was withdrawn", async () => {
    const { tx } = fakeTx({ token: "withdrawn", status: "REVOKED", expiresAt: null });
    const link = await getOrCreateApproval(tx, params);

    expect(link.issued).toBe(true);
    expect(link.token).not.toBe("withdrawn");
  });

  it("issues a fresh link when the last one has expired", async () => {
    const { tx } = fakeTx({
      token: "stale",
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000),
    });
    const link = await getOrCreateApproval(tx, params);

    expect(link.issued).toBe(true);
    expect(link.token).not.toBe("stale");
  });
});

describe("rotateApproval", () => {
  it("replaces a working link, which is what withdrawing one means", async () => {
    const { tx, current } = fakeTx({ token: "leaked", status: "APPROVED", expiresAt: null });
    const token = await rotateApproval(tx, params);

    expect(token).not.toBe("leaked");
    expect(current()?.token).toBe(token);
    expect(current()?.status).toBe("PENDING");
  });

  it("dates a link when asked for one that expires", async () => {
    const { tx, current } = fakeTx(null);
    await rotateApproval(tx, { ...params, expiresInDays: 7 });

    const expiresAt = current()?.expiresAt;
    expect(expiresAt).toBeInstanceOf(Date);
    const days = (expiresAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });
});
