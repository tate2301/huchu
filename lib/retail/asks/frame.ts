import type { Ask } from "@/lib/workspace/ask";
import { DEFAULT_TIME_ZONE, formatDay } from "@/lib/workspace/format";

/** How long a record waits in the bin before it is gone for good. */
export const BIN_KEEP_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The day a record moved to the bin now can still be restored until. */
export function restorableUntil(movedAt: Date): Date {
  return new Date(movedAt.getTime() + BIN_KEEP_DAYS * DAY_MS);
}

/** Every record's ⋯ › Move to the bin (Record board, `ASKS.bin`). */
export function binAsk({
  title,
  movedAt = new Date(),
  timeZone = DEFAULT_TIME_ZONE,
}: {
  title: string;
  movedAt?: Date;
  timeZone?: string;
}): Ask {
  return {
    title: `Move ${title} to the bin?`,
    body: `It leaves every list and search today. Anything sold, paid or counted against it stays exactly as it is. You can restore it from the bin until ${formatDay(restorableUntil(movedAt), timeZone)}.`,
    keep: "Keep it",
    go: "Move to the bin",
    fill: "bad",
  };
}
