import type { Prisma } from "@prisma/client";

import type { RetailAuditActor } from "@/lib/retail/audit";
import type { SettingsLastChanged } from "@/lib/retail/settings-pages";

/**
 * Where a settings page's values live (the server's half of a page in
 * `lib/retail/settings-pages`): read them all as the page shows them, write
 * the changed ones inside the save's transaction.
 */
export type SettingsStore = {
  load(companyId: string): Promise<Record<string, unknown>>;
  /** `changes` are checked against the page's schema and differ from what is stored. */
  save(tx: Prisma.TransactionClient, actor: RetailAuditActor, changes: Record<string, unknown>): Promise<void>;
  /** Other rows whose events belong in this page's Activity. */
  related?(companyId: string): Array<{ entityType: string; ids: string[] }>;
  /**
   * Fields whose change the store records itself (a new ZiG rate is its own
   * row and event), left out of `RETAIL_SETTINGS.CHANGED`.
   */
  auditsOwn?: string[];
  /**
   * Who last changed the page when the store keeps changes of its own (the
   * rate's history): given the page's last save, the latest of the two.
   */
  lastChanged?(companyId: string, saved: SettingsLastChanged | null): Promise<SettingsLastChanged | null>;
};

/**
 * A save the page's rules refuse after reading the database: 409 with a code
 * (`PRICES_LOCKED`), or 400 under one field (a site that is not the tenant's).
 * Thrown from a store's `save`; nothing in the transaction is kept.
 */
export class SettingsRefused extends Error {
  constructor(
    message: string,
    readonly refusal: { status: 409; code: string } | { status: 400; field: string },
  ) {
    super(message);
    this.name = "SettingsRefused";
  }
}
