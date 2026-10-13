import { purgeExpiredBin } from "@/lib/retail/bin";
import { drainOutbox, drainWords } from "@/lib/retail/messages/drain";
import { failStalePrintJobs } from "@/lib/retail/labels/print";
import { POSTING_RUN_AT } from "@/lib/retail/posting-schedule";
import { runScheduledPosting } from "@/lib/retail/posting-settings";
import { applyDuePriceChangesForAll } from "@/lib/retail/prices/schedule";
import { applyRbzRate } from "@/lib/retail/rbz-rate";
import { closeWaitingFiscalDays } from "@/lib/retail/fiscal-settings";
import { expireVouchers } from "@/lib/retail/vouchers/expire";
import { birthdayBonusesForAll, expirePointsForAll } from "@/lib/retail/loyalty/jobs";
import { sendLaybyRemindersForAll } from "@/lib/retail/floor/layby-reminders";
import { runBuyingFollowUpsForAll } from "@/lib/retail/buying/follow-ups";

import type { ScheduledJob } from "@/lib/scheduled-jobs/schedule";

/**
 * The retail jobs the scheduler runs (`app/api/cron/tick`, 10-setup §4.1). Each
 * unit that owns one adds it here: 02:00 the bin's purge (ADM-07), 06:00 the
 * licence reminder (ADM-08, C-05), 07:00 the RBZ rate (SET-05, when
 * configured), 03:00 the shelf-label jobs no till picked up (PRD-06), 23:00
 * the posting runs (SET-09), every five minutes the
 * message outbox (SET-07, C-03) and the fiscal days left to close (SET-08),
 * every minute the price changes come due (PRD-07), 00:10 the vouchers whose
 * expiry day has passed lapse (PRD-10), 00:05 points a year old expire,
 * 07:00 on Mondays the birthday bonuses (CUS-01) and 09:00 the weekly lay-by
 * reminders (FLR-06), and 07:00 the order follow-ups (BUY-03).
 */
export const RETAIL_JOBS: ScheduledJob[] = [
  {
    // A WhatsApp each week to every customer still paying a lay-by who asked for reminders (FLR-06).
    name: "layby-reminders",
    when: { dailyAt: "09:00" },
    run: (now) => sendLaybyRemindersForAll(now),
  },
  {
    // Points earned more than 12 months ago and not spent expire, for shops whose points expire (CUS-01).
    name: "points-expiry",
    when: { dailyAt: "00:05" },
    run: (now) => expirePointsForAll(now),
  },
  {
    // The birthday bonus for the week's birthdays; nothing except on Mondays (CUS-01).
    name: "birthday-bonus",
    when: { dailyAt: "07:00" },
    run: (now) => birthdayBonusesForAll(now),
  },
  {
    // Chased orders whose promised day has passed: "Remind me" tells the chaser, "Cancel the rest" cancels it (BUY-03, W-34).
    name: "buying-follow-ups",
    when: { dailyAt: "07:00" },
    run: (now) => runBuyingFollowUpsForAll(now),
  },
  {
    // Vouchers past their expiry day with something left lapse, and what money was left is written off (PRD-10).
    name: "voucher-expiry",
    when: { dailyAt: "00:10" },
    run: async (now) => `${await expireVouchers(now)} expired`,
  },
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
  {
    // Scheduled price changes ("Tonight, after closing") once due; a till's next price read may apply them first (PRD-07).
    name: "price-changes",
    when: { everyMinutes: 1 },
    run: (now) => applyDuePriceChangesForAll(now),
  },
];
