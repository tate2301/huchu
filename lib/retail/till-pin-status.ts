import { prisma } from "@/lib/prisma";

/** The caller's own till PIN, as the till needs to know it: never the digits. */
export type TillPinStatus = {
  hasPin: boolean;
  /** Sent from People and not yet replaced: they choose their own before the till opens. */
  mustChange: boolean;
  /** Five wrong in a row: locked until a manager sends a new one. */
  locked: boolean;
  lastUnlockedAt: string | null;
};

/**
 * Read by `GET pos/pin` and by the till's layout, so the till's first render on
 * the server and in the browser already knows whether there is a PIN to lock with.
 */
export async function readTillPinStatus(userId: string, companyId: string): Promise<TillPinStatus> {
  const record = await prisma.retailTillPin.findFirst({
    where: { userId, companyId },
    // `pinHash` is not in this list on purpose, and must never be.
    select: { lockedAt: true, mustChange: true, lastUnlockedAt: true },
  });
  return {
    hasPin: Boolean(record),
    mustChange: record?.mustChange ?? false,
    locked: Boolean(record?.lockedAt),
    lastUnlockedAt: record?.lastUnlockedAt?.toISOString() ?? null,
  };
}
