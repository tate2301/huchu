import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** The global client or a transaction: what every function here is handed. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Run `work` in a transaction: a new one on the global client, or the caller's
 * own when it is already inside one, so a workflow can be one commit.
 */
export function inTransaction<T>(db: Db | undefined, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const client = db ?? prisma;
  return "$transaction" in client ? client.$transaction(work) : work(client);
}
