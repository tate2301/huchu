import { prisma } from "@/lib/prisma";

/**
 * When FDMS last answered the device, and when it last could not be reached
 * (SET-08). Every call to FDMS notes its outcome here: an answer of any kind
 * is contact, a call that never got one (no connection, a timeout) is not.
 * "If ZIMRA cannot be reached · Stop selling" reads `lastFailedAt`, and the
 * Fiscal device page says the device is unreachable while the last failure is
 * newer than the last answer.
 */
export async function recordFdmsContact(providerId: string, reached: boolean, at: Date = new Date()): Promise<void> {
  await prisma.fiscalisationProviderConfig.update({
    where: { id: providerId },
    data: reached ? { lastOkAt: at } : { lastFailedAt: at },
  });
}

/** Whether the device's last call to FDMS failed and is newer than its last answer. */
export function isFdmsUnreachable(device: { lastOkAt: Date | null; lastFailedAt: Date | null }): boolean {
  if (!device.lastFailedAt) return false;
  return !device.lastOkAt || device.lastFailedAt.getTime() > device.lastOkAt.getTime();
}
