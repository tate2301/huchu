import type { RetailJob } from "./schedule";

/**
 * The retail worker's jobs (`scripts/retail-worker.ts`, 10-setup §4.1). Each
 * unit that owns one adds it here: 06:00 the licence reminder (ADM-08, C-05),
 * 07:00 the RBZ rate (SET-05, when configured), 23:00 the posting runs
 * (SET-09), every five minutes the message outbox (SET-07, C-03).
 */
export const RETAIL_JOBS: RetailJob[] = [];
