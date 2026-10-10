import { SHOP_TIME_ZONE } from "@/lib/retail/shop-profile-rules";

/**
 * When the retail worker's jobs run (10-setup §4.1): some once a day at a
 * shop-clock time (Africa/Harare), some every few minutes. The worker keeps
 * each job's last run in memory, so a job whose time passed while the worker
 * was down runs once when it comes back — every job is written to be safe to
 * run twice.
 */

export type RetailJobWhen = { dailyAt: string } | { everyMinutes: number };

export type RetailJob = {
  /** "licence-reminder", for the log. */
  name: string;
  when: RetailJobWhen;
  /** Does the job for every shop, and says what it did in one line. */
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

/** Whether a job is due at `now`, given when it last ran (null: not since the worker started). */
export function isJobDue(when: RetailJobWhen, lastRun: Date | null, now: Date): boolean {
  if ("everyMinutes" in when) {
    return lastRun === null || now.getTime() - lastRun.getTime() >= when.everyMinutes * 60_000;
  }
  const slot = dailySlot(now, when.dailyAt);
  return now >= slot && (lastRun === null || lastRun < slot);
}

/** The jobs to run now, in their listed order. */
export function dueJobs(jobs: readonly RetailJob[], lastRuns: ReadonlyMap<string, Date>, now: Date): RetailJob[] {
  return jobs.filter((job) => isJobDue(job.when, lastRuns.get(job.name) ?? null, now));
}
