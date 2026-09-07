import { writePlatformAuditEvent, type PlatformAuditArgs } from "@corelithzw/platform/audit/platform"

export type GoldAuditArgs = PlatformAuditArgs

/**
 * Gold's entry point into the hash-chained platform audit log.
 *
 * The mechanism now lives in `lib/audit/platform.ts`, because nothing about it
 * was ever gold-specific and schools needs the same chain. This keeps the name
 * Gold's call sites use, and keeps its one behavioural choice: a failed audit
 * write is logged rather than thrown, because a gold import should not be
 * rolled back by the log that describes it.
 */
export async function writeGoldAuditEvent(args: GoldAuditArgs): Promise<void> {
  try {
    await writePlatformAuditEvent(args)
  } catch (error) {
    console.error("[audit] writeGoldAuditEvent failed", error)
  }
}
