import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";

/**
 * When the scheduled jobs run (`app/api/cron/tick`): some once a day at a
 * shop-clock time (Africa/Harare), some every few minutes.
 *
 * Time is cut into slots: a daily job's slot is today's `HH:MM`, an interval
 * job's is the `everyMinutes` stretch of the clock `now` falls in. A job is due
 * when it has not run since its current slot began, so a tick that comes a few
 * seconds early or late still runs each job once a slot, and a slot missed
 * while nothing called the tick runs once when the next tick comes. Every job
 * is written to be safe to run twice.
 */

export type JobWhen = { dailyAt: string } | { everyMinutes: number };

export type ScheduledJob = {
  /** "licence-reminder": the job's row in `ScheduledJobRun`, and its name in the log. */
  name: string;
  when: JobWhen;
  /** Does the job for every workspace, and says what it did in one line. */
  run(now: Date): Promise<string>;
};

const HHMM = /^([01][0-9]|2[0-3]):([0-5][0-9])$/;

/** Minutes the zone is ahead of UTC at that instant (+120 in Harare). */
function offsetMinutes(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name ?? "");
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
}

/** The instant of today's `HH:MM` on the shop's clock, today being the shop's today at `now`. */
export function dailySlot(now: Date, at: string, timeZone = SHOP_TIME_ZONE): Date {
  const time = HHMM.exec(at);
  if (!time) throw new Error(`"${at}" is not a 24-hour HH:MM time`);
  const offset = offsetMinutes(now, timeZone);
  const wall = new Date(now.getTime() + offset * 60_000);
  const slot = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), Number(time[1]), Number(time[2]));
  return new Date(slot - offset * 60_000);
}

/** When the job's current slot began, or null before a daily job's time today. */
export function jobSlot(when: JobWhen, now: Date): Date | null {
  if ("everyMinutes" in when) {
    const span = when.everyMinutes * 60_000;
    return new Date(Math.floor(now.getTime() / span) * span);
  }
  const slot = dailySlot(now, when.dailyAt);
  return now >= slot ? slot : null;
}
