import type { ScheduledJob } from "@/lib/scheduled-jobs/schedule";

import { sendDueReportSchedules } from "./schedule-sender";

/**
 * Reports' scheduled jobs, run on the scheduled-jobs tick (`app/api/cron/tick`):
 * every five minutes, the reports people chose to be sent (Send it), in every
 * workspace. Each slot is claimed before it goes, so a second tick sends nothing twice.
 */
export const REPORT_JOBS: ScheduledJob[] = [
  {
    name: "report-schedules",
    when: { everyMinutes: 5 },
    run: (now) => sendDueReportSchedules(now),
  },
];
