import type { ScheduledJob } from "@/lib/scheduled-jobs/schedule";

import { DRAIN_EVERY_MINUTES, drainAll, drainWords } from "./drain";

/**
 * Books' scheduled jobs, run on the tick (`app/api/cron/tick`): the drain
 * that posts every waiting money event, for every source type (books-final §1.1).
 */
export const BOOKS_JOBS: ScheduledJob[] = [
  {
    name: "books-drain",
    when: { everyMinutes: DRAIN_EVERY_MINUTES },
    run: async (now) => drainWords(await drainAll(now)),
  },
];
