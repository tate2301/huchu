import { purgeExpiredBin } from "@/lib/retail/bin";
import { drainOutbox, drainWords } from "@/lib/retail/messages/drain";
import { failStalePrintJobs } from "@/lib/retail/labels/print";
import { POSTING_RUN_AT } from "@/lib/retail/posting-schedule";
import { runScheduledPosting } from "@/lib/retail/posting-settings";
import { applyRbzRate } from "@/lib/retail/rbz-rate";
import { closeWaitingFiscalDays } from "@/lib/retail/fiscal-settings";

import type { RetailJob } from "./schedule";

/**
 * The retail worker's jobs (`scripts/retail-worker.ts`, 10-setup §4.1). Each
 * unit that owns one adds it here: 02:00 the bin's purge (ADM-07), 06:00 the
 * licence reminder (ADM-08, C-05), 07:00 the RBZ rate (SET-05, when
 * configured), 03:00 the shelf-label jobs no till picked up (PRD-06), 23:00
 * the posting runs (SET-09), every five minutes the
 * message outbox (SET-07, C-03) and the fiscal days left to close (SET-08).
 */
export const RETAIL_JOBS: RetailJob[] = [
  {
    // Everything in every shop's bin more than 30 days goes for good (80-admin 4.5).
    name: "bin-purge",
    when: { dailyAt: "02:00" },
    run: async (now) => {
      const { deleted, kept } = await purgeExpiredBin(now);
      return `${deleted} deleted, ${kept} kept for their history`;
    },
  },
  {
    // The RBZ's rate for every shop that updates its ZiG rate daily (SET-05); nothing without a feed.
    name: "rbz-rate",
    when: { dailyAt: "07:00" },
    run: (now) => applyRbzRate(now),
  },
  {
    // The day's sales, deliveries and counts to the books, for every shop that posts at the end of each day (SET-09).
    name: "posting-run",
    when: { dailyAt: POSTING_RUN_AT },
    run: () => runScheduledPosting(),
  },
  {
    // Receipts and every other queued message, to WhatsApp and email (SET-07, C-03); nothing while a channel is not set up.
    name: "message-outbox",
    when: { everyMinutes: 5 },
    run: async (now) => drainWords(await drainOutbox(now)),
  },
  {
    // A fiscal day whose last shift closed while ZIMRA was silent: its report goes once ZIMRA answers (SET-08).
    name: "fiscal-days",
    when: { everyMinutes: 5 },
    run: () => closeWaitingFiscalDays(),
  },
  {
    // Shelf-label jobs a till never picked up, an unpaired till's among them, fail after a day (PRD-06).
    name: "print-jobs",
    when: { dailyAt: "03:00" },
    run: async (now) => `${await failStalePrintJobs(now)} failed`,
  },
];
